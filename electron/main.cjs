const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const fsConstants = require('node:fs').constants;
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const FFMPEG_PACKAGE_PATH = require('ffmpeg-static');
const {
  SAMPLE_RATE,
  MAX_STREAM_BYTES,
  MAX_PROXY_READ_CHUNK_BYTES,
  MAX_PROXY_OUTPUT_BYTES,
  MAX_PROXY_SOURCE_BYTES,
  VIDEO_SOURCE_EXTENSIONS,
  safeFileStem,
  validateRenderRequest,
  validateProxyRequest,
  buildProxyArgs,
  decodeJpegFrame,
  decodeFloatAudioChunk,
  buildFfmpegArgs
} = require('./video-render.cjs');

const PROJECT_FILTER = [{ name: 'Fluxivora-project', extensions: ['fluxivora', 'json'] }];
const IMAGE_FILTER = [{ name: 'Afbeeldingen', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }];
const MAX_IMAGE_BYTES = 60 * 1024 * 1024;
const MAX_EXPORT_BYTES = 220 * 1024 * 1024;
const videoRenderSessions = new Map();
const videoProxyJobs = new Map();
const videoProxyReadTokens = new Map();
const videoProxyDirectoryTokens = new Map();

function resolvedFfmpegPath() {
  if (typeof FFMPEG_PACKAGE_PATH !== 'string' || !FFMPEG_PACKAGE_PATH) {
    throw new Error('De meegeleverde FFmpeg-encoder ontbreekt in deze installatie.');
  }
  if (!app.isPackaged) return FFMPEG_PACKAGE_PATH;
  return FFMPEG_PACKAGE_PATH.replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1');
}

function proxyJobKey(ownerId, requestId) {
  return String(ownerId) + ':' + String(requestId);
}

function sendProxyProgress(session, progress, outTimeSeconds) {
  if (!session || !session.sender || session.sender.isDestroyed()) return;
  try {
    session.sender.send('video:proxy-progress', {
      requestId: session.requestId,
      progress: Math.max(0, Math.min(100, Number(progress) || 0)),
      outTimeSeconds: Math.max(0, Number(outTimeSeconds) || 0),
      durationSeconds: session.durationSeconds
    });
  } catch (_) {}
}

async function abortVideoProxy(session) {
  if (!session) return;
  session.cancelled = true;
  if (session.child && !session.closed && !session.child.killed) {
    try { session.child.kill(); } catch (_) {}
  }
  if (session.done) await Promise.race([
    session.done,
    new Promise(resolve => setTimeout(resolve, 4000))
  ]);
  try { await fs.rm(session.partialPath, { force: true }); } catch (_) {}
}

async function commitUniqueProxyOutput(partialPath, directoryPath, sourceName, preset) {
  const parsed = path.parse(String(sourceName || 'Fluxivora-video'));
  const stem = safeFileStem(parsed.name || sourceName || 'Fluxivora-video').slice(0, 72);
  const base = stem + '.proxy-' + preset;
  for (let index = 1; index <= 1000; index++) {
    const filename = base + (index === 1 ? '' : '-' + index) + '.mp4';
    const candidate = path.join(directoryPath, filename);
    try {
      // COPYFILE_EXCL makes choosing the destination atomic: concurrent exports
      // can never silently replace a proxy that another job already created.
      await fs.copyFile(partialPath, candidate, fsConstants.COPYFILE_EXCL);
      await fs.rm(partialPath, { force: true });
      return { filePath: candidate, filename };
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      try { await fs.rm(candidate, { force: true }); } catch (_) {}
      throw error;
    }
  }
  throw new Error('Er kunnen geen unieke proxybestandsnamen meer worden gemaakt in deze map.');
}

function cleanupExpiredProxyReadTokens() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [token, record] of videoProxyReadTokens) {
    if (record.createdAt < cutoff) videoProxyReadTokens.delete(token);
  }
}

function cleanupProxyOwner(ownerId) {
  for (const [token, record] of videoProxyDirectoryTokens) {
    if (record.ownerId === ownerId) videoProxyDirectoryTokens.delete(token);
  }
  for (const [token, record] of videoProxyReadTokens) {
    if (record.ownerId === ownerId) videoProxyReadTokens.delete(token);
  }
  for (const session of videoProxyJobs.values()) {
    if (session.ownerId === ownerId) void abortVideoProxy(session);
  }
}

