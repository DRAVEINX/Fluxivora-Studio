const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8');

test('HTML-ID’s zijn uniek', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, [], `Dubbele HTML-ID’s: ${duplicates.join(', ')}`);
});

test('alle statische app-selectors verwijzen naar bestaande HTML-elementen', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const references = [...app.matchAll(/\$\('([^'`$]+)'\)/g)].map(match => match[1]);
  const missing = [...new Set(references.filter(id => !ids.has(id)))];
  assert.deepEqual(missing, [], `Ontbrekende HTML-elementen: ${missing.join(', ')}`);
});


test('laag- en zoombediening zijn aanwezig in de interface', () => {
  for (const id of ['zoom-in-button', 'zoom-out-button', 'layer-list']) {
    assert.match(html, new RegExp(`id="${id}"`), `Ontbrekend UI-element: ${id}`);
  }
  assert.match(app, /function setLayerProperty\(/);
  assert.match(app, /function setZoom\(/);
  assert.match(app, /obj\.visible === false/);
  assert.match(app, /target\.locked/);
});


test('preload bevat alleen expliciete methoden voor lokale herstelkopieën', () => {
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  for (const method of ['readRecovery', 'writeRecovery', 'clearRecovery']) {
    assert.match(preload, new RegExp(`${method}:`));
  }
  assert.match(main, /path\.join\(app\.getPath\('userData'\), 'recovery', 'last-session\.json'\)/);
  assert.match(main, /project\?\.format !== 'fluxivora-project'/);
  assert.doesNotMatch(preload, /require\(['"]node:fs/);
});


test('herstelkopie wordt gepland bij wijzigingen en verwijderd na opslaan of weggooien', () => {
  assert.match(app, /function scheduleRecoverySnapshot\(/);
  assert.match(app, /function offerRecoveryIfAvailable\(/);
  assert.match(app, /await clearRecoverySnapshot\(\)/);
  assert.match(app, /cancelText: 'Verwijderen'/);
  assert.match(app, /Niet-opgeslagen werk gevonden/);
});


test('driehoek- en stertools zijn beschikbaar in de drie werkruimtes', () => {
  const toolsetStart = app.indexOf('const toolsets = {');
  const toolsetEnd = app.indexOf('let recoveryTimer', toolsetStart);
  const toolsetSource = app.slice(toolsetStart, toolsetEnd);
  assert.equal((toolsetSource.match(/\['triangle',/g) || []).length, 3);
  assert.equal((toolsetSource.match(/\['star',/g) || []).length, 3);
  assert.match(app, /Core\.polygonPoints\(obj\.polygonKind/);
  assert.match(app, /svgEl\('polygon'/);
  assert.match(app, /obj\.type === 'polygon'/);
});

test('IPC-bestandsacties begrenzen invoer en gebruiken atomische opslag', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /MAX_PROJECT_BYTES/);
  assert.match(main, /MAX_IMAGE_BYTES = 60 \* 1024 \* 1024/);
  assert.match(main, /MAX_EXPORT_BYTES = 220 \* 1024 \* 1024/);
  assert.match(main, /assertProjectJson\(payload\.json\)/);
  assert.match(main, /approvedProjectPaths\.has\(canonicalPath\(filePath\)\)/);
  assert.match(main, /await atomicWrite\(filePath, payload\.json/);
  assert.match(main, /await atomicWrite\(result\.filePath, data/);
});


test('herstelkopieën gebruiken atomische opslag met unieke tijdelijke bestanden', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const store = fs.readFileSync(path.join(root, 'electron', 'project-store.cjs'), 'utf8');
  assert.ok(store.includes("const { randomUUID } = require('node:crypto')"));
  assert.ok(store.includes("const tempPath = `${destination}.fluxivora-${process.pid}-${randomUUID()}.tmp`"));
  assert.match(store, /const previous = pendingWrites\.get\(key\) \|\| Promise\.resolve\(\)/);
  assert.match(store, /pendingWrites\.set\(key, operation\)/);
  const recoveryHandler = main.slice(main.indexOf("ipcMain.handle('recovery:write'"));
  assert.ok(recoveryHandler.includes("await atomicWrite(filePath, record, { encoding: 'utf8', mode: 0o600 })"), 'herstelkopie moet via de atomische opslaghelper worden geschreven');
  assert.ok(store.includes('await fs.unlink(tempPath).catch(() => {})'));
});

test('Windows-buildworkflows proberen npm-registryfouten opnieuw en gebruiken expliciete registry', () => {
  for (const workflowPath of [
    path.join(root, '.github', 'workflows', 'windows-build.yml'),
    path.join(root, '.github', 'workflows', 'windows-release.yml')
  ]) {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    assert.match(workflow, /https:\/\/registry\.npmjs\.org\//);
    assert.match(workflow, /https:\/\/registry\.npmmirror\.com\//);
    assert.match(workflow, /attemptsPerRegistry = 2/);
    assert.match(workflow, /fetch-retries=3/);
    assert.match(workflow, /fetch-timeout=180000/);
    assert.match(workflow, /foreach \(\$registry in \$registries\)/);
  }
});

test('pakket-, core- en zichtbare versienummers zijn gelijk', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const core = fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8');
  assert.equal(pkg.version, '0.5.0-beta.8');
  assert.match(core, new RegExp(`const VERSION = '${pkg.version.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}'`));
  assert.match(html, new RegExp(`<b>${pkg.version.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}</b>`));
});


test('object-inspector biedt positie, formaat, verhouding en rotatie', () => {
  for (const id of ['object-x', 'object-y', 'object-width', 'object-height', 'keep-aspect', 'object-rotation']) {
    assert.match(html, new RegExp(`id="${id}"`), `Ontbrekend objectveld: ${id}`);
  }
  assert.match(app, /Core\.resizeObject\(obj/);
  assert.match(app, /Core\.rotateObject\(obj/);
  assert.match(app, /function commonSvgAttrs\(obj\)/);
});


test('Pixel Lab roteert objecten rond hun middelpunt', () => {
  assert.match(app, /const rotation = Number\(obj\.rotation \|\| 0\)/);
  assert.match(app, /ctx\.rotate\(rotation \* Math\.PI \/ 180\)/);
  assert.match(app, /ctx\.translate\(-cx, -cy\)/);
});


test('Pixel Lab heeft bijsnijdbediening en een veilige validatie voor uitsneden', () => {
  for (const id of ['crop-x', 'crop-y', 'crop-width', 'crop-height', 'crop-apply-button']) {
    assert.match(html, new RegExp(`id="${id}"`), `Ontbrekend bijsnijdelement: ${id}`);
  }
  assert.match(app, /function applyPixelCrop\(/);
  assert.match(app, /x \+ width > doc\.width/);
  assert.match(app, /obj\.points/);
  assert.match(app, /checkpoint\(\);\s*doc\.baseImage = croppedDataUrl/);
});


test('Vector Forge heeft een Bézier-pen met afsluiten via dubbelklik of Enter', () => {
  assert.match(app, /\['bezier',/);
  assert.match(app, /function finishBezierPath\(/);
  assert.match(app, /finishBezierPath\(\)/);
  // Version consistency is covered by the dedicated package/core/HTML contract test.
});

test('Bézier-paden worden als vloeiende kubische SVG-curves geëxporteerd', () => {
  const core = require('../src/core.js');
  const d = core.smoothPathData([{ x: 0, y: 0 }, { x: 20, y: 30 }, { x: 50, y: 10 }]);
  assert.match(d, /^M 0 0 C /);
  assert.match(d, / C .* 50 10$/);
  const project = core.createProject('vector');
  project.vector.objects.push(core.makeObject('bezier', 0, 0, 0, 0, { points: [{ x: 0, y: 0 }, { x: 20, y: 30 }, { x: 50, y: 10 }], stroke: '#111111', fill: 'none' }));
  assert.match(core.serializeSvg(project.vector.width, project.vector.height, project.vector.objects), /<path d="M 0 0 C /);
});


test('Vector Forge toont versleepbare ankerpunten voor geselecteerde Bézier-curves', () => {
  assert.match(app, /data-point-index/);
  assert.match(app, /state\.dragMode === 'point'/);
  assert.match(app, /anchor\.x = point\.x; anchor\.y = point\.y/);
  assert.match(app, /Bézier-anker aangepast/);
  assert.match(app, /selected\.type === 'bezier' && state\.currentTool === 'select'/);
});


test('Vector Forge toont en verwerkt versleepbare Bézier-handgrepen', () => {
  assert.match(app, /data-handle-type/);
  assert.match(app, /state\.dragMode = state\.bezierHandleType \? 'handle' : 'point'/);
  assert.match(app, /anchor\[state\.bezierHandleType\] = \{ x: point\.x, y: point\.y \}/);
  assert.match(core, /function bezierSegmentHandles\(/);
});

test('Vector Forge exposes safe Bézier anchor insertion and deletion controls', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const core = require('../src/core.js');
  assert.match(html, /id="add-bezier-point-button"/);
  assert.match(html, /id="delete-bezier-point-button"/);
  assert.match(app, /function addBezierAnchor\(/);
  assert.match(app, /function deleteBezierAnchor\(/);
  assert.match(app, /Core\.splitBezierSegment\(/);
  assert.match(app, /Core\.deleteBezierAnchor\(/);
  assert.equal(typeof core.splitBezierSegment, 'function');
  assert.equal(typeof core.deleteBezierAnchor, 'function');
});


test('object-inspector bevat zes canvas-uitlijnacties die alle via één veilige handler lopen', () => {
  for (const id of ['align-left-button', 'align-center-x-button', 'align-right-button', 'align-top-button', 'align-center-y-button', 'align-bottom-button']) {
    assert.match(html, new RegExp(`id="${id}"`), `Ontbrekende uitlijnactie: ${id}`);
  }
  assert.match(app, /function alignSelectedToCanvas\(alignment\)/);
  assert.match(app, /bounds\.x/);
  assert.match(app, /canvas\.width - bounds\.w - bounds\.x/);
  assert.match(app, /canvas\.height - bounds\.h - bounds\.y/);
  assert.match(app, /point\[name\]\.x \+= dx/);
  assert.match(app, /markDirty\('Object uitgelijnd'\)/);
});


test('PNG- en SVG-export ondersteunen transparante achtergronden zonder de standaard te wijzigen', () => {
  assert.match(html, /id="export-transparent-background"/);
  assert.match(app, /if \(!\$\('export-transparent-background'\)\.checked\) \{ ctx\.fillStyle = '#ffffff'/);
  assert.match(app, /const svgOptions = \$\('export-transparent-background'\)\.checked \? \{\} : \{ background: '#ffffff' \}/);
  assert.match(html, /PDF-pagina’s blijven wit/);
});


test('Page Studio heeft papierformaten voor consistente PDF-export', () => {
  for (const id of ['page-format-select', 'apply-page-format-button']) assert.match(html, new RegExp(`id="${id}"`));
  for (const format of ['a4-portrait', 'a4-landscape', 'a5-portrait', 'letter-portrait']) assert.match(app, new RegExp(`'${format}'`));
  assert.match(app, /function applyPageFormat\(/);
  assert.match(app, /@page \{ size: \$\{format\.cssSize\}; margin: 0; \}/);
  assert.match(app, /pagesToPrint\.forEach/);
});


test('PDF-export ruimt de printweergave en tijdelijke paginastijlen op na afdrukken', () => {
  assert.match(app, /function exportLayoutPdf\(\)/);
  assert.match(app, /window\.addEventListener\('afterprint', cleanupPrintExport\)/);
  assert.match(app, /print\.replaceChildren\(\)/);
  assert.match(app, /printStyle\.remove\(\)/);
  assert.match(app, /window\.removeEventListener\('afterprint', cleanupPrintExport\)/);
});


test('Windows-releaseworkflow valideert de tag en publiceert alleen na tests en build', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'windows-release.yml'), 'utf8');
  assert.match(workflow, /tags:\s*\n\s*- "v\*"/);
  assert.match(workflow, /packageVersion -ne \$tagVersion/);
  assert.ok(workflow.indexOf('run: npm test') < workflow.indexOf('run: npm run dist:win'));
  assert.ok(workflow.indexOf('run: npm run dist:win') < workflow.indexOf('softprops/action-gh-release@v2'));
  assert.match(workflow, /permissions:\s*\n\s*contents: write/);
  assert.match(workflow, /release\/\*\.exe/);
});


test('Pixel Lab biedt schaalbare PNG-export met geheugenlimieten', () => {
  assert.match(html, /id="export-scale-select"/);
  assert.match(html, /value="2">2×/);
  assert.match(app, /const outputWidth = width \* scale/);
  assert.match(app, /outputWidth \* outputHeight > 50000000/);
  assert.match(app, /ctx\.scale\(scale, scale\)/);
  assert.match(app, /canvas\.width, canvas\.height/);
});


test('Windows-builds controleren de installer en publiceren een SHA-256-checksum', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const name of ['windows-build.yml', 'windows-release.yml']) {
    const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows', name), 'utf8');
    assert.match(workflow, /Verify installer and create checksum manifest/);
    assert.match(workflow, /Geen Windows-installer gevonden/);
    assert.match(workflow, /Get-FileHash -Path .* -Algorithm SHA256/);
    assert.match(workflow, /SHA256SUMS\.txt/);
    assert.ok(workflow.indexOf('run: npm run dist:win') < workflow.indexOf('Verify installer and create checksum manifest'));
  }
});


test('objecten kunnen intern worden gekopieerd en geplakt via sneltoetsen', () => {
  assert.match(app, /function copySelected\(\)/);
  assert.match(app, /function pasteCopied\(\)/);
  assert.match(app, /Core\.duplicateObject\(state\.clipboardObject, 20\)/);
  assert.match(app, /event\.key\.toLowerCase\(\) === 'c'.*copySelected/s);
  assert.match(app, /event\.key\.toLowerCase\(\) === 'v'.*pasteCopied/s);
  assert.match(app, /duplicate\.locked = false/);
});


test('editor-sneltoetsen laten native tekstbewerking in invoervelden intact', () => {
  assert.match(app, /const editingText = \['INPUT', 'TEXTAREA'\]\.includes\(tag\) \|\| activeElement\?\.isContentEditable === true/);
  assert.match(app, /const shortcutEditingAllowed = !editingText && tag !== 'SELECT'/);
  assert.match(app, /shortcutEditingAllowed && mod && event\.key\.toLowerCase\(\) === 'z'/);
  assert.match(app, /shortcutEditingAllowed && mod && \(event\.key\.toLowerCase\(\) === 'y'/);
  assert.match(app, /event\.key === 'Delete' && shortcutEditingAllowed/);
});

test('Ctrl+muiswiel zoomt rond de cursor en voorkomt browserzoom', () => {
  assert.match(app, /canvasScroll\.addEventListener\('wheel'/);
  assert.match(app, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /localX \* state\.zoom - event\.clientX/);
  assert.match(app, /Knoppen, Ctrl \+ muiswiel of Ctrl \+ \+\/-/);
});

test('canvas kan worden gepand zonder de objecten te wijzigen', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(app, /Space\+left-drag or middle-drag/);
  assert.match(app, /event\.button === 1/);
  assert.match(app, /state\.spaceHeld = true/);
  assert.match(app, /canvasScroll\.scrollLeft = state\.panDrag\.left/);
  assert.match(css, /canvas-scroll\.panning/);
});

test('objecten kunnen nauwkeurig worden verplaatst met pijltjestoetsen zonder tekstvelden te storen', () => {
  assert.match(app, /function nudgeSelected\(dx, dy, recordHistory = true\)/);
  assert.match(app, /event\.shiftKey \? 10 : 1/);
  assert.match(app, /nudgeSelected\(delta\[0\], delta\[1\], !event\.repeat\)/);
  assert.match(app, /Ontgrendel deze laag voordat je haar verplaatst/);
  assert.match(app, /point\[handleName\]\.x = .*\+ dx/);
  assert.match(app, /point\[handleName\]\.y = .*\+ dy/);
});


test('zoom heeft Ctrl/Cmd-sneltoetsen en past canvas opnieuw aan met Ctrl/Cmd+0', () => {
  assert.match(app, /shortcutEditingAllowed && mod && \['=', '\+'\]\.includes\(event\.key\)/);
  assert.match(app, /shortcutEditingAllowed && mod && \['-', '_'\]\.includes\(event\.key\)/);
  assert.match(app, /shortcutEditingAllowed && mod && event\.key === '0'.*state\.zoom = 0/s);
  assert.match(app, /\['Aanpassen aan scherm', 'Ctrl \+ 0'\]/);
});

test('window-close handler does not block Electron closing while requesting recovery', () => {
  const handler = app.match(/window\.addEventListener\('beforeunload'[^\n]+/);
  assert.ok(handler, 'beforeunload-handler ontbreekt');
  assert.match(handler[0], /persistRecoverySnapshot\(\)/, 'Laatste herstelkopie wordt niet aangevraagd');
  assert.doesNotMatch(handler[0], /preventDefault|returnValue/, 'beforeunload blokkeert het sluiten van het venster');
});

test('openen van een ander project bewaart eerst wijzigingen van het huidige project', () => {
  assert.match(app, /async function openProjectFile\(\)/);
  assert.match(app, /async function openProject\(\)/);
  assert.match(app, /if \(state\.project && state\.dirty\) \{\s*showModal\(\{/);
  assert.match(app, /title: 'Niet-opgeslagen wijzigingen'/);
  assert.match(app, /confirmText: 'Opslaan en openen'/);
  assert.match(app, /const saved = await saveProject\(\);\s*if \(!saved\) return false;\s*await openProjectFile\(\);/);
});

test('saveProject reports cancellation or failure and confirms success only after saving', () => {
  const start = app.indexOf('async function saveProject(');
  assert.notEqual(start, -1, 'saveProject ontbreekt');
  const end = app.indexOf('\n  }', start);
  const source = app.slice(start, end);
  assert.match(source, /if \(!state\.project\) return false/);
  assert.match(source, /if \(!result\) return false/);
  assert.match(source, /await markSaved\(\)/);
  assert.match(source, /return true/);
  assert.match(source, /catch \(err\)[\s\S]*?return false/);
});

test('nieuw ontwerp overschrijft geen niet-opgeslagen project zonder eerst op te slaan', () => {
  assert.match(app, /const workspace = state\.modalWorkspace;\s*if \(state\.project && state\.dirty\)/);
  assert.match(app, /title: 'Niet-opgeslagen wijzigingen'[\s\S]*?confirmText: 'Opslaan en nieuw ontwerp'/);
  assert.match(app, /const saved = await saveProject\(\);\s*if \(!saved\) return false;\s*createProject\(workspace, name\);/);
});

test('graceful sluiten wacht op een herstelkopie maar heeft een vaste timeout', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
  assert.match(main, /win\.on\('close'/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.match(main, /win\.webContents\.send\('app:prepare-close'\)/);
  assert.match(main, /CLOSE_PREPARATION_TIMEOUT_MS = 3500/);
  assert.match(main, /ipcMain\.on\('app:close-prepared'/);
  assert.match(main, /BrowserWindow\.fromWebContents\(event\.sender\)/);
  assert.match(preload, /onPrepareClose:/);
  assert.match(preload, /confirmClose: \(\) => ipcRenderer\.send\('app:close-prepared'\)/);
  assert.match(app, /await persistRecoverySnapshot\(\)/);
  assert.match(app, /closePreparationCompleted = true/);
});

test('Startscherm bewaart de actieve werkruimte zolang er een project geladen is', () => {
  assert.match(app, /function showWelcome\(\) \{\s*\/\/ Keep a loaded project's active workspace valid while showing the welcome screen\.\s*if \(!state\.project\) state\.activeWorkspace = 'home';/);
  assert.match(app, /function updateTitle\(\)/);
  assert.match(app, /descriptions\[state\.activeWorkspace\]\.title/);
});


test('app gebruikt de begrensde core-historymanager voor checkpoint, undo en redo', () => {
  assert.match(app, /Core\.recordProjectHistory\(state\.undoStack, state\.redoStack, state\.project, 60\)/);
  assert.match(app, /Core\.undoProjectHistory\(state\.undoStack, state\.redoStack, state\.project, 60\)/);
  assert.match(app, /Core\.redoProjectHistory\(state\.undoStack, state\.redoStack, state\.project, 60\)/);
  assert.match(core, /function recordProjectHistory\(/);
  assert.match(core, /function undoProjectHistory\(/);
  assert.match(core, /function redoProjectHistory\(/);
});

test('vector- en paginaobjecten krijgen een startpointer en schrijven geschiedenis pas bij echte beweging', () => {
  const downStart = app.indexOf('function svgPointerDown(');
  const moveStart = app.indexOf('function svgPointerMove(', downStart);
  const upStart = app.indexOf('function svgPointerUp(', moveStart);
  assert.ok(downStart >= 0 && moveStart > downStart && upStart > moveStart);
  const down = app.slice(downStart, moveStart);
  const move = app.slice(moveStart, upStart);
  assert.match(down, /state\.lastPointer = point/);
  assert.doesNotMatch(down.match(/if \(state\.currentTool === 'select'\) \{[\s\S]*?renderAll\(\); return;/)?.[0] || '', /checkpoint\(\)/);
  assert.match(move, /if \(dx === 0 && dy === 0\) return/);
  assert.match(move, /checkpointDragMutation\(\)/);
  assert.match(app, /function checkpointDragMutation\(\) \{\s*if \(state\.dragHistoryRecorded\) return;\s*checkpoint\(\);\s*state\.dragHistoryRecorded = true;/);
  assert.match(move, /state\.dragHasMoved = true/);
});

test('click-selectie in Pixel Lab maakt geen undo-stap en markeert niets als gewijzigd', () => {
  const downStart = app.indexOf('function pixelPointerDown(');
  const moveStart = app.indexOf('function pixelPointerMove(', downStart);
  const upStart = app.indexOf('function pixelPointerUp(', moveStart);
  assert.ok(downStart >= 0 && moveStart > downStart && upStart > moveStart);
  const down = app.slice(downStart, moveStart);
  const move = app.slice(moveStart, upStart);
  const up = app.slice(upStart, app.indexOf('\n  function ', upStart + 10));
  assert.doesNotMatch(down.match(/if \(state\.currentTool === 'select'\) \{[\s\S]*?renderAll\(\); return;/)?.[0] || '', /checkpoint\(\)/);
  assert.match(move, /if \(dx === 0 && dy === 0\) return/);
  assert.match(up, /const didMove = state\.dragHasMoved/);
  assert.match(up, /if \(didMove\) markDirty\(\)/);
});


test('projectnaam wijzigen is ongedaan te maken en een ongewijzigde naam maakt geen geschiedenisstap', () => {
  const start = app.indexOf("$('project-name').addEventListener('change'");
  const end = app.indexOf('\n  });', start);
  assert.ok(start >= 0 && end > start, 'Projectnaam-handler ontbreekt');
  const handler = app.slice(start, end);
  assert.match(handler, /const nextName = .*project-name.*value\.trim\(\)/);
  assert.match(handler, /if \(nextName === state\.project\.name\) return/);
  assert.match(handler, /checkpoint\(\);\s*state\.project\.name = nextName/);
});

test('afbeeldingen invoegen in Vector Forge en Page Studio krijgt een undo-checkpoint', () => {
  const start = app.indexOf('async function importImage()');
  const end = app.indexOf('\n  async function openProjectFile()', start);
  assert.ok(start >= 0 && end > start, 'importImage-handler ontbreekt');
  const handler = app.slice(start, end);
  const insertion = handler.indexOf("const obj = Core.makeObject('image'");
  assert.ok(insertion > 0, 'Afbeeldingsobject wordt niet aangemaakt');
  const checkpointIndex = handler.lastIndexOf('checkpoint();', insertion);
  const pushIndex = handler.indexOf('activeObjects().push(obj)', insertion);
  assert.ok(checkpointIndex >= 0 && checkpointIndex < insertion, 'Geen geschiedenischeckpoint vóór afbeeldingsinvoeging');
  assert.ok(pushIndex > insertion, 'Afbeelding wordt niet in de actieve werkruimte ingevoegd');
});



test('undo en redo behouden een nog bestaand geselecteerd object', () => {
  assert.match(core, /function resolveSelectionId\(objects, selectedId\)/);
  assert.equal((app.match(/Core\.resolveSelectionId\(activeObjects\(\), selectedId\)/g) || []).length, 2);
  for (const name of ['undo', 'redo']) {
    const start = app.indexOf(`function ${name}()`);
    const end = app.indexOf(name === 'undo' ? 'function redo()' : 'function resetDocument()', start);
    assert.ok(start >= 0 && end > start, `${name}()-handler ontbreekt`);
    const handler = app.slice(start, end);
    assert.match(handler, /const selectedId = state\.selectedId/);
    assert.match(handler, /state\.selectedBezierPointIndex = null/);
    assert.match(handler, /state\.bezierHandleType = null/);
  }
});


test('inspector start een wijzigingstransactie maar legt alleen echte edits vast', () => {
  assert.ok(app.includes('const editingStarted = new Map();'));
  assert.ok(app.includes('function beginEditorEdit(id)'));
  assert.ok(app.includes('function commitEditorEdit(id, fallbackSnapshot = null)'));
  assert.ok(app.includes('Core.recordProjectHistoryIfChanged(state.undoStack, state.redoStack, transaction.snapshot, state.project, 60)'));
  assert.ok(app.includes('if (JSON.stringify(state.project) === before) return false;'));
  assert.ok(app.includes("field.addEventListener('blur', () => editingStarted.delete(id))"));
});

test('photo-adjustmentsliders bewaren undo en markeren echte live-wijzigingen als onopgeslagen', () => {
  assert.ok(app.includes('if (state.project.pixel[key] === nextValue) return;'));
  assert.ok(app.includes('commitEditorEdit(id, beforeProject);'));
  assert.ok(app.includes("$('reset-adjustments-button').addEventListener('click', () => {"));
  assert.ok(app.includes('if (doc.brightness === 100 && doc.contrast === 100 && doc.saturation === 100) return;'));
});


test('beta.2 toont uitgebreide gereedschappen in Pixel Lab, Vector Forge en Page Studio', () => {
  const start = app.indexOf('const toolsets = {');
  const end = app.indexOf('let recoveryTimer', start);
  assert.ok(start >= 0 && end > start, 'toolsets zijn in de app gedefinieerd');
  const toolSource = app.slice(start, end);
  const expected = {
    pixel: ['line', 'roundrect', 'pentagon', 'hexagon', 'diamond', 'arrow', 'octagon', 'speech', 'eyedropper', 'pen'],
    vector: ['image', 'roundrect', 'pentagon', 'hexagon', 'diamond', 'arrow', 'octagon', 'speech', 'eyedropper', 'object-eraser'],
    layout: ['roundrect', 'pentagon', 'hexagon', 'diamond', 'arrow', 'octagon', 'speech', 'pen', 'bezier', 'eyedropper', 'object-eraser']
  };
  for (const workspace of Object.keys(expected)) {
    const startWorkspace = toolSource.indexOf(workspace + ': [');
    assert.ok(startWorkspace >= 0, 'werkruimte ontbreekt: ' + workspace);
    const nextStarts = Object.keys(expected).map(key => toolSource.indexOf(key + ': [')).filter(index => index > startWorkspace).sort((a,b) => a-b);
    const block = toolSource.slice(startWorkspace, nextStarts[0] ?? toolSource.length);
    for (const name of expected[workspace]) assert.ok(block.includes("['" + name + "',"), workspace + ' mist gereedschap ' + name);
  }
  assert.match(app, /function eraseObjectAtPoint\(/);
  assert.match(app, /function sampleObjectColor\(/);
  assert.match(app, /getImageData\(x, y, 1, 1\)/);
});

test('een leeg nieuw ontwerp wordt niet direct als bewerking gemarkeerd', () => {
  assert.match(app, /Nieuw ontwerp · nog niet opgeslagen/);
  assert.doesNotMatch(app, /markDirty\('Nieuw project · nog niet opgeslagen'\)/);
});
test('de startup-intro heeft een animatie en een knop om over te slaan', () => {
  assert.match(html, /id="startup-intro"/);
  assert.match(html, /id="skip-intro"/);
  assert.match(app, /function playStartupIntro\(/);
  assert.match(app, /window\.setTimeout\(finish, 3300\)/);
});

test('Motion Studio biedt multitrack-montage, titels, audiomix en projectopslag', () => {
  for (const id of ['video-screen','video-files','video-audio-files','video-canvas','video-timeline-scroll','video-ruler','video-tracks','video-in','video-out','video-save-session','video-open-session','video-export','video-add-title','video-add-marker','video-snap','video-fit-timeline','video-add-crossfade','video-add-keyframe','video-clear-keyframes','video-split-clip','video-ripple-delete','video-x','video-y','video-keyframe-count','video-add-track-video','video-add-track-audio','video-undo','video-redo','video-filter','video-fade-in','video-fade-out']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Ontbrekend video-element: ' + id);
  }
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  assert.match(video, /function addTrack\(/);
  assert.match(video, /function addTitle\(/);
  assert.match(video, /function addKeyframe\(/);
  assert.match(video, /function splitSelectedAtPlayhead\(/);
  assert.match(video, /function removeSelected\(/);
  assert.match(video, /function snapTime\(/);
  assert.match(video, /function addCrossfade\(/);
  assert.match(video, /function computeAudioWaveform\(/);
  assert.match(video, /video-clip-waveform/);
  assert.match(video, /function animatedValue\(/);
  assert.match(video, /function importFiles\(/);
  assert.match(video, /function renderTracks\(/);
  assert.match(video, /function renderPreview\(/);
  assert.match(video, /async function exportOfflineMp4\(/);
  assert.match(video, /async function exportRealtimeWebm\(/);
  assert.equal([...video.matchAll(/FluxivoraMotionStudio\?\.hasProxyPreview\?\.\(\)/g)].length, 2,
    'MP4- en WebM-export moeten proxy-preview blokkeren');
  assert.match(video, /function waitForVideoFrame\(media, name, targetTime\)/);
  assert.match(video, /return waitForVideoFrame\(clip\.mediaEl, clip\.name, target\)/);
  assert.match(video, /createMediaStreamDestination\(/);
  assert.match(video, /function undo\(/);
  assert.match(video, /fluxivora-video-project/);
  assert.match(html, /src="video-studio.js"/);
});

test('Motion Studio projecteert meerdere video-, audio- en titeltracks afzonderlijk', () => {
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  assert.match(video, /kind: 'video'/);
  assert.match(video, /kind: 'audio'/);
  assert.match(video, /kind: 'title'/);
  assert.match(video, /videoTracks\.slice\(\)\.reverse\(\)/);
  assert.match(video, /compatibleTrack\(/);
  assert.match(video, /function saveSession\(/);
  assert.match(video, /async function openSession\(/);
});

test('Motion Studio heeft snelheidsregeling, key-effecten, fades en keyboard undo', () => {
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  for (const feature of ['fadeIn','fadeOut','speed','opacity','scale','filter','video-undo','video-redo','e.shiftKey ? redo() : undo()']) {
    assert.ok(video.includes(feature), 'Ontbrekend video-editingonderdeel: ' + feature);
  }
  assert.match(video, /function alphaFor\(/);
  assert.match(video, /function effectFilter\(/);
});

test('keyframe-animatie en crossfade bewaren hun projectmetadata', () => {
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  assert.match(video, /keyframes: Array\.isArray\(c\.keyframes\)/);
  assert.match(video, /c\.fadeIn = duration/);
  assert.match(video, /previous\.fadeOut = duration/);
  assert.match(video, /animatedValue\(c, 'opacity'/);
  assert.match(video, /animatedValue\(c, 'scale'/);
});

test('bèta.3-montages worden gemigreerd in plaats van afgewezen', () => {
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  assert.match(video, /Migrate the original beta\.3 single-track montage format/);
  assert.match(video, /Oud montageproject omgezet naar de multi-track tijdlijn/);
  assert.match(video, /let cursor = 0;/);
});

test('Motion Studio genereert lokale filmstrip-miniaturen voor videoclips', () => {
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  assert.match(video, /function captureVideoThumbnails\(/);
  assert.match(video, /video-clip-filmstrip/);
  assert.match(video, /canvas\.toDataURL\('image\/jpeg'/);
});

test('Motion Studio ondersteunt sequence markers, split shortcuts en 25fps-tijdcode', () => {
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  for (const feature of ["function addMarker(", "state.markers.map", "e.key.toLowerCase() === 'm'", "e.key.toLowerCase() === 'i'", "e.key.toLowerCase() === 'o'", "const SEQUENCE_FPS = 25", "captureStream(SEQUENCE_FPS)"]) {
    assert.ok(video.includes(feature), 'Ontbrekend montageonderdeel: ' + feature);
  }
});

test('Motion Studio plaatst trackkoppen naast de correcte timeline-lanes', () => {
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  assert.match(video, /row\.append\(header, lane\)/);
  assert.match(video, /video-track-label/);
  assert.match(video, /video-track-buttons/);
  assert.match(video, /Track vergrendelen/);
  assert.match(video, /Track dempen/);
});

test('Motion Studio rendert het volledige canvas op de gekozen exportresolutie', () => {
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  assert.match(video, /ctx\.fillRect\(0, 0, canvas\.width, canvas\.height\)/);
  assert.match(video, /canvas\.width = size === '720p' \? 1280 : size === '4k' \? 3840 : 1920/);
  assert.match(video, /canvas\.height = size === '720p' \? 720 : size === '4k' \? 2160 : 1080/);
});

test('Motion Studio ondersteunt snapping aan/uit en de tijdlijn passend maken', () => {
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  assert.match(video, /function fitTimeline\(/);
  assert.match(video, /if \(!state\.snap\) return Math\.max\(0, value\)/);
  assert.match(video, /video-fit-timeline/);
  assert.match(video, /video-snap/);
});


test('Motion Studio beta.5 biedt mediabibliotheek, bronmonitor en bronkoppeling', () => {
  for (const id of ['video-lut-load','video-lut-clear','video-lut-file','video-lut-status','video-lut-name','video-proxy-file','video-proxy-preview','video-proxy-status','video-multicam-selection-count','video-multicam-create','video-multicam-groups','video-multicam-group','video-multicam-attach','video-multicam-angle','video-multicam-cut','video-bin-search','video-bin-filter','video-import-to-timeline','video-media-empty','video-view-program','video-view-source','video-source-player','video-source-audio','video-source-play','video-source-seek','video-source-time','video-source-in','video-source-out','video-source-mark-in','video-source-mark-out','video-source-insert','video-relink-files']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Ontbrekend bronworkflow-element: ' + id);
  }
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  assert.match(video, /assets: state\.assets\.map/);
  assert.match(video, /fluxivora:asset-imported/);
  assert.match(video, /fluxivora:asset-file-imported/);
  assert.match(video, /window\.FluxivoraMotionStudio =/);
  assert.match(motion, /function renderMediaBin\(/);
  assert.match(motion, /function selectSource\(/);
  assert.match(motion, /function insertSource\(/);
  assert.match(motion, /function relinkAsset\(/);
});

test('Motion Studio beta.5 ondersteunt effectstacks, kleurcorrectie, scopes en keyframe-easing', () => {
  for (const id of ['video-effect-type','video-effect-add','video-effect-stack','video-grade-exposure','video-grade-contrast','video-grade-saturation','video-grade-temperature','video-grade-tint','video-scope-histogram','video-scope-waveform','video-keyframe-easing']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Ontbrekend grading-element: ' + id);
  }
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  assert.match(video, /function effectFilter\(value, clip\)/);
  assert.match(video, /colorAdjustments/);
  assert.match(video, /curves = \{ linear:/);
  assert.match(motion, /function renderEffectStack\(/);
  assert.match(motion, /function paintScopes\(/);
  assert.match(motion, /function applyGrade\(/);
  assert.match(html, /src="motion-pro\.js"/);
});


test('Motion Studio bronmonitor ondersteunt afspelen, scrubben en nauwkeurige bronmarkeringen', () => {
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  for (const feature of ['function activeSourcePlayer(', 'function updateSourceTransport(', 'function toggleSourcePlayback(', "'timeupdate','loadedmetadata','durationchange','play','pause','ended','seeking','seeked'", 'player.addEventListener(type, updateSourceTransport)', 'function setMark(', 'function setSourcePoint(']) {
    assert.ok(motion.includes(feature), 'Ontbrekend bronmonitoronderdeel: ' + feature);
  }
  assert.match(html, /id="video-source-play"/);
  assert.match(html, /id="video-source-seek"/);
});


test('Motion Studio heeft een visuele, versleepbare keyframe-curve-editor', () => {
  assert.match(html, /id="video-curve-property"/);
  assert.match(html, /id="video-curve-canvas"/);
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  assert.match(motion, /function renderCurveEditor\(/);
  assert.match(motion, /function wireCurveEditor\(/);
  assert.match(motion, /canvas\.addEventListener\('pointerdown'/);
  assert.match(motion, /canvas\.addEventListener\('pointermove'/);
  assert.match(motion, /curveEase = \{/);
  assert.match(motion, /function curveValueAt\(/);
});


test('Motion Studio ondersteunt gevalideerde 3D .cube-output-LUTs', () => {
  for (const id of ['video-lut-load','video-lut-clear','video-lut-file','video-lut-status','video-lut-name']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Ontbrekend LUT-element: ' + id);
  }
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  assert.match(video, /function normaliseProgramLut\(/);
  assert.match(video, /lut: state\.programLut/);
  assert.match(video, /applyProgramLut\(canvas\)/);
  assert.match(motion, /async function parseCubeLut\(/);
  assert.match(motion, /LUT_3D_SIZE/);
  assert.match(motion, /gl\.texImage3D\(/);
  assert.match(motion, /function applyProgramLut\(/);
  assert.match(motion, /api\.applyProgramLut = applyProgramLut/);
});


test('Motion Studio kan proxybestanden koppelen zonder de originele media te vervangen', () => {
  for (const id of ['video-proxy-file','video-proxy-preview','video-proxy-status']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Ontbrekend proxy-element: ' + id);
  }
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  assert.match(video, /assetId/);
  assert.match(video, /proxyName: a\.proxyName/);
  assert.match(video, /hasProxyPreview/);
  assert.match(motion, /function applyProxyPreview\(/);
  assert.match(motion, /async function linkProxyFile\(/);
  assert.match(motion, /function findAssetForClip\(/);
  assert.match(motion, /asset\.proxyUrl/);
  assert.match(motion, /video-proxy-preview/);
});

test('Motion Studio kan opgeslagen proxybestanden in batches opnieuw koppelen op unieke bestandsnaam', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  assert.match(html, /id="video-proxy-relink-all"/);
  assert.match(html, /id="video-proxy-relink-files" type="file" accept="video\/\*" multiple/);
  assert.match(motion, /function relinkKnownProxyFiles\(files\)/);
  assert.match(motion, /assetsByProxyName/);
  assert.match(motion, /matches\.length === 1/);
  assert.match(motion, /matches\.length > 1/);
  assert.match(motion, /const claimedAssetIds = new Set\(\)/);
  assert.match(motion, /claimedAssetIds\.has\(matches\[0\]\.id\)/);
  assert.match(motion, /linkProxyFile\(file, matches\[0\]\.id, \{ silent: true \}\)/);
});


test('Motion Studio ondersteunt cameragroepen, handmatige sync-offsets en hoekcuts op de playhead', () => {
  for (const id of ['video-multicam-selection-count','video-multicam-create','video-multicam-groups','video-multicam-group','video-multicam-attach','video-multicam-angle','video-multicam-cut']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Ontbrekend multicam-element: ' + id);
  }
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  assert.match(video, /multicamGroups/);
  assert.match(video, /activeAngleAssetId/);
  assert.match(video, /function splitSelectedAtPlayhead/);
  assert.match(video, /videoPosition = angleAsset/);
  assert.match(motion, /async function analyzeMulticamGroup\(/);
  assert.match(motion, /function applyMulticamSyncSuggestions\(/);
  assert.match(motion, /currentAngleIds\.has\(preview\.referenceAssetId\)/);
  assert.match(motion, /currentAngleIds\.has\(item\.assetId\)/);
  assert.match(motion, /sourceSignatures/);
  assert.match(motion, /sourceStillMatches\(preview\.referenceAssetId\)/);
  assert.match(motion, /sourceStillMatches\(item\.assetId\)/);
  assert.match(motion, /multicamSyncSuggestions\.delete\(group\.id\)/);
  assert.match(motion, /Analyseer audio-sync/);
  assert.match(motion, /Betrouwbare offsets toepassen/);
  assert.match(motion, /minConfidence: 0\.25/);
  assert.match(motion, /const comparisonRate = 10/);
  assert.match(motion, /const comparisonSeconds = 180/);
  assert.match(motion, /const envelopeRate = envelope\.length \/ audio\.duration/);
  assert.match(motion, /const maxLagSamples = 150/);

  assert.match(motion, /function createMulticamGroup\(/);
  assert.match(motion, /function renderMulticamGroups\(/);
  assert.match(motion, /function attachMulticamGroup\(/);
  assert.match(motion, /function cutToMulticamAngle\(/);
  assert.match(motion, /Bron-offset bij tijdlijn 00:00/);
  assert.match(motion, /const angleAsset = clip\.activeAngleAssetId/);
  assert.match(motion, /api\.splitSelectedAtPlayhead\(\{ silent: true \}\)/);
});


test('Motion Studio beta.6 biedt een aparte offline MP4-pijplijn en behoudt realtime WebM als fallback', () => {
  for (const id of ['video-export','video-export-webm','video-render-progress','video-render-meter','video-render-progress-title','video-render-progress-detail','video-export-cancel']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Ontbrekend exportelement: ' + id);
  }
  assert.match(html, /Render MP4 · Offline/);
  assert.match(html, /WebM realtime/);
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
  const helper = fs.readFileSync(path.join(root, 'electron', 'video-render.cjs'), 'utf8');
  const pkg = require(path.join(root, 'package.json'));
  for (const fn of ['exportOfflineMp4(', 'renderTimelineFrame(', 'renderOfflineAudioChunk(', 'streamOfflineAudio(', 'exportRealtimeWebm(']) {
    assert.ok(video.includes(fn), 'Ontbrekende renderfunctie: ' + fn);
  }
  for (const route of ['video:begin-render','video:write-frame','video:write-audio','video:finish-render','video:cancel-render']) {
    assert.ok(main.includes("ipcMain.handle('" + route + "'"), 'Ontbrekende main-process route: ' + route);
  }
  for (const api of ['beginVideoRender','writeVideoFrame','writeVideoAudio','finishVideoRender','cancelVideoRender']) {
    assert.ok(preload.includes(api + ':'), 'Ontbrekende preload-API: ' + api);
  }
  assert.match(helper, /-f', 'image2pipe'/);
  assert.match(helper, /-f', 'f32le'/);
  assert.match(helper, /'libx264'/);
  assert.match(helper, /'aac'/);
  assert.equal(pkg.version, '0.5.0-beta.8');
  assert.equal(pkg.dependencies['ffmpeg-static'], '5.3.0');
  assert.ok(pkg.build.asarUnpack.includes('node_modules/ffmpeg-static/**'));
  assert.ok(pkg.build.files.includes('node_modules/ffmpeg-static/**/*'));
  assert.ok(pkg.build.files.includes('THIRD-PARTY-NOTICES.md'));
  assert.match(fs.readFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), 'utf8'), /GPL-3\.0-or-later/);
});


test('Motion Studio toggles all shared video and audio inspector sections without missing ID lookups', () => {
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  assert.match(video, /querySelectorAll\('\.video-video-controls'\)/);
  assert.match(video, /querySelectorAll\('\.video-audio-controls'\)/);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const idRefs = [...video.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
  const missing = [...new Set(idRefs.filter(id => !ids.has(id)))];
  assert.deepEqual(missing, [], 'Een Motion Studio ID wordt gebruikt maar ontbreekt in de HTML');
});


test('Motion Studio genereert proxies met batchbediening, voortgang en annuleren', () => {
  for (const id of ['video-proxy-preset','video-proxy-batch','video-proxy-cancel','video-proxy-progress','video-proxy-status','video-proxy-file','video-proxy-preview']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Ontbrekend proxy-element: ' + id);
  }
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
  const helper = fs.readFileSync(path.join(root, 'electron', 'video-render.cjs'), 'utf8');
  const ffmpegTests = fs.readFileSync(path.join(root, 'tests', 'ffmpeg.test.cjs'), 'utf8');
  for (const fn of ['function runProxyGeneration(', 'function generateProxyForAsset(', 'function readGeneratedProxy(', 'function cancelProxyGeneration(']) {
    assert.ok(motion.includes(fn), 'Ontbrekende proxyfunctie: ' + fn);
  }
  assert.match(motion, /window\.fluxivora\.createVideoProxyForFile/);
  assert.match(motion, /window\.fluxivora\.readVideoProxyChunk/);
  assert.match(motion, /onVideoProxyProgress/);
  for (const route of ['video:choose-proxy-directory','video:create-proxy','video:analyze-multicam-audio','video:cancel-proxy','video:read-proxy-chunk','video:release-proxy-read']) {
    assert.ok(main.includes("ipcMain.handle('" + route + "'"), 'Ontbrekende proxy IPC-route: ' + route);
  }
  for (const api of ['chooseVideoProxyDirectory','createVideoProxyForFile','analyzeMulticamAudioForFile','cancelVideoProxy','readVideoProxyChunk','releaseVideoProxyRead','onVideoProxyProgress']) {
    assert.ok(preload.includes(api + ':'), 'Ontbrekende proxy preload-API: ' + api);
  }
  assert.match(main, /'-ar', '1000', '-f', 's16le', 'pipe:1'/,
    'Multicam audio moet lokaal via FFmpeg naar begrensde mono-PCM worden gedecodeerd');
  assert.match(main, /totalBytes > 400000/,
    'Multicam audio-IPC moet een harde uitvoerlimiet hebben');
  assert.match(preload, /webUtils\.getPathForFile\(file\)/,
    'Multicam audioanalyse moet een lokaal bestandspad ophalen zonder renderer Node-integratie');
  assert.match(motion, /analyzeMulticamAudioForFile/,
    'Multicam sync moet de lokale FFmpeg-decoder gebruiken in Electron');
  assert.match(preload, /webUtils\.getPathForFile\(file\)/);
  assert.match(main, /shell: false/);
  assert.match(main, /MAX_PROXY_OUTPUT_BYTES/);
  assert.match(helper, /function validateProxyRequest\(/);
  assert.match(helper, /function buildProxyArgs\(/);
  assert.match(ffmpegTests, /lower-resolution H\.264\/AAC proxy/);
  assert.match(JSON.stringify(require(path.join(root, 'package.json'))), /0\.5\.0-beta\.8/);
});

test('Motion Studio proxy-generation UI references existing HTML elements and keeps generated media separate', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  const references = [...motion.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
  const missing = [...new Set(references.filter(id => !ids.has(id)))];
  assert.deepEqual(missing, [], 'Motion Studio verwijst naar een proxy-UI-element dat ontbreekt');
  assert.match(motion, /async function linkProxyFile\(file, assetId = selectedProxyAssetId, options = \{\}\)/);
  assert.match(motion, /proxyName = file\.name/);
  assert.match(motion, /new File\(chunks, result\.name/);
  assert.match(motion, /video-proxy-batch/);
});


test('Motion Studio beta.7 has draggable cubic Bezier handles with the same interpolation in preview and export', () => {
  assert.match(html, /src="keyframe-curves\.js"/);
  assert.match(html, /<option value="bezier">Bézier-handles<\/option>/);
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  const motion = fs.readFileSync(path.join(root, 'src', 'motion-pro.js'), 'utf8');
  const shared = fs.readFileSync(path.join(root, 'src', 'keyframe-curves.js'), 'utf8');
  assert.match(video, /FluxivoraKeyframeCurves\.bezierValue\(left, right, key, raw\)/);
  assert.match(video, /FluxivoraKeyframeCurves\.bezierValue\(left, right, key, amount\)/);
  assert.match(video, /outHandle: frame\.outHandle \? \{\.\.\.frame\.outHandle\}/);
  assert.match(video, /ease: \['linear','easeIn','easeOut','easeInOut','bezier','hold'\]/);
  assert.match(motion, /FluxivoraKeyframeCurves\.controlPoints\(left, right, property\)/);
  assert.match(motion, /kind: 'handle'/);
  assert.match(motion, /frame\.outHandle\[drag\.property\] = value - frame\[drag\.property\]/);
  assert.match(motion, /frame\.inHandle\[drag\.property\] = value - frame\[drag\.property\]/);
  assert.match(shared, /function bezierValue\(/);
  assert.match(shared, /function controlPoints\(/);
  assert.equal(require(path.join(root, 'package.json')).version, '0.5.0-beta.8');
});
