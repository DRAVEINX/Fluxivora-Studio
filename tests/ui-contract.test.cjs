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
  assert.equal(pkg.version, '0.5.0-beta.3');
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