function getVideoRenderSession(event, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length > 80) throw new Error('Ongeldige render-sessie.');
  const session = videoRenderSessions.get(sessionId);
  if (!session || session.ownerId !== event.sender.id || session.finishRequested) {
    throw new Error('De offline render-sessie bestaat niet meer of hoort bij een ander venster.');
  }
  return session;
}

function writeVideoPipeChunk(pipe, chunk, session) {
  return new Promise((resolve, reject) => {
    if (session.processError) return reject(session.processError);
    if (session.closed || session.exitCode !== undefined || !pipe || pipe.destroyed || pipe.writableEnded) {
      return reject(new Error('De FFmpeg-encoder heeft de invoerstroom gesloten.'));
    }
    let settled = false;
    const clean = () => {
      pipe.removeListener('drain', onDrain);
      pipe.removeListener('error', onError);
      pipe.removeListener('close', onClose);
    };
    const done = (error) => {
      if (settled) return;
      settled = true;
      clean();
      if (error) reject(error); else resolve();
    };
    const onDrain = () => done();
    const onError = error => done(error);
    const onClose = () => done(new Error('De FFmpeg-invoerstroom is onverwacht gesloten.'));
    pipe.once('drain', onDrain);
    pipe.once('error', onError);
    pipe.once('close', onClose);
    try {
      if (pipe.write(chunk)) done();
    } catch (error) {
      done(error);
    }
  });
}

async function abortVideoRender(session) {
  if (!session) return;
  session.cancelled = true;
  if (!session.closed && session.child && !session.child.killed) {
    try { session.child.kill(); } catch (_) {}
  }
  if (session.done) await Promise.race([
    session.done,
    new Promise(resolve => setTimeout(resolve, 4000))
  ]);
  videoRenderSessions.delete(session.id);
  try { await fs.rm(session.partialPath, { force: true }); } catch (_) {}
}
const approvedProjectPaths = new Set();
const closeStates = new WeakMap();
const CLOSE_PREPARATION_TIMEOUT_MS = 3500;

const MIME_BY_EXTENSION = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.gif': 'image/gif'
};

const { MAX_PROJECT_BYTES, canonicalPath, safeProjectStem, assertProjectJson, atomicWrite } = require('./project-store.cjs');


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

  const closeState = { allowed: false, pending: false, timeout: null };
  closeStates.set(win, closeState);
  win.on('close', (event) => {
    if (closeState.allowed || win.isDestroyed()) return;
    event.preventDefault();
    if (closeState.pending) return;
    closeState.pending = true;
    try {
      win.webContents.send('app:prepare-close');
    } catch (_) {
      closeState.allowed = true;
      closeState.pending = false;
      win.close();
      return;
    }
    // Always let the user close the app, even if the renderer hangs or crashes.
    closeState.timeout = setTimeout(() => {
      closeState.timeout = null;
      closeState.allowed = true;
      closeState.pending = false;
      if (!win.isDestroyed()) win.close();
    }, CLOSE_PREPARATION_TIMEOUT_MS);
  });
  win.on('closed', () => {
    if (closeState.timeout) clearTimeout(closeState.timeout);
    closeStates.delete(win);
  });

  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

ipcMain.on('app:close-prepared', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  const closeState = closeStates.get(win);
  if (!closeState || !closeState.pending || closeState.allowed) return;
  if (closeState.timeout) clearTimeout(closeState.timeout);
  closeState.timeout = null;
  closeState.pending = false;
  closeState.allowed = true;
  win.close();
});

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

