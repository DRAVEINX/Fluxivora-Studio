const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const PROJECT_FILTER = [{ name: 'Fluxivora-project', extensions: ['fluxivora', 'json'] }];
const IMAGE_FILTER = [{ name: 'Afbeeldingen', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }];
const MAX_PROJECT_BYTES = 180 * 1024 * 1024;
const MAX_IMAGE_BYTES = 60 * 1024 * 1024;
const MAX_EXPORT_BYTES = 220 * 1024 * 1024;
const approvedProjectPaths = new Set();

const MIME_BY_EXTENSION = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.gif': 'image/gif'
};

function canonicalPath(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
}

function safeProjectStem(value) {
  const cleaned = String(value || 'Mijn ontwerp').replace(/[<>:\"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/g, '').trim().slice(0, 80);
  return cleaned || 'Mijn ontwerp';
}

function assertProjectJson(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_PROJECT_BYTES) {
    throw new Error('Het projectbestand is te groot of ongeldig.');
  }
  let project;
  try { project = JSON.parse(json); } catch (_) { throw new Error('Het projectbestand bevat geen geldige JSON.'); }
  if (!project || Array.isArray(project) || project.format !== 'fluxivora-project') {
    throw new Error('Dit is geen geldig Fluxivora-projectbestand.');
  }
  return project;
}

async function atomicWrite(filePath, data, options = {}) {
  const tempPath = `${filePath}.fluxivora-${process.pid}-${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, data, options);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#090b12',
    title: 'Fluxivora Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('project:open', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: 'Project openen',
    properties: ['openFile'],
    filters: PROJECT_FILTER
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size < 2 || stat.size > MAX_PROJECT_BYTES) {
    throw new Error('Het projectbestand is te groot of geen normaal bestand.');
  }
  const json = await fs.readFile(filePath, 'utf8');
  assertProjectJson(json);
  approvedProjectPaths.add(canonicalPath(filePath));
  return { filePath, json };
});

ipcMain.handle('project:save', async (_event, payload = {}) => {
  const win = BrowserWindow.getFocusedWindow();
  assertProjectJson(payload.json);
  let filePath = typeof payload.filePath === 'string' && payload.filePath.length <= 4096 ? payload.filePath : null;
  if (filePath && !approvedProjectPaths.has(canonicalPath(filePath))) {
    throw new Error('Deze bestandslocatie is niet via Fluxivora gekozen. Gebruik “Opslaan als”.');
  }
  if (!filePath) {
    const result = await dialog.showSaveDialog(win, {
      title: 'Project opslaan',
      defaultPath: `${safeProjectStem(payload.name)}.fluxivora`,
      filters: PROJECT_FILTER
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
    if (!['.fluxivora', '.json'].includes(path.extname(filePath).toLowerCase())) filePath += '.fluxivora';
    approvedProjectPaths.add(canonicalPath(filePath));
  }
  await atomicWrite(filePath, payload.json, { encoding: 'utf8', mode: 0o600 });
  return { filePath };
});

ipcMain.handle('image:open', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: 'Afbeelding importeren',
    properties: ['openFile'],
    filters: IMAGE_FILTER
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const extension = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension];
  if (!mime) throw new Error('Dit afbeeldingsformaat wordt niet ondersteund.');
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_IMAGE_BYTES) {
    throw new Error('Afbeeldingen moeten kleiner zijn dan 60 MB.');
  }
  const data = await fs.readFile(filePath);
  return { filePath, name: path.basename(filePath), dataUrl: `data:${mime};base64,${data.toString('base64')}` };
});

const recoveryFilePath = () => path.join(app.getPath('userData'), 'recovery', 'last-session.json');
const MAX_RECOVERY_BYTES = 180 * 1024 * 1024;

ipcMain.handle('recovery:read', async () => {
  try {
    const filePath = recoveryFilePath();
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size < 2 || stat.size > MAX_RECOVERY_BYTES) {
      await fs.unlink(filePath).catch(() => {});
      return null;
    }
    const recovery = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (recovery?.format !== 'fluxivora-recovery' || typeof recovery.json !== 'string' || recovery.json.length > MAX_RECOVERY_BYTES) {
      await fs.unlink(filePath).catch(() => {});
      return null;
    }
    const project = JSON.parse(recovery.json);
    if (project?.format !== 'fluxivora-project') {
      await fs.unlink(filePath).catch(() => {});
      return null;
    }
    return {
      json: recovery.json,
      filePath: typeof recovery.filePath === 'string' && recovery.filePath.length <= 4096 ? recovery.filePath : null,
      updatedAt: typeof recovery.updatedAt === 'string' ? recovery.updatedAt.slice(0, 80) : null
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('Recovery read failed:', error?.message || 'unknown error');
    return null;
  }
});

ipcMain.handle('recovery:write', async (_event, payload = {}) => {
  if (typeof payload.json !== 'string' || Buffer.byteLength(payload.json, 'utf8') > MAX_RECOVERY_BYTES) {
    throw new Error('De herstelkopie is te groot of ongeldig.');
  }
  let project;
  try { project = JSON.parse(payload.json); } catch (_) { throw new Error('De herstelkopie bevat geen geldige projectdata.'); }
  if (!project || project.format !== 'fluxivora-project') throw new Error('Alleen Fluxivora-projecten kunnen worden hersteld.');
  const record = JSON.stringify({
    format: 'fluxivora-recovery',
    json: payload.json,
    filePath: typeof payload.filePath === 'string' && payload.filePath.length <= 4096 ? payload.filePath : null,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt.slice(0, 80) : new Date().toISOString()
  });
  if (Buffer.byteLength(record, 'utf8') > MAX_RECOVERY_BYTES) throw new Error('De herstelkopie is groter dan de toegestane limiet.');
  const filePath = recoveryFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // Use the same atomic replacement strategy as project saves. Unique temporary
  // names prevent overlapping autosave requests from writing to the same temp file.
  await atomicWrite(filePath, record, { encoding: 'utf8', mode: 0o600 });
  return true;
});

ipcMain.handle('recovery:clear', async () => {
  await fs.unlink(recoveryFilePath()).catch(error => { if (error?.code !== 'ENOENT') throw error; });
  await fs.unlink(`${recoveryFilePath()}.tmp`).catch(error => { if (error?.code !== 'ENOENT') throw error; });
  return true;
});

ipcMain.handle('file:export', async (_event, payload = {}) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showSaveDialog(win, {
    title: payload.title || 'Exporteren',
    defaultPath: payload.suggestedName || 'Fluxivora-export.png',
    filters: payload.filters || []
  });
  if (result.canceled || !result.filePath) return null;
  let data;
  if (typeof payload.base64Data === 'string' && payload.base64Data.length > 0) {
    if (payload.base64Data.length > Math.ceil(MAX_EXPORT_BYTES / 3) * 4 + 8 || !/^[a-z0-9+/]*={0,2}$/i.test(payload.base64Data)) {
      throw new Error('De export is te groot of bevat ongeldige data.');
    }
    data = Buffer.from(payload.base64Data, 'base64');
  } else if (typeof payload.content === 'string') {
    data = Buffer.from(payload.content, 'utf8');
  } else {
    throw new Error('Er is geen geldige exportinhoud aangeleverd.');
  }
  if (data.byteLength > MAX_EXPORT_BYTES) throw new Error('De export is groter dan de toegestane limiet van 220 MB.');
  await atomicWrite(result.filePath, data, { mode: 0o600 });
  return { filePath: result.filePath };
});