ipcMain.handle('video:begin-render', async (event, payload = {}) => {
  const settings = validateRenderRequest(payload);
  if ([...videoRenderSessions.values()].some(session => session.ownerId === event.sender.id)) {
    throw new Error('Er loopt al een offline render in dit venster.');
  }
  const ffmpegPath = resolvedFfmpegPath();
  await fs.access(ffmpegPath);
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'Motion Studio — MP4 offline renderen',
    defaultPath: settings.name + '.mp4',
    filters: [{ name: 'MP4-video (H.264 + AAC)', extensions: ['mp4'] }]
  });
  if (result.canceled || !result.filePath) return null;
  const outputPath = path.extname(result.filePath).toLowerCase() === '.mp4' ? result.filePath : result.filePath + '.mp4';
  const id = crypto.randomUUID();
  const partialPath = path.join(path.dirname(outputPath), '.fluxivora-' + id + '.partial.mp4');
  const args = buildFfmpegArgs({
    width: settings.width,
    height: settings.height,
    fps: settings.fps,
    frameCount: settings.frameCount,
    durationSeconds: settings.durationSeconds,
    outputPath: partialPath
  });
  let child;
  try {
    child = spawn(ffmpegPath, args, { windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error('FFmpeg kon niet worden gestart: ' + error.message);
  }
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const session = {
    id, ownerId: event.sender.id, outputPath, partialPath, child, done,
    frameCount: settings.frameCount, durationSeconds: settings.durationSeconds,
    nextFrame: 0, frameBytes: 0, audioBytes: 0,
    expectedAudioBytes: Math.round(settings.durationSeconds * SAMPLE_RATE) * 2 * 4,
    finishRequested: false, closed: false, exitCode: undefined,
    exitSignal: null, processError: null, stderr: '', cancelled: false
  };
  child.once('error', error => { session.processError = error; });
  child.stdin.on('error', error => { session.processError = error; });
  child.stdio[3].on('error', error => { session.processError = error; });
  child.stderr.on('data', data => {
    session.stderr = (session.stderr + data.toString('utf8')).slice(-12000);
  });
  child.once('close', (code, signal) => {
    session.closed = true;
    session.exitCode = code;
    session.exitSignal = signal;
    resolveDone({ code, signal });
  });
  videoRenderSessions.set(id, session);
  event.sender.once('destroyed', () => { void abortVideoRender(session); });
  return { sessionId: id, frameCount: settings.frameCount, durationSeconds: settings.durationSeconds };
});

ipcMain.handle('video:write-frame', async (event, payload = {}) => {
  const session = getVideoRenderSession(event, payload.sessionId);
  if (session.nextFrame >= session.frameCount || Number(payload.index) !== session.nextFrame) {
    throw new Error('De offline renderer leverde frames niet in de juiste volgorde aan.');
  }
  const frame = decodeJpegFrame(payload.base64Data);
  if (session.frameBytes + frame.length > MAX_STREAM_BYTES) {
    await abortVideoRender(session);
    throw new Error('De framestream overschrijdt de ingestelde exportlimiet. Kies een lagere resolutie of kortere montage.');
  }
  await writeVideoPipeChunk(session.child.stdin, frame, session);
  session.frameBytes += frame.length;
  session.nextFrame++;
  return { accepted: session.nextFrame };
});

ipcMain.handle('video:write-audio', async (event, payload = {}) => {
  const session = getVideoRenderSession(event, payload.sessionId);
  const audio = decodeFloatAudioChunk(payload.base64Data);
  if (session.audioBytes + audio.length > session.expectedAudioBytes) {
    await abortVideoRender(session);
    throw new Error('De gemixte audiostream is langer dan de opgegeven montageduur.');
  }
  await writeVideoPipeChunk(session.child.stdio[3], audio, session);
  session.audioBytes += audio.length;
  return { acceptedBytes: session.audioBytes };
});

ipcMain.handle('video:finish-render', async (event, payload = {}) => {
  const session = getVideoRenderSession(event, payload.sessionId);
  if (session.nextFrame !== session.frameCount) {
    await abortVideoRender(session);
    throw new Error('De offline render is onvolledig: niet alle videoframes zijn verwerkt.');
  }
  if (session.audioBytes !== session.expectedAudioBytes) {
    await abortVideoRender(session);
    throw new Error('De gemixte audiostream is onvolledig; de MP4 is niet opgeslagen.');
  }
  session.finishRequested = true;
  session.child.stdin.end();
  session.child.stdio[3].end();
  try {
    const result = await session.done;
    if (session.processError) throw session.processError;
    if (result.code !== 0) {
      const detail = session.stderr.trim();
      throw new Error('FFmpeg kon de MP4 niet afronden' + (detail ? ': ' + detail.slice(-2400) : ' (code ' + result.code + ').'));
    }
    const stat = await fs.stat(session.partialPath);
    if (!stat.isFile() || stat.size < 1024) throw new Error('FFmpeg heeft geen geldig MP4-bestand geschreven.');
    await fs.rm(session.outputPath, { force: true });
    await fs.rename(session.partialPath, session.outputPath);
    videoRenderSessions.delete(session.id);
    return { filePath: session.outputPath, size: stat.size, durationSeconds: session.durationSeconds };
  } catch (error) {
    videoRenderSessions.delete(session.id);
    try { await fs.rm(session.partialPath, { force: true }); } catch (_) {}
    throw error;
  }
});

ipcMain.handle('video:cancel-render', async (event, payload = {}) => {
  if (typeof payload.sessionId !== 'string') return { cancelled: false };
  const session = videoRenderSessions.get(payload.sessionId);
  if (!session || session.ownerId !== event.sender.id) return { cancelled: false };
  await abortVideoRender(session);
  return { cancelled: true };
});

ipcMain.handle('video:choose-proxy-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Motion Studio — map voor proxybestanden',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const directoryPath = await fs.realpath(result.filePaths[0]);
  const stat = await fs.stat(directoryPath);
  if (!stat.isDirectory()) throw new Error('Kies een geldige map voor proxybestanden.');
  const token = crypto.randomUUID();
  videoProxyDirectoryTokens.set(token, { ownerId: event.sender.id, directoryPath });
  event.sender.once('destroyed', () => cleanupProxyOwner(event.sender.id));
  return { token, name: path.basename(directoryPath) };
});

ipcMain.handle('video:create-proxy', async (event, payload = {}) => {
  const settings = validateProxyRequest(payload);
  const jobKey = proxyJobKey(event.sender.id, settings.requestId);
  if (videoProxyJobs.has(jobKey)) throw new Error('Deze proxytaak loopt al.');
  const directoryToken = typeof payload.directoryToken === 'string' ? videoProxyDirectoryTokens.get(payload.directoryToken) : null;
  if (!directoryToken || directoryToken.ownerId !== event.sender.id) {
    throw new Error('Kies eerst via Fluxivora een map voor de gegenereerde proxybestanden.');
  }
  const sourcePath = typeof payload.sourcePath === 'string' && payload.sourcePath.length <= 4096 ? payload.sourcePath : '';
  if (!sourcePath || !path.isAbsolute(sourcePath) || !VIDEO_SOURCE_EXTENSIONS.includes(path.extname(sourcePath).toLowerCase())) {
    throw new Error('De bron is geen ondersteund videobestand op schijf.');
  }
  const session = {
    requestId: settings.requestId,
    ownerId: event.sender.id,
    sender: event.sender,
    outputPath: null,
    partialPath: null,
    durationSeconds: settings.durationSeconds,
    child: null,
    done: null,
    closed: false,
    cancelled: false,
    processError: null,
    stderr: '',
    progressBuffer: ''
  };
  videoProxyJobs.set(jobKey, session);
  event.sender.once('destroyed', () => { void abortVideoProxy(session); });

  try {
    if (session.cancelled) throw new Error('Proxy-generatie is geannuleerd.');
    const sourceStat = await fs.stat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.size < 1 || sourceStat.size > MAX_PROXY_SOURCE_BYTES) {
      throw new Error('De videobron is leeg of groter dan de limiet van 20 GB.');
    }
    if (session.cancelled) throw new Error('Proxy-generatie is geannuleerd.');
    const ffmpegPath = resolvedFfmpegPath();
    await fs.access(ffmpegPath);
    if (session.cancelled) throw new Error('Proxy-generatie is geannuleerd.');
    // Write to a unique temporary file first. The final name is claimed atomically
    // only after FFmpeg has finished, so concurrent jobs cannot overwrite one another.
    session.partialPath = path.join(directoryToken.directoryPath, '.fluxivora-proxy-' + crypto.randomUUID() + '.partial.mp4');
    if (session.cancelled) throw new Error('Proxy-generatie is geannuleerd.');
    const args = buildProxyArgs({ inputPath: sourcePath, outputPath: session.partialPath, preset: settings.preset });
    const child = spawn(ffmpegPath, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    session.child = child;
    session.done = new Promise(resolve => {
      child.once('close', (code, signal) => {
        session.closed = true;
        resolve({ code, signal });
      });
    });
    child.once('error', error => { session.processError = error; });
    child.stderr.on('data', data => {
      session.stderr = (session.stderr + data.toString('utf8')).slice(-12000);
    });
    child.stdout.on('data', data => {
      session.progressBuffer += data.toString('utf8');
      const lines = session.progressBuffer.split(/\r?\n/);
      session.progressBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('out_time_us=')) {
          const seconds = Number(line.slice('out_time_us='.length)) / 1000000;
          if (Number.isFinite(seconds)) {
            const progress = session.durationSeconds > 0 ? seconds / session.durationSeconds * 100 : 0;
            sendProxyProgress(session, progress, seconds);
          }
        } else if (line.startsWith('out_time_ms=')) {
          const seconds = Number(line.slice('out_time_ms='.length)) / 1000000;
          if (Number.isFinite(seconds)) {
            const progress = session.durationSeconds > 0 ? seconds / session.durationSeconds * 100 : 0;
            sendProxyProgress(session, progress, seconds);
          }
        } else if (line === 'progress=end') {
          sendProxyProgress(session, 100, session.durationSeconds);
        }
      }
    });
    if (session.cancelled) {
      try { child.kill(); } catch (_) {}
    }
    const result = await session.done;
    if (session.cancelled) throw new Error('Proxy-generatie is geannuleerd.');
    if (session.processError) throw session.processError;
    if (result.code !== 0) {
      const detail = session.stderr.trim();
      throw new Error('FFmpeg kon de proxy niet maken' + (detail ? ': ' + detail.slice(-2000) : ' (code ' + result.code + ').'));
    }
    const stat = await fs.stat(session.partialPath);
    if (session.cancelled) throw new Error('Proxy-generatie is geannuleerd.');
    if (!stat.isFile() || stat.size < 1024) throw new Error('FFmpeg heeft geen geldige proxy geschreven.');
    if (stat.size > MAX_PROXY_OUTPUT_BYTES) throw new Error('De proxy is groter dan de toegestane limiet van 350 MB. Kies een lagere resolutie.');
    const committed = await commitUniqueProxyOutput(
      session.partialPath, directoryToken.directoryPath, settings.sourceName, settings.preset
    );
    session.outputPath = committed.filePath;
    session.partialPath = null;
    cleanupExpiredProxyReadTokens();
    const readToken = crypto.randomUUID();
    videoProxyReadTokens.set(readToken, {
      ownerId: event.sender.id,
      filePath: session.outputPath,
      size: stat.size,
      createdAt: Date.now()
    });
    sendProxyProgress(session, 100, settings.durationSeconds);
    return {
      readToken,
      name: committed.filename,
      size: stat.size,
      preset: settings.preset,
      durationSeconds: settings.durationSeconds
    };
  } catch (error) {
    if (session.partialPath) {
      try { await fs.rm(session.partialPath, { force: true }); } catch (_) {}
    }
    throw error;
  } finally {
    videoProxyJobs.delete(jobKey);
  }
});

ipcMain.handle('video:cancel-proxy', async (event, payload = {}) => {
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
  if (!/^[a-z0-9_-]{1,80}$/i.test(requestId)) return { cancelled: false };
  const session = videoProxyJobs.get(proxyJobKey(event.sender.id, requestId));
  if (!session) return { cancelled: false };
  session.cancelled = true;
  if (session.child && !session.closed && !session.child.killed) {
    try { session.child.kill(); } catch (_) {}
  }
  return { cancelled: true };
});

ipcMain.handle('video:read-proxy-chunk', async (event, payload = {}) => {
  const token = typeof payload.readToken === 'string' ? videoProxyReadTokens.get(payload.readToken) : null;
  if (!token || token.ownerId !== event.sender.id) throw new Error('De proxy-leessessie bestaat niet meer of hoort bij een ander venster.');
  const offset = Number(payload.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= token.size) throw new RangeError('Ongeldige proxy-chunk-offset.');
  const length = Math.min(MAX_PROXY_READ_CHUNK_BYTES, token.size - offset);
  const handle = await fs.open(token.filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    if (!bytesRead) throw new Error('Het proxybestand kon niet volledig worden gelezen.');
    return {
      base64Data: buffer.subarray(0, bytesRead).toString('base64'),
      bytesRead,
      totalBytes: token.size
    };
  } finally {
    await handle.close();
  }
});

ipcMain.handle('video:release-proxy-read', async (event, payload = {}) => {
  const tokenId = typeof payload.readToken === 'string' ? payload.readToken : '';
  const token = videoProxyReadTokens.get(tokenId);
  if (token && token.ownerId === event.sender.id) videoProxyReadTokens.delete(tokenId);
  return { released: !!token && token.ownerId === event.sender.id };
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
