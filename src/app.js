(() => {
  'use strict';
  const Core = window.FluxCore;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const state = {
    project: null, filePath: null, activeWorkspace: 'home', currentTool: 'select', selectedId: null,
    draftObject: null, pointerStart: null, movingObject: null, lastPointer: null,
    undoStack: [], redoStack: [], clipboardObject: null, dirty: false, zoom: 0, inspector: 'properties', modalWorkspace: 'pixel',
    dragMode: null, drawing: false, dragHistoryRecorded: false, dragHasMoved: false, startSnapshot: null, bezierPointIndex: null, bezierHandleType: null, selectedBezierPointIndex: null, spaceHeld: false, panDrag: null, vectorGridEnabled: false
  };

  const POLYGON_TOOLS = new Set(['triangle', 'star', 'pentagon', 'hexagon', 'diamond', 'arrow', 'octagon', 'speech']);
  const toolsets = {
    pixel: [
      ['select', '↖', 'Selecteren', 'Selecteer en verplaats een object.'],
      ['brush', '✎', 'Penseel', 'Teken vrij met een zachte lijn.'],
      ['pen', '⌁', 'Pen', 'Teken een nauwkeurige vrije lijn als aparte objectlaag.'],
      ['eraser', '⌫', 'Gum', 'Gum pixels en eerdere tekeningen uit.'],
      ['line', '／', 'Lijn', 'Trek een rechte lijn met instelbare lijnkleur en dikte.'],
      ['rect', '▱', 'Rechthoek', 'Sleep om een rechthoek te tekenen.'],
      ['roundrect', '▱', 'Afgeronde rechthoek', 'Teken een rechthoek met afgeronde hoeken.'],
      ['ellipse', '◯', 'Ellips', 'Sleep om een ellips te tekenen.'],
      ['triangle', '△', 'Driehoek', 'Teken een schaalbare driehoekvorm.'],
      ['star', '☆', 'Ster', 'Teken een vijfpuntige ster.'],
      ['pentagon', '⬟', 'Vijfhoek', 'Teken een regelmatige vijfhoek.'],
      ['hexagon', '⬢', 'Zeshoek', 'Teken een regelmatige zeshoek.'],
      ['diamond', '◇', 'Ruit', 'Teken een ruitvorm.'],
      ['arrow', '➜', 'Pijl', 'Teken een gevulde pijl naar rechts.'],
      ['octagon', '⯃', 'Achthoek', 'Teken een regelmatige achthoek.'],
      ['speech', '▱', 'Tekstballon', 'Teken een eenvoudige tekstballon.'],
      ['text', 'T', 'Tekst', 'Voeg tekst toe en pas die rechts aan.'],
      ['eyedropper', '◉', 'Pipet', 'Neem een zichtbare kleur van het canvas over.']
    ],
    vector: [
      ['select', '↖', 'Selecteren', 'Klik op een vorm en sleep deze om te verplaatsen.'],
      ['rect', '▱', 'Rechthoek', 'Maak een schaalbare vectorrechthoek.'],
      ['roundrect', '▱', 'Afgeronde rechthoek', 'Maak een vectorrechthoek met afgeronde hoeken.'],
      ['ellipse', '◯', 'Ellips', 'Maak een schaalbare ellips.'],
      ['line', '／', 'Lijn', 'Sleep om een lijn te tekenen.'],
      ['triangle', '△', 'Driehoek', 'Teken een driehoek met instelbare vulling en lijn.'],
      ['star', '☆', 'Ster', 'Teken een vijfpuntige vectorster.'],
      ['pentagon', '⬟', 'Vijfhoek', 'Teken een regelmatige vijfhoek.'],
      ['hexagon', '⬢', 'Zeshoek', 'Teken een regelmatige zeshoek.'],
      ['diamond', '◇', 'Ruit', 'Teken een ruitvorm.'],
      ['arrow', '➜', 'Pijl', 'Teken een gevulde pijl naar rechts.'],
      ['octagon', '⯃', 'Achthoek', 'Teken een regelmatige achthoek.'],
      ['speech', '▱', 'Tekstballon', 'Teken een eenvoudige tekstballon.'],
      ['pen', '⌁', 'Vrije lijn', 'Sleep om een schaalbaar vrij pad te tekenen.'],
      ['bezier', '⌒', 'Bézier-pen', 'Klik om ankerpunten te plaatsen; dubbelklik of druk Enter om de curve af te sluiten.'],
      ['text', 'T', 'Tekst', 'Voeg schaalbare vectortekst toe.'],
      ['image', '▧', 'Afbeelding', 'Importeer en plaats een afbeelding op het canvas.'],
      ['eyedropper', '◉', 'Pipet', 'Neem de vul- of lijnkleur van een vorm over.'],
      ['object-eraser', '⌫', 'Objectgum', 'Verwijder een aangeklikt object; vergrendelde lagen blijven beschermd.']
    ],
    layout: [
      ['select', '↖', 'Selecteren', 'Klik op een object en sleep het op de pagina.'],
      ['text', 'T', 'Tekstkader', 'Voeg tekst toe; bewerk de inhoud rechts.'],
      ['image', '▧', 'Afbeelding', 'Importeer een afbeelding en plaats deze op de pagina.'],
      ['rect', '▱', 'Rechthoek', 'Voeg een vorm of kleurvlak toe.'],
      ['roundrect', '▱', 'Afgeronde rechthoek', 'Voeg een afgerond kleurvlak toe.'],
      ['ellipse', '◯', 'Ellips', 'Voeg een cirkel of ellips toe.'],
      ['line', '／', 'Lijn', 'Voeg een lijn toe aan je lay-out.'],
      ['triangle', '△', 'Driehoek', 'Voeg een driehoek toe aan je publicatie.'],
      ['star', '☆', 'Ster', 'Voeg een ster toe aan je publicatie.'],
      ['pentagon', '⬟', 'Vijfhoek', 'Voeg een vijfhoek toe aan je publicatie.'],
      ['hexagon', '⬢', 'Zeshoek', 'Voeg een zeshoek toe aan je publicatie.'],
      ['diamond', '◇', 'Ruit', 'Voeg een ruit toe aan je publicatie.'],
      ['arrow', '➜', 'Pijl', 'Voeg een pijl toe aan je publicatie.'],
      ['octagon', '⯃', 'Achthoek', 'Voeg een achthoek toe aan je publicatie.'],
      ['speech', '▱', 'Tekstballon', 'Voeg een tekstballon toe aan je publicatie.'],
      ['pen', '⌁', 'Vrije lijn', 'Teken een vrij vectorpad op de pagina.'],
      ['bezier', '⌒', 'Bézier-pen', 'Klik ankerpunten; dubbelklik of druk Enter om de curve af te sluiten.'],
      ['eyedropper', '◉', 'Pipet', 'Neem de vul- of lijnkleur van een object over.'],
      ['object-eraser', '⌫', 'Objectgum', 'Verwijder een aangeklikt object; vergrendelde lagen blijven beschermd.']
    ]
  };

  let recoveryTimer = null;
  let recoveryQueue = Promise.resolve();
  let recoveryFailureNotified = false;
  let closePreparationCompleted = false;

  const descriptions = {
    pixel: { title: 'Pixel Lab', subtitle: 'Foto’s verfijnen en pixel voor pixel creëren', glyph: '▧' },
    vector: { title: 'Vector Forge', subtitle: 'Logo’s, iconen en schaalbare illustraties', glyph: '◇' },
    layout: { title: 'Page Studio', subtitle: 'Pagina’s, posters en publicaties opmaken', glyph: '▤' }
  };

  function activeObjects() {
    if (!state.project) return [];
    if (state.activeWorkspace === 'pixel') return state.project.pixel.objects;
    if (state.activeWorkspace === 'vector') return state.project.vector.objects;
    const page = state.project.layout.pages[state.project.layout.currentPage];
    if (!page.objects) page.objects = [];
    return page.objects;
  }

  function activeDocumentSize() {
    if (!state.project) return { width: 1200, height: 800 };
    if (state.activeWorkspace === 'pixel') return { width: state.project.pixel.width, height: state.project.pixel.height };
    if (state.activeWorkspace === 'vector') return { width: state.project.vector.width, height: state.project.vector.height };
    const page = state.project.layout.pages[state.project.layout.currentPage];
    return { width: page.width || 794, height: page.height || 1123 };
  }

  function checkpoint() {
    if (!state.project) return;
    if (Core.recordProjectHistory(state.undoStack, state.redoStack, state.project, 60)) updateHistoryButtons();
  }

  function beginEditorEdit(id) {
    if (!state.project || editingStarted.has(id)) return;
    try {
      editingStarted.set(id, { snapshot: JSON.parse(JSON.stringify(state.project)), committed: false });
    } catch (_) {}
  }

  function commitEditorEdit(id, fallbackSnapshot = null) {
    if (!state.project) return false;
    let transaction = editingStarted.get(id);
    if (!transaction && fallbackSnapshot) {
      transaction = { snapshot: fallbackSnapshot, committed: false };
      editingStarted.set(id, transaction);
    }
    if (!transaction || transaction.committed) return false;
    if (!Core.recordProjectHistoryIfChanged(state.undoStack, state.redoStack, transaction.snapshot, state.project, 60)) return false;
    transaction.committed = true;
    updateHistoryButtons();
    return true;
  }

  function checkpointDragMutation() {
    if (state.dragHistoryRecorded) return;
    checkpoint();
    state.dragHistoryRecorded = true;
  }

  function updateHistoryButtons() {
    $('undo-button').disabled = state.undoStack.length === 0;
    $('redo-button').disabled = state.redoStack.length === 0;
  }

  function queueRecoveryTask(task) {
    recoveryQueue = recoveryQueue.catch(() => {}).then(task).catch(() => {
      if (!recoveryFailureNotified) {
        recoveryFailureNotified = true;
        if (state.project) notify('De lokale herstelkopie kon niet worden bijgewerkt.', 'error');
      }
    });
    return recoveryQueue;
  }

  function cancelRecoveryTimer() {
    if (recoveryTimer) window.clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  function persistRecoverySnapshot() {
    if (!state.project || !state.dirty || !window.fluxivora?.writeRecovery) return Promise.resolve();
    state.project.workspace = state.activeWorkspace;
    const payload = {
      json: JSON.stringify(state.project),
      filePath: state.filePath || null,
      updatedAt: new Date().toISOString()
    };
    return queueRecoveryTask(() => window.fluxivora.writeRecovery(payload));
  }

  function scheduleRecoverySnapshot() {
    if (!state.project || !state.dirty) return;
    cancelRecoveryTimer();
    recoveryTimer = window.setTimeout(() => {
      recoveryTimer = null;
      persistRecoverySnapshot();
    }, 900);
  }

  function clearRecoverySnapshot() {
    cancelRecoveryTimer();
    if (!window.fluxivora?.clearRecovery) return Promise.resolve();
    return queueRecoveryTask(() => window.fluxivora.clearRecovery());
  }

  async function offerRecoveryIfAvailable() {
    if (!window.fluxivora?.readRecovery) return;
    try {
      const recovery = await window.fluxivora.readRecovery();
      if (!recovery || typeof recovery.json !== 'string') return;
      let recoveredProject;
      try {
        recoveredProject = Core.normaliseProject(JSON.parse(recovery.json));
      } catch (_) {
        await window.fluxivora.clearRecovery();
        notify('Een ongeldige herstelkopie is verwijderd.', 'error');
        return;
      }
      showModal({
        title: 'Niet-opgeslagen werk gevonden',
        description: `Er staat een lokale herstelkopie van “${recoveredProject.name}”. Deze kopie is alleen op deze pc opgeslagen. Wil je doorgaan waar je was gebleven?`,
        confirmText: 'Herstellen',
        cancelText: 'Verwijderen',
        body: body => {
          const note = document.createElement('p');
          note.className = 'muted-note';
          note.textContent = `Werkruimte: ${descriptions[recoveredProject.workspace]?.title || 'Pixel Lab'}. De herstelkopie wordt niet naar internet of de cloud gestuurd.`;
          body.append(note);
        },
        onConfirm: async () => {
          state.project = recoveredProject;
          state.filePath = typeof recovery.filePath === 'string' ? recovery.filePath : null;
          state.activeWorkspace = recoveredProject.workspace || 'pixel';
          state.selectedId = null;
          state.draftObject = null;
          state.undoStack.length = 0;
          state.redoStack.length = 0;
          state.zoom = 0;
          showEditor();
          markDirty('Herstelkopie hersteld');
          renderAll();
          notify('Je lokale herstelkopie is hersteld.', 'success');
          return true;
        },
        onCancel: async () => {
          await clearRecoverySnapshot();
          notify('Herstelkopie verwijderd.');
        }
      });
    } catch (_) {
      // Recovery is best-effort and must never block opening the app.
    }
  }

  function markDirty(message = 'Niet opgeslagen') {
    state.dirty = true;
    if (state.project) state.project.updatedAt = new Date().toISOString();
    $('save-state').textContent = message;
    $('save-button').disabled = !state.project;
    $('save-as-button').disabled = !state.project;
    updateTitle();
    scheduleRecoverySnapshot();
  }

  async function markSaved() {
    state.dirty = false;
    cancelRecoveryTimer();
    await clearRecoverySnapshot();
    $('save-state').textContent = 'Alle wijzigingen opgeslagen';
    $('save-button').disabled = !state.project;
    $('save-as-button').disabled = !state.project;
    updateTitle();
  }

  function updateTitle() {
    const name = state.project ? state.project.name : 'Geen project geopend';
    $('project-name').value = name;
    $('project-name').readOnly = !state.project;
    $('project-name').title = state.filePath || 'Lokaal Fluxivora-project';
    $('footer-workspace').textContent = state.project ? descriptions[state.activeWorkspace].title : 'Welkom';
  }

  function notify(message, kind = 'normal') {
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.textContent = message;
    $('toast-stack').appendChild(toast);
    window.setTimeout(() => toast.remove(), 3800);
  }

  function showModal({ title, description = '', body, confirmText = 'Doorgaan', onConfirm, onCancel, cancelText = 'Annuleren' }) {
    $('modal-title').textContent = title;
    $('modal-description').textContent = description;
    $('modal-body').innerHTML = '';
    $('modal-confirm').textContent = confirmText;
    $('modal-cancel').textContent = cancelText;
    $('modal-backdrop').classList.remove('hidden');
    if (body) body($('modal-body'));
    const close = () => {
      $('modal-backdrop').classList.add('hidden');
      $('modal-confirm').onclick = null;
    };
    const cancel = () => {
      if (onCancel) Promise.resolve(onCancel()).catch(() => {});
      close();
    };
    $('modal-close').onclick = cancel;
    $('modal-cancel').onclick = cancel;
    $('modal-confirm').onclick = async () => {
      const result = onConfirm ? await onConfirm($('modal-body')) : true;
      if (result !== false) close();
    };
  }

  function showNewProjectModal(defaultWorkspace = 'pixel') {
    state.modalWorkspace = defaultWorkspace;
    showModal({
      title: 'Nieuw ontwerp',
      description: 'Kies het creatieve canvas. Je kunt later tussen de werkruimtes schakelen.',
      confirmText: 'Ontwerp maken',
      body: (body) => {
        const label = document.createElement('label');
        label.className = 'modal-label'; label.textContent = 'Naam van je project';
        const input = document.createElement('input');
        input.className = 'modal-input'; input.id = 'new-project-name'; input.value = 'Mijn eerste ontwerp'; input.maxLength = 80;
        body.append(label, input);
        const gap = document.createElement('div'); gap.style.height = '15px'; body.append(gap);
        const opts = document.createElement('div'); opts.className = 'workspace-options';
        const options = [
          ['pixel', '▧', 'Pixel Lab', 'Foto’s bewerken, tekenen en retoucheren'],
          ['vector', '◇', 'Vector Forge', 'Logo’s, vormen en schaalbare illustraties'],
          ['layout', '▤', 'Page Studio', 'Posters, documenten en meerpagina-opmaak']
        ];
        for (const [key, icon, name, copy] of options) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = `workspace-option ${key === state.modalWorkspace ? 'active' : ''}`;
          button.dataset.workspaceChoice = key;
          button.innerHTML = `<span class="option-icon">${icon}</span><span><strong>${name}</strong><small>${copy}</small></span><span class="radio"></span>`;
          button.addEventListener('click', () => {
            state.modalWorkspace = key;
            opts.querySelectorAll('.workspace-option').forEach(el => el.classList.toggle('active', el.dataset.workspaceChoice === key));
          });
          opts.append(button);
        }
        body.append(opts);
        input.focus(); input.select();
      },
      onConfirm: (body) => {
        const name = (body.querySelector('#new-project-name')?.value || '').trim() || 'Mijn eerste ontwerp';
        const workspace = state.modalWorkspace;
        if (state.project && state.dirty) {
          showModal({
            title: 'Niet-opgeslagen wijzigingen',
            description: 'Sla je huidige project eerst op voordat je een nieuw ontwerp begint. Zo raak je geen werk kwijt.',
            confirmText: 'Opslaan en nieuw ontwerp',
            cancelText: 'Annuleren',
            onConfirm: async () => {
              const saved = await saveProject();
              if (!saved) return false;
              createProject(workspace, name);
              return true;
            }
          });
          return false;
        }
        createProject(workspace, name);
        return true;
      }
    });
  }

  function createProject(workspace = 'pixel', name = 'Mijn eerste ontwerp') {
    state.project = Core.createProject(workspace, name);
    state.filePath = null;
    state.activeWorkspace = workspace;
    state.selectedId = null;
    state.draftObject = null;
    state.undoStack.length = 0; state.redoStack.length = 0;
    state.currentTool = 'select'; state.zoom = 0; state.inspector = 'properties';
    showEditor();
    state.dirty = false;
    cancelRecoveryTimer();
    $('save-state').textContent = 'Nieuw ontwerp · nog niet opgeslagen';
    $('save-button').disabled = false;
    $('save-as-button').disabled = false;
    updateTitle();
    renderAll();
    notify('Je nieuwe ontwerp staat klaar.', 'success');
  }

  function showEditor() {
    $('welcome-screen').classList.add('hidden');
    $('editor-screen').classList.remove('hidden');
    $('save-button').disabled = !state.project;
    $('save-as-button').disabled = !state.project;
    updateTitle();
  }

  function showWelcome() {
    // Keep a loaded project's active workspace valid while showing the welcome screen.
    if (!state.project) state.activeWorkspace = 'home';
    $('editor-screen').classList.add('hidden');
    $('welcome-screen').classList.remove('hidden');
    document.querySelectorAll('.rail-button[data-workspace]').forEach(btn => btn.classList.toggle('active', btn.dataset.workspace === 'home'));
    $('footer-workspace').textContent = 'Welkom';
  }

  function activateWorkspace(workspace, { keepTool = false } = {}) {
    if (workspace === 'video') return;
    if (!['pixel', 'vector', 'layout'].includes(workspace)) return showWelcome();
    if (!state.project) return showNewProjectModal(workspace);
    state.project.workspace = workspace;
    state.activeWorkspace = workspace;
    state.selectedId = null;
    state.draftObject = null;
    state.currentTool = keepTool ? state.currentTool : 'select';
    state.zoom = 0;
    showEditor();
    renderAll();
  }

  function renderWorkspaceChrome() {
    const conf = descriptions[state.activeWorkspace];
    if (!conf) return;
    $('workspace-title').textContent = conf.title;
    $('workspace-subtitle').textContent = conf.subtitle;
    $('workspace-glyph').textContent = conf.glyph;
    $('stage-breadcrumb').textContent = conf.title;
    $('footer-workspace').textContent = conf.title;
    $('pixel-canvas').classList.toggle('hidden', state.activeWorkspace !== 'pixel');
    $('vector-canvas').classList.toggle('hidden', state.activeWorkspace !== 'vector');
    $('layout-canvas').classList.toggle('hidden', state.activeWorkspace !== 'layout');
    const bezierControls = $('bezier-point-controls');
    const isBezierSelection = ['vector', 'layout'].includes(state.activeWorkspace) && selected?.type === 'bezier' && !selectedLocked;
    bezierControls.classList.toggle('hidden', !isBezierSelection);
    if (isBezierSelection) {
      const count = selected.points?.length || 0;
      $('bezier-point-count').textContent = `${count} ${count === 1 ? 'punt' : 'punten'}`;
      $('delete-bezier-point-button').disabled = count <= 2 || !Number.isInteger(state.selectedBezierPointIndex) || state.selectedBezierPointIndex < 0 || state.selectedBezierPointIndex >= count;
      $('add-bezier-point-button').disabled = count >= 100000 || count < 2;
    }
    $('pixel-adjust-section').classList.toggle('hidden', state.activeWorkspace !== 'pixel');
    $('layout-section').classList.toggle('hidden', state.activeWorkspace !== 'layout');
    if ($('page-format-select')) $('page-format-select').value = PAGE_FORMATS[state.project?.layout?.pageFormat] ? state.project.layout.pageFormat : 'a4-portrait';
    document.querySelectorAll('.rail-button[data-workspace]').forEach(btn => btn.classList.toggle('active', btn.dataset.workspace === state.activeWorkspace));
    $('page-status').classList.toggle('hidden', state.activeWorkspace !== 'layout');
    $('import-image-button').textContent = state.activeWorkspace === 'pixel' ? '＋ Afbeelding openen' : state.activeWorkspace === 'layout' ? '＋ Afbeelding plaatsen' : '＋ Afbeelding';
    $('save-as-button').innerHTML = state.activeWorkspace === 'layout' ? '<span>↓</span> PDF / export' : '<span>↓</span> Exporteren';
    const desc = state.activeWorkspace === 'pixel' ? `${state.project.pixel.width} × ${state.project.pixel.height} px` : state.activeWorkspace === 'vector' ? `${state.project.vector.width} × ${state.project.vector.height} px` : `${Math.round(state.project.layout.pages[state.project.layout.currentPage].width / 3.7795)} × ${Math.round(state.project.layout.pages[state.project.layout.currentPage].height / 3.7795)} mm`;
    $('canvas-dimensions').textContent = desc;
  }

  function renderToolList() {
    const list = $('tool-list'); list.innerHTML = '';
    for (const [id, symbol, label, hint] of toolsets[state.activeWorkspace]) {
      const btn = document.createElement('button');
      btn.className = `tool-item ${state.currentTool === id ? 'active' : ''}`;
      btn.dataset.tool = id; btn.title = hint;
      const sym = document.createElement('span'); sym.className = 'tool-symbol'; sym.textContent = symbol;
      const lab = document.createElement('span'); lab.textContent = label;
      btn.append(sym, lab);
      btn.addEventListener('click', () => setTool(id));
      list.append(btn);
    }
    const selected = toolsets[state.activeWorkspace].find(t => t[0] === state.currentTool);
    $('tool-hint').textContent = selected ? selected[3] : 'Kies een gereedschap om te starten.';
  }

  function setTool(tool) {
    state.currentTool = tool;
    renderToolList();
    const canvas = activeSvgOrCanvas();
    if (canvas) canvas.style.cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : ['image', 'eyedropper'].includes(tool) ? 'copy' : 'crosshair';
  }

  function activeSvgOrCanvas() {
    if (state.activeWorkspace === 'pixel') return $('pixel-canvas');
    if (state.activeWorkspace === 'vector') return $('vector-canvas');
    if (state.activeWorkspace === 'layout') return $('layout-canvas');
    return null;
  }

  function renderAll() {
    if (!state.project) return;
    state.project.workspace = state.activeWorkspace;
    renderWorkspaceChrome(); renderToolList();
    renderPixel(); renderSvgWorkspace('vector'); renderSvgWorkspace('layout');
    renderInspector(); renderLayers(); applyCanvasScale(); updateHistoryButtons(); updateTitle();
  }

  function applyCanvasScale() {
    const size = activeDocumentSize();
    const canvas = activeSvgOrCanvas();
    if (!canvas) return;
    const scroll = $('canvas-scroll');
    const maxW = Math.max(150, scroll.clientWidth - 54);
    const maxH = Math.max(150, scroll.clientHeight - 54);
    const fit = Math.min(maxW / size.width, maxH / size.height, 1);
    if (!state.zoom) state.zoom = fit;
    const scale = state.zoom;
    canvas.style.width = `${Math.max(1, size.width * scale)}px`;
    canvas.style.height = `${Math.max(1, size.height * scale)}px`;
    $('zoom-label').textContent = `${Math.round(scale * 100)}%`;
    $('canvas-holder').style.width = `${size.width * scale}px`;
    $('canvas-holder').style.height = `${size.height * scale}px`;
  }

  function setZoom(nextZoom) {
    if (!state.project) return;
    const zoom = Number(nextZoom);
    if (!Number.isFinite(zoom)) return;
    state.zoom = Math.max(0.1, Math.min(3, zoom));
    applyCanvasScale();
  }

  function renderPixel() {
    if (!state.project) return;
    const canvas = $('pixel-canvas');
    const doc = state.project.pixel;
    const width = Math.max(100, Math.min(6000, Number(doc.width) || 1200));
    const height = Math.max(100, Math.min(6000, Number(doc.height) || 800));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.save(); ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    if (doc.baseImage) {
      const token = doc.baseImage;
      const cached = getCachedImage(token);
      if (canvas.dataset.baseToken !== token) {
        canvas.dataset.baseToken = token;
        if (!cached.complete || !cached.naturalWidth) cached.onload = () => { if (state.project && state.project.pixel.baseImage === token) renderPixel(); };
      }
      if (cached && cached.complete && cached.naturalWidth) {
        try { ctx.filter = `brightness(${doc.brightness ?? 100}%) contrast(${doc.contrast ?? 100}%) saturate(${doc.saturation ?? 100}%)`; ctx.drawImage(cached, 0, 0, width, height); ctx.filter = 'none'; } catch (_) {}
      }
    }
    drawPixelObjects(ctx, state.draftObject && state.activeWorkspace === 'pixel' ? [...doc.objects, state.draftObject] : doc.objects, state.selectedId);
    ctx.restore();
    updatePixelAdjustmentLabels();
  }

  const imageCache = new Map();
  function getCachedImage(source) {
    if (!imageCache.has(source)) { const img = new Image(); img.src = source; imageCache.set(source, img); }
    return imageCache.get(source);
  }


  function objectBounds(obj) {
    if (obj.type === 'text') return { x: obj.x, y: obj.y, w: Math.max(50, String(obj.text || '').length * (obj.fontSize || 32) * .62), h: (obj.fontSize || 32) * 1.4 };
    if (obj.type === 'stroke' || obj.type === 'path' || obj.type === 'bezier' || obj.type === 'polygon') {
      const ps = obj.points || []; if (!ps.length) return { x: obj.x, y: obj.y, w: Math.abs(obj.w || 0), h: Math.abs(obj.h || 0) };
      const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    return { x: Math.min(obj.x, obj.x + obj.w), y: Math.min(obj.y, obj.y + obj.h), w: Math.abs(obj.w), h: Math.abs(obj.h) };
  }

  function drawPixelObjects(ctx, objects, selectedId = null) {
    for (const obj of objects || []) {
      if (obj.visible === false) continue;
      ctx.save(); ctx.globalAlpha = obj.opacity ?? 1;
      // Keep the same center-based rotation behaviour in Pixel Lab as in SVG workspaces.
      const rotation = Number(obj.rotation || 0);
      if (Number.isFinite(rotation) && rotation !== 0) {
        const bounds = objectBounds(obj);
        const cx = bounds.x + bounds.w / 2;
        const cy = bounds.y + bounds.h / 2;
        ctx.translate(cx, cy);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }
      if (obj.type === 'stroke' || obj.type === 'path') {
        const points = obj.points || [];
        if (points.length) {
          ctx.globalCompositeOperation = obj.mode === 'erase' ? 'destination-out' : 'source-over';
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = obj.strokeWidth || 3; ctx.strokeStyle = obj.stroke || '#8b7cff';
          ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
          for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
          if (points.length === 1) { ctx.lineTo(points[0].x + .1, points[0].y + .1); }
          ctx.stroke();
        }
      } else if (obj.type === 'polygon') {
        const points = obj.points?.length >= 3 ? obj.points : Core.polygonPoints(obj.polygonKind, obj.x, obj.y, obj.w, obj.h);
        if (points.length >= 3) {
          ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
          for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
          ctx.closePath();
          if (obj.fill && obj.fill !== 'none') { ctx.fillStyle = obj.fill; ctx.fill(); }
          if (obj.stroke && obj.stroke !== 'none' && obj.strokeWidth > 0) { ctx.strokeStyle = obj.stroke; ctx.lineWidth = obj.strokeWidth; ctx.stroke(); }
        }
      } else if (obj.type === 'rect') {
        ctx.beginPath();
        const radius = Math.min(Math.max(0, Number(obj.radius) || 0), Math.abs(obj.w) / 2, Math.abs(obj.h) / 2);
        if (radius > 0) {
          ctx.moveTo(obj.x + radius, obj.y);
          ctx.arcTo(obj.x + obj.w, obj.y, obj.x + obj.w, obj.y + obj.h, radius);
          ctx.arcTo(obj.x + obj.w, obj.y + obj.h, obj.x, obj.y + obj.h, radius);
          ctx.arcTo(obj.x, obj.y + obj.h, obj.x, obj.y, radius);
          ctx.arcTo(obj.x, obj.y, obj.x + obj.w, obj.y, radius);
          ctx.closePath();
        } else ctx.rect(obj.x, obj.y, obj.w, obj.h);
        if (obj.fill && obj.fill !== 'none') { ctx.fillStyle = obj.fill; ctx.fill(); }
        if (obj.stroke && obj.stroke !== 'none' && obj.strokeWidth > 0) { ctx.strokeStyle = obj.stroke; ctx.lineWidth = obj.strokeWidth; ctx.stroke(); }
      } else if (obj.type === 'ellipse') {
        ctx.beginPath(); ctx.ellipse(obj.x + obj.w / 2, obj.y + obj.h / 2, Math.max(0, Math.abs(obj.w / 2)), Math.max(0, Math.abs(obj.h / 2)), 0, 0, Math.PI * 2);
        if (obj.fill && obj.fill !== 'none') { ctx.fillStyle = obj.fill; ctx.fill(); }
        if (obj.stroke && obj.stroke !== 'none' && obj.strokeWidth > 0) { ctx.strokeStyle = obj.stroke; ctx.lineWidth = obj.strokeWidth; ctx.stroke(); }
      } else if (obj.type === 'line') {
        ctx.beginPath(); ctx.moveTo(obj.x, obj.y); ctx.lineTo(obj.x + obj.w, obj.y + obj.h); ctx.strokeStyle = obj.stroke || obj.fill; ctx.lineWidth = obj.strokeWidth || 2; ctx.stroke();
      } else if (obj.type === 'text') {
        ctx.fillStyle = obj.fill || '#121522'; ctx.font = `${obj.fontSize || 32}px ${obj.fontFamily || 'Segoe UI, sans-serif'}`; ctx.textBaseline = 'top';
        String(obj.text || '').split('\n').forEach((line, index) => ctx.fillText(line, obj.x, obj.y + index * (obj.fontSize || 32) * 1.2));
      } else if (obj.type === 'image' && obj.dataUrl) {
        const img = getCachedImage(obj.dataUrl); if (img.complete && img.naturalWidth) ctx.drawImage(img, obj.x, obj.y, obj.w, obj.h);
      }
      if (obj.id === selectedId) {
        const b = objectBounds(obj); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.strokeStyle = '#786aff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(b.x - 4, b.y - 4, Math.max(8, b.w + 8), Math.max(8, b.h + 8)); ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== null) el.setAttribute(key, String(value));
    return el;
  }

  function renderSvgWorkspace(workspace) {
    if (!state.project) return;
    const svg = workspace === 'vector' ? $('vector-canvas') : $('layout-canvas');
    const size = workspace === 'vector' ? state.project.vector : state.project.layout.pages[state.project.layout.currentPage];
    svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
    svg.setAttribute('width', size.width); svg.setAttribute('height', size.height);
    svg.innerHTML = '';
    svg.append(svgEl('rect', { x: 0, y: 0, width: size.width, height: size.height, fill: '#ffffff', 'data-background': 'true' }));
    if (state.vectorGridEnabled && ['vector', 'layout'].includes(workspace)) {
      let gridPath = '';
      for (let x = 0; x <= size.width; x += 40) gridPath += `M ${x} 0 V ${size.height} `;
      for (let y = 0; y <= size.height; y += 40) gridPath += `M 0 ${y} H ${size.width} `;
      svg.append(svgEl('path', { d: gridPath, fill: 'none', stroke: '#94a3b8', 'stroke-opacity': '0.22', 'stroke-width': 1, 'pointer-events': 'none', 'data-editor-grid': 'true' }));
    }
    const baseObjects = workspace === 'vector' ? state.project.vector.objects : size.objects;
    const objects = (workspace === state.activeWorkspace && state.draftObject) ? [...(baseObjects || []), state.draftObject] : (baseObjects || []);
    for (const obj of objects || []) {
      if (obj.visible === false) continue;
      if (obj.type === 'polygon') {
        const points = obj.points?.length >= 3 ? obj.points : Core.polygonPoints(obj.polygonKind, obj.x, obj.y, obj.w, obj.h);
        svg.append(svgEl('polygon', { ...commonSvgAttrs(obj), points: points.map(p => `${p.x},${p.y}`).join(' '), fill: obj.fill || 'none', stroke: obj.stroke || 'none', 'stroke-width': obj.strokeWidth || 0, 'stroke-linejoin': 'round' }));
      } else if (obj.type === 'rect') {
        svg.append(svgEl('rect', { ...commonSvgAttrs(obj), x: obj.x, y: obj.y, width: Math.max(0, obj.w), height: Math.max(0, obj.h), rx: obj.radius || 0, fill: obj.fill || 'none', stroke: obj.stroke || 'none', 'stroke-width': obj.strokeWidth || 0 }));
      } else if (obj.type === 'ellipse') {
        svg.append(svgEl('ellipse', { ...commonSvgAttrs(obj), cx: obj.x + obj.w / 2, cy: obj.y + obj.h / 2, rx: Math.abs(obj.w / 2), ry: Math.abs(obj.h / 2), fill: obj.fill || 'none', stroke: obj.stroke || 'none', 'stroke-width': obj.strokeWidth || 0 }));
      } else if (obj.type === 'line') {
        svg.append(svgEl('line', { ...commonSvgAttrs(obj), x1: obj.x, y1: obj.y, x2: obj.x + obj.w, y2: obj.y + obj.h, stroke: obj.stroke || '#25283a', 'stroke-width': obj.strokeWidth || 2, 'stroke-linecap': 'round' }));
      } else if (obj.type === 'path' || obj.type === 'stroke' || obj.type === 'bezier') {
        const d = obj.type === 'bezier' ? Core.smoothPathData(obj.points || []) : (obj.points || []).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        svg.append(svgEl('path', { ...commonSvgAttrs(obj), d, fill: 'none', stroke: obj.stroke || '#8b7cff', 'stroke-width': obj.strokeWidth || 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      } else if (obj.type === 'text') {
        const text = svgEl('text', { ...commonSvgAttrs(obj), x: obj.x, y: obj.y + (obj.fontSize || 32), fill: obj.fill || '#11131d', 'font-size': obj.fontSize || 32, 'font-family': obj.fontFamily || 'Inter, Segoe UI, sans-serif' });
        const lines = String(obj.text || '').split('\n');
        lines.forEach((line, index) => { const span = svgEl('tspan', { x: obj.x, dy: index === 0 ? 0 : (obj.fontSize || 32) * 1.2 }); span.textContent = line; text.append(span); });
        svg.append(text);
      } else if (obj.type === 'image' && obj.dataUrl) {
        svg.append(svgEl('image', { ...commonSvgAttrs(obj), x: obj.x, y: obj.y, width: Math.max(1, obj.w), height: Math.max(1, obj.h), href: obj.dataUrl, preserveAspectRatio: 'xMidYMid meet' }));
      }
    }
    if (workspace === state.activeWorkspace && state.selectedId) {
      const selected = (objects || []).find(o => o.id === state.selectedId);
      if (selected && selected.visible !== false) {
        const b = objectBounds(selected);
        svg.append(svgEl('rect', { x: b.x - 4, y: b.y - 4, width: Math.max(8, b.w + 8), height: Math.max(8, b.h + 8), fill: 'none', stroke: '#7568ff', 'stroke-width': 2, 'stroke-dasharray': '5 4', 'pointer-events': 'none' }));
        if (['vector', 'layout'].includes(workspace) && selected.type === 'bezier' && state.currentTool === 'select') {
          const points = selected.points || [];
          points.forEach((point, index) => {
            const previous = index > 0 ? Core.bezierSegmentHandles(points, index - 1) : null;
            const next = index < points.length - 1 ? Core.bezierSegmentHandles(points, index) : null;
            for (const [handleType, handle] of [['inHandle', previous?.in], ['outHandle', next?.out]]) {
              if (!handle) continue;
              svg.append(svgEl('line', { x1: point.x, y1: point.y, x2: handle.x, y2: handle.y, stroke: '#8c82ff', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', 'pointer-events': 'none' }));
              svg.append(svgEl('circle', {
                cx: handle.x, cy: handle.y, r: 5.5, fill: '#8c82ff', stroke: '#ffffff', 'stroke-width': 1.5,
                'data-id': selected.id, 'data-point-index': index, 'data-handle-type': handleType,
                'aria-label': `Bézier ${handleType === 'inHandle' ? 'invoer' : 'uitvoer'}-handgreep ${index + 1}`,
                role: 'button', tabindex: 0, style: 'cursor:crosshair'
              }));
            }
            svg.append(svgEl('circle', {
              cx: point.x, cy: point.y, r: state.selectedBezierPointIndex === index ? 8 : 7, fill: state.selectedBezierPointIndex === index ? '#8c82ff' : '#ffffff', stroke: '#635bdb', 'stroke-width': 2,
              'data-id': selected.id, 'data-point-index': index, 'data-point-handle': 'true',
              'aria-label': `Bézier-anker ${index + 1}`, role: 'button', tabindex: 0, style: 'cursor:move'
            }));
          });
        }
      }
    }
  }

  function commonSvgAttrs(obj) {
    const rotation = Number(obj.rotation || 0);
    const transform = rotation ? `rotate(${rotation} ${Number(obj.x || 0) + Number(obj.w || 0) / 2} ${Number(obj.y || 0) + Number(obj.h || 0) / 2})` : undefined;
    return { 'data-id': obj.id, opacity: obj.opacity ?? 1, transform };
  }

  function renderInspector() {
    if (!state.project) return;
    const size = activeDocumentSize();
    $('document-width').value = size.width; $('document-height').value = size.height;
    const objects = activeObjects();
    const selected = objects.find(o => o.id === state.selectedId);
    const selectedLocked = !!selected?.locked;
    $('object-fields').querySelectorAll('input, textarea, button').forEach(field => { field.disabled = !selected || selectedLocked; });
    $('no-selection-note').classList.toggle('hidden', !!selected);
    $('object-fields').classList.toggle('hidden', !selected);
    $('selection-type').textContent = selected ? `${selected.type.charAt(0).toUpperCase() + selected.type.slice(1)}${selectedLocked ? ' · Vergrendeld' : ''}${selected.visible === false ? ' · Verborgen' : ''}` : 'Geen selectie';
    if (selected) {
      $('object-text').value = selected.text || '';
      $('object-x').value = Math.round(selected.x || 0);
      $('object-y').value = Math.round(selected.y || 0);
      $('object-width').value = Math.round(selected.w || 0);
      $('object-height').value = Math.round(selected.h || 0);
      $('object-rotation').value = Math.round(selected.rotation || 0);
      $('keep-aspect').checked = false;
      $('object-text').closest('label').classList.toggle('hidden', selected.type !== 'text');
      $('fill-color').value = toHexColor(selected.fill || '#8b7cff');
      $('stroke-color').value = toHexColor(selected.stroke || '#d9d5ff');
      $('stroke-width').value = Number(selected.strokeWidth ?? 2);
      $('font-size').value = Number(selected.fontSize || 32);
      $('font-size').closest('label').classList.toggle('hidden', selected.type !== 'text');
      $('opacity-slider').value = Math.round((selected.opacity ?? 1) * 100);
      $('opacity-value').textContent = `${$('opacity-slider').value}%`;
    }
    const bezierControls = $('bezier-point-controls');
    const isBezierSelection = ['vector', 'layout'].includes(state.activeWorkspace) && selected?.type === 'bezier' && !selectedLocked;
    bezierControls.classList.toggle('hidden', !isBezierSelection);
    if (isBezierSelection) {
      const count = selected.points?.length || 0;
      $('bezier-point-count').textContent = `${count} ${count === 1 ? 'punt' : 'punten'}`;
      $('delete-bezier-point-button').disabled = count <= 2 || !Number.isInteger(state.selectedBezierPointIndex) || state.selectedBezierPointIndex < 0 || state.selectedBezierPointIndex >= count;
      $('add-bezier-point-button').disabled = count >= 100000 || count < 2;
    }
    $('pixel-adjust-section').classList.toggle('hidden', state.activeWorkspace !== 'pixel');
    $('layout-section').classList.toggle('hidden', state.activeWorkspace !== 'layout');
    if ($('page-format-select')) $('page-format-select').value = PAGE_FORMATS[state.project?.layout?.pageFormat] ? state.project.layout.pageFormat : 'a4-portrait';
    if (state.activeWorkspace === 'layout') {
      const current = state.project.layout.currentPage + 1, total = state.project.layout.pages.length;
      $('page-status').textContent = `Pagina ${current} van ${total}`;
      $('page-count-badge').textContent = `${total} ${total === 1 ? 'pagina' : 'pagina’s'}`;
      $('previous-page-button').disabled = current <= 1; $('next-page-button').disabled = current >= total;
      $('duplicate-page-button').disabled = total >= 500;
      $('delete-page-button').disabled = total <= 1;
    }
    document.querySelectorAll('.inspector-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.inspector === state.inspector));
    $('properties-panel').classList.toggle('hidden', state.inspector !== 'properties');
    $('layers-panel').classList.toggle('hidden', state.inspector !== 'layers');
    updatePixelAdjustmentLabels();
  }

  function toHexColor(value) {
    if (/^#[0-9a-f]{6}$/i.test(value || '')) return value;
    return '#8b7cff';
  }

  function updatePixelAdjustmentLabels() {
    if (!state.project) return;
    const d = state.project.pixel;
    for (const name of ['brightness', 'contrast', 'saturation']) {
      $(`${name}-slider`).value = d[name] ?? 100;
      $(`${name}-value`).textContent = `${d[name] ?? 100}%`;
    }
  }

  function renderLayers() {
    if (!state.project) return;
    const list = $('layer-list'); list.innerHTML = '';
    const objects = activeObjects();
    const selectedIndex = objects.findIndex(o => o.id === state.selectedId);
    const selected = selectedIndex >= 0 ? objects[selectedIndex] : null;
    $('layer-up-button').disabled = selectedIndex < 0 || selectedIndex >= objects.length - 1;
    $('layer-down-button').disabled = selectedIndex <= 0;
    $('duplicate-object-button').disabled = selectedIndex < 0 || !!selected?.locked;
    $('delete-layer-button').disabled = selectedIndex < 0 || !!selected?.locked;
    if (!objects.length) {
      const empty = document.createElement('div'); empty.className = 'empty-layer'; empty.textContent = 'Nog geen objecten. Kies een tool en voeg iets toe.'; list.append(empty); return;
    }
    [...objects].reverse().forEach((obj) => {
      const index = objects.findIndex(o => o.id === obj.id);
      const row = document.createElement('div');
      row.className = `layer-row ${obj.id === state.selectedId ? 'selected' : ''} ${obj.visible === false ? 'layer-hidden' : ''} ${obj.locked ? 'layer-locked' : ''}`;
      row.dataset.id = obj.id;
      const thumb = document.createElement('div'); thumb.className = 'layer-thumb'; thumb.textContent = ({ rect: '▱', ellipse: '◯', line: '／', text: 'T', image: '▧', stroke: '✎', path: '⌁' })[obj.type] || '◈';
      const copy = document.createElement('div'); copy.className = 'layer-copy';
      const title = document.createElement('div'); title.className = 'layer-title';
      title.textContent = obj.type === 'text' ? (obj.text || 'Tekst').split('\n')[0].slice(0, 26) : `${obj.type.charAt(0).toUpperCase()}${obj.type.slice(1)} ${index + 1}`;
      const sub = document.createElement('div'); sub.className = 'layer-sub';
      sub.textContent = `${Math.round((obj.opacity ?? 1) * 100)}% dekking${obj.locked ? ' · vergrendeld' : ''}${obj.visible === false ? ' · verborgen' : ''}`;
      copy.append(title, sub);
      const actions = document.createElement('div'); actions.className = 'layer-row-actions';
      const visibility = document.createElement('button'); visibility.type = 'button'; visibility.className = 'layer-action';
      visibility.textContent = obj.visible === false ? '○' : '◉';
      visibility.title = obj.visible === false ? 'Laag zichtbaar maken' : 'Laag verbergen';
      visibility.setAttribute('aria-label', visibility.title);
      visibility.addEventListener('click', event => { event.stopPropagation(); setLayerProperty(obj.id, 'visible', obj.visible === false); });
      const locking = document.createElement('button'); locking.type = 'button'; locking.className = 'layer-action';
      locking.textContent = obj.locked ? '▣' : '□';
      locking.title = obj.locked ? 'Laag ontgrendelen' : 'Laag vergrendelen';
      locking.setAttribute('aria-label', locking.title);
      locking.addEventListener('click', event => { event.stopPropagation(); setLayerProperty(obj.id, 'locked', !obj.locked); });
      actions.append(visibility, locking);
      row.append(thumb, copy, actions);
      row.addEventListener('click', () => { state.selectedId = obj.id; state.inspector = 'layers'; renderAll(); });
      list.append(row);
    });
  }

  function setLayerProperty(objectId, property, value) {
    if (!state.project) return;
    const objects = activeObjects();
    const object = objects.find(item => item.id === objectId);
    if (!object || !['visible', 'locked'].includes(property)) return;
    checkpoint();
    if (!Core.setObjectFlag(objects, objectId, property, value)) return;
    markDirty(property === 'visible' ? (value ? 'Laag zichtbaar' : 'Laag verborgen') : (value ? 'Laag vergrendeld' : 'Laag ontgrendeld'));
    renderAll();
    notify(property === 'visible' ? (value ? 'Laag zichtbaar gemaakt.' : 'Laag verborgen.') : (value ? 'Laag vergrendeld.' : 'Laag ontgrendeld.'), 'success');
  }

  function coordsFromPointer(event, element, size) {
    const rect = element.getBoundingClientRect();
    let x = (event.clientX - rect.left) * size.width / rect.width;
    let y = (event.clientY - rect.top) * size.height / rect.height;
    if (state.vectorGridEnabled && ['vector', 'layout'].includes(state.activeWorkspace) && element.namespaceURI === NS) {
      const grid = 40;
      x = Math.round(x / grid) * grid;
      y = Math.round(y / grid) * grid;
    }
    return { x, y };
  }

  function findObjectAt(point, objects) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (!o || o.visible === false) continue;
      const b = objectBounds(o);
      if (point.x >= b.x - 8 && point.x <= b.x + b.w + 8 && point.y >= b.y - 8 && point.y <= b.y + b.h + 8) return o;
    }
    return null;
  }

  function eraseObjectAtPoint(point, objects) {
    const target = findObjectAt(point, objects);
    if (!target) { notify('Geen object onder de objectgum.'); return; }
    if (target.locked) { notify('Deze laag is vergrendeld. Ontgrendel haar eerst in het lagenpaneel.', 'error'); return; }
    const index = objects.findIndex(item => item && item.id === target.id);
    if (index < 0) return;
    checkpoint();
    objects.splice(index, 1);
    if (state.selectedId === target.id) {
      state.selectedId = null;
      state.selectedBezierPointIndex = null;
    }
    markDirty('Object verwijderd');
    renderAll();
    notify('Object verwijderd.', 'success');
  }

  function sampleObjectColor(object) {
    const color = [object?.fill, object?.stroke].find(value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
    if (!color) { notify('Deze vorm heeft geen directe HEX-kleur om over te nemen.', 'error'); return; }
    $('fill-color').value = color;
    notify('Kleur ' + color.toUpperCase() + ' overgenomen.', 'success');
  }

  function setShapeFromPoints(obj, start, end) {
    if (obj.type === 'line') {
      obj.x = start.x; obj.y = start.y; obj.w = end.x - start.x; obj.h = end.y - start.y;
    } else if (!['path', 'stroke', 'text', 'image'].includes(obj.type)) {
      obj.x = Math.min(start.x, end.x); obj.y = Math.min(start.y, end.y);
      obj.w = Math.abs(end.x - start.x); obj.h = Math.abs(end.y - start.y);
      if (obj.type === 'polygon') obj.points = Core.polygonPoints(obj.polygonKind, obj.x, obj.y, obj.w, obj.h);
      if (obj.type === 'rect' && Number(obj.radius) > 0) obj.radius = Math.min(Math.round(Math.min(obj.w, obj.h) * 0.18), obj.w / 2, obj.h / 2);
    }
    return obj;
  }

  function makeDrawObject(tool, start, end) {
    const color = $('fill-color').value || '#8b7cff';
    const stroke = $('stroke-color').value || '#d9d5ff';
    const width = Number($('stroke-width').value || 2);
    if (tool === 'brush' || tool === 'eraser' || tool === 'pen') {
      return Core.makeObject(tool === 'pen' ? 'path' : 'stroke', start.x, start.y, 0, 0, {
        fill: color, stroke: tool === 'eraser' ? '#000000' : stroke, strokeWidth: tool === 'brush' ? Math.max(1, width * 2) : width,
        mode: tool === 'eraser' ? 'erase' : 'paint', points: [{ x: start.x, y: start.y }]
      });
    }
    if (tool === 'text') return Core.makeObject('text', start.x, start.y, 0, 0, { fill: color, stroke, strokeWidth: width, fontSize: Number($('font-size').value || 32), text: 'Jouw tekst' });
    if (tool === 'image') return null;
    if (tool === 'roundrect') {
      return Core.makeObject('rect', start.x, start.y, end.x - start.x, end.y - start.y, { fill: color, stroke, strokeWidth: width, radius: 4 });
    }
    if (POLYGON_TOOLS.has(tool)) {
      return Core.makeObject('polygon', start.x, start.y, end.x - start.x, end.y - start.y, { fill: color, stroke, strokeWidth: width, polygonKind: tool, points: Core.polygonPoints(tool, start.x, start.y, Math.abs(end.x - start.x), Math.abs(end.y - start.y)) });
    }
    return Core.makeObject(tool, start.x, start.y, end.x - start.x, end.y - start.y, { fill: color, stroke, strokeWidth: width });
  }

  function finishDrawObject(obj) {
    if (!obj) return;
    if ((obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'polygon') && (obj.w < 2 || obj.h < 2)) { obj.w = Math.max(obj.w, 2); obj.h = Math.max(obj.h, 2); if (obj.type === 'polygon') obj.points = Core.polygonPoints(obj.polygonKind, obj.x, obj.y, obj.w, obj.h); }
    if ((obj.type === 'line') && Math.abs(obj.w) + Math.abs(obj.h) < 2) return;
    checkpoint();
    activeObjects().push(obj);
    state.selectedId = obj.id;
    state.draftObject = null; state.pointerStart = null; state.drawing = false;
    markDirty(); renderAll();
  }

  function finishBezierPath() {
    const obj = state.draftObject;
    if (!obj || obj.type !== 'bezier') return false;
    if ((obj.points || []).length < 2) {
      state.draftObject = null;
      renderSvgWorkspace(state.activeWorkspace);
      notify('Plaats minimaal twee ankerpunten voor een Bézier-curve.', 'error');
      return false;
    }
    checkpoint();
    activeObjects().push(obj);
    state.selectedId = obj.id;
    state.draftObject = null;
    state.pointerStart = null;
    state.drawing = false;
    state.dragMode = null;
    markDirty('Bézier-curve toegevoegd');
    renderAll();
    notify('Bézier-curve toegevoegd.', 'success');
    return true;
  }

  function svgPointerDown(event, workspace) {
    if (!state.project || event.button !== 0) return;
    const svg = workspace === 'vector' ? $('vector-canvas') : $('layout-canvas');
    if (workspace !== state.activeWorkspace) return;
    const size = activeDocumentSize(), point = coordsFromPointer(event, svg, size), objects = activeObjects();
    const pointHandle = event.target.closest('[data-point-index]');
    if (state.currentTool === 'select' && ['vector', 'layout'].includes(workspace) && pointHandle) {
      const targetObject = objects.find(o => o.id === pointHandle.getAttribute('data-id'));
      const pointIndex = Number(pointHandle.getAttribute('data-point-index'));
      const handleType = pointHandle.getAttribute('data-handle-type');
      if (targetObject?.type === 'bezier' && !targetObject.locked && Number.isInteger(pointIndex) && targetObject.points?.[pointIndex]) {
        state.selectedId = targetObject.id;
        state.selectedBezierPointIndex = pointIndex;
        state.movingObject = targetObject;
        state.bezierPointIndex = pointIndex;
        state.bezierHandleType = ['inHandle', 'outHandle'].includes(handleType) ? handleType : null;
        state.pointerStart = point;
        state.lastPointer = point;
        state.dragHistoryRecorded = false;
        state.dragHasMoved = false;
        state.dragMode = state.bezierHandleType ? 'handle' : 'point';
        svg.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        return;
      }
    }
    const idEl = event.target.closest('[data-id]');
    const target = idEl ? objects.find(o => o.id === idEl.getAttribute('data-id')) : null;
    if (state.currentTool === 'object-eraser') { eraseObjectAtPoint(point, objects); return; }
    if (state.currentTool === 'eyedropper') {
      const sampled = target || findObjectAt(point, objects);
      if (sampled) sampleObjectColor(sampled);
      else notify('Klik op een vorm om de vul- of lijnkleur over te nemen.');
      return;
    }
    if (state.currentTool === 'select') {
      if (target) {
        if (state.selectedId !== target.id) state.selectedBezierPointIndex = null;
        state.selectedId = target.id;
        if (target.locked) { state.movingObject = null; state.pointerStart = null; state.dragMode = null; renderAll(); notify('Deze laag is vergrendeld. Ontgrendel haar eerst in het lagenpaneel.'); return; }
        state.movingObject = target;
        state.pointerStart = point;
        state.lastPointer = point;
        state.dragHistoryRecorded = false;
        state.dragHasMoved = false;
        state.dragMode = 'move';
        svg.setPointerCapture?.(event.pointerId);
      } else { state.selectedId = null; state.selectedBezierPointIndex = null; state.movingObject = null; state.dragMode = null; }
      renderAll(); return;
    }
    if (state.currentTool === 'bezier' && workspace !== 'pixel') {
      if (!state.draftObject || state.draftObject.type !== 'bezier') {
        const color = $('stroke-color').value || '#d9d5ff';
        state.draftObject = Core.makeObject('bezier', point.x, point.y, 0, 0, { fill: 'none', stroke: color, strokeWidth: Number($('stroke-width').value || 2), points: [point] });
      } else {
        const last = state.draftObject.points[state.draftObject.points.length - 1];
        if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1) state.draftObject.points.push(point);
      }
      state.pointerStart = null; state.dragMode = null; state.drawing = false;
      renderSvgWorkspace(workspace); return;
    }
    if (state.currentTool === 'text') {
      checkpoint(); const obj = makeDrawObject('text', point, point); objects.push(obj); state.selectedId = obj.id; state.inspector = 'properties'; markDirty(); renderAll(); $('object-text').focus(); $('object-text').select(); return;
    }
    if (state.currentTool === 'image') { importImage(); return; }
    const obj = makeDrawObject(state.currentTool, point, point);
    if (!obj) return;
    state.pointerStart = point; state.draftObject = obj; state.drawing = true; state.dragMode = 'draw';
    svg.setPointerCapture?.(event.pointerId); renderSvgWorkspace(workspace);
  }

  function svgPointerMove(event, workspace) {
    if (!state.project || !state.pointerStart || workspace !== state.activeWorkspace) return;
    const svg = workspace === 'vector' ? $('vector-canvas') : $('layout-canvas');
    const size = activeDocumentSize(), point = coordsFromPointer(event, svg, size);
    if ((state.dragMode === 'point' || state.dragMode === 'handle') && state.movingObject?.type === 'bezier' && Number.isInteger(state.bezierPointIndex)) {
      const anchor = state.movingObject.points[state.bezierPointIndex];
      if (anchor && state.dragMode === 'point') {
        const dx = point.x - anchor.x, dy = point.y - anchor.y;
        if (dx !== 0 || dy !== 0) {
          checkpointDragMutation();
          anchor.x = point.x; anchor.y = point.y;
          for (const name of ['inHandle', 'outHandle']) if (anchor[name]) { anchor[name].x += dx; anchor[name].y += dy; }
          state.dragHasMoved = true;
        }
      } else if (anchor && state.bezierHandleType) {
        const previousHandle = anchor[state.bezierHandleType];
        if (!previousHandle || previousHandle.x !== point.x || previousHandle.y !== point.y) {
          checkpointDragMutation();
          anchor[state.bezierHandleType] = { x: point.x, y: point.y };
          state.dragHasMoved = true;
        }
      }
      renderSvgWorkspace(workspace);
      return;
    }
    if (state.dragMode === 'move' && state.movingObject) {
      const previousPoint = state.lastPointer || state.pointerStart;
      if (!previousPoint) return;
      const dx = point.x - previousPoint.x, dy = point.y - previousPoint.y;
      if (dx === 0 && dy === 0) return;
      checkpointDragMutation();
      state.movingObject.x += dx; state.movingObject.y += dy;
      if (state.movingObject.points?.length) state.movingObject.points.forEach(p => { p.x += dx; p.y += dy; for (const name of ['inHandle', 'outHandle']) if (p[name]) { p[name].x += dx; p[name].y += dy; } });
      state.lastPointer = point;
      state.dragHasMoved = true;
      renderSvgWorkspace(workspace); return;
    }
    if (state.dragMode === 'draw' && state.draftObject) {
      if (state.draftObject.type === 'path') state.draftObject.points.push({ x: point.x, y: point.y });
      else setShapeFromPoints(state.draftObject, state.pointerStart, point);
      renderSvgWorkspace(workspace);
    }
  }

  function svgPointerUp(event, workspace) {
    if (!state.project || workspace !== state.activeWorkspace) return;
    if (state.currentTool === 'bezier' && workspace !== 'pixel') return;
    const svg = workspace === 'vector' ? $('vector-canvas') : $('layout-canvas');
    const size = activeDocumentSize(), point = coordsFromPointer(event, svg, size);
    if (state.dragMode === 'draw' && state.draftObject) {
      if (state.draftObject.type === 'path') state.draftObject.points.push(point);
      else setShapeFromPoints(state.draftObject, state.pointerStart, point);
      finishDrawObject(state.draftObject);
    } else if ((state.dragMode === 'move' || state.dragMode === 'point' || state.dragMode === 'handle') && state.movingObject) {
      const completedDragMode = state.dragMode;
      const didMove = state.dragHasMoved;
      state.pointerStart = null; state.lastPointer = null; state.movingObject = null; state.dragMode = null;
      state.bezierPointIndex = null; state.bezierHandleType = null;
      if (didMove) markDirty(completedDragMode === 'point' ? 'Bézier-anker aangepast' : completedDragMode === 'handle' ? 'Bézier-handgreep aangepast' : 'Niet opgeslagen');
      renderAll();
    }
    state.pointerStart = null; state.lastPointer = null; state.drawing = false; state.dragMode = null; state.bezierPointIndex = null; state.bezierHandleType = null;
    state.dragHistoryRecorded = false; state.dragHasMoved = false;
  }

  function pixelPointerDown(event) {
    if (!state.project || event.button !== 0 || state.activeWorkspace !== 'pixel') return;
    const canvas = $('pixel-canvas'), size = activeDocumentSize(), point = coordsFromPointer(event, canvas, size), objects = activeObjects();
    if (state.currentTool === 'eyedropper') {
      try {
        const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(point.x)));
        const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(point.y)));
        const pixel = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
        $('fill-color').value = '#' + [...pixel].slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('');
        notify('Kleur ' + $('fill-color').value.toUpperCase() + ' overgenomen.', 'success');
      } catch (_) {
        notify('Deze pixelkleur kon niet worden gelezen. Probeer een andere plek.', 'error');
      }
      return;
    }
    if (state.currentTool === 'select') {
      const target = findObjectAt(point, objects);
      state.selectedId = target?.id || null;
      if (target) {
        if (target.locked) { renderAll(); notify('Deze laag is vergrendeld. Ontgrendel haar eerst in het lagenpaneel.'); return; }
        state.movingObject = target; state.pointerStart = point; state.lastPointer = point; state.dragMode = 'move';
        state.dragHistoryRecorded = false; state.dragHasMoved = false;
        canvas.setPointerCapture?.(event.pointerId);
      }
      renderAll(); return;
    }
    if (state.currentTool === 'text') {
      checkpoint(); const obj = makeDrawObject('text', point, point); objects.push(obj); state.selectedId = obj.id; state.inspector = 'properties'; markDirty(); renderAll(); $('object-text').focus(); $('object-text').select(); return;
    }
    if (state.currentTool === 'image') { importImage(); return; }
    const obj = makeDrawObject(state.currentTool, point, point);
    if (!obj) return;
    state.pointerStart = point; state.lastPointer = point; state.draftObject = obj; state.drawing = true; state.dragMode = 'draw';
    canvas.setPointerCapture?.(event.pointerId); renderPixel();
  }

  function pixelPointerMove(event) {
    if (!state.project || state.activeWorkspace !== 'pixel') return;
    const canvas = $('pixel-canvas'), size = activeDocumentSize(), point = coordsFromPointer(event, canvas, size);
    $('status-message').innerHTML = `<i class="status-led"></i> X: ${Math.round(point.x)} · Y: ${Math.round(point.y)}`;
    if (state.dragMode === 'move' && state.movingObject && state.lastPointer) {
      const dx = point.x - state.lastPointer.x, dy = point.y - state.lastPointer.y;
      if (dx === 0 && dy === 0) return;
      checkpointDragMutation();
      state.movingObject.x += dx; state.movingObject.y += dy;
      if (state.movingObject.points?.length) state.movingObject.points.forEach(p => { p.x += dx; p.y += dy; for (const name of ['inHandle', 'outHandle']) if (p[name]) { p[name].x += dx; p[name].y += dy; } });
      state.lastPointer = point; state.dragHasMoved = true;
      renderPixel(); return;
    }
    if (state.dragMode !== 'draw' || !state.draftObject || !state.pointerStart) return;
    if (state.draftObject.type === 'stroke' || state.draftObject.type === 'path') state.draftObject.points.push(point);
    else setShapeFromPoints(state.draftObject, state.pointerStart, point);
    const all = [...activeObjects(), state.draftObject];
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const doc = state.project.pixel;
    if (doc.baseImage) { const img = getCachedImage(doc.baseImage); if (img.complete && img.naturalWidth) { ctx.save(); ctx.filter = `brightness(${doc.brightness}%) contrast(${doc.contrast}%) saturate(${doc.saturation}%)`; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); ctx.restore(); } }
    drawPixelObjects(ctx, all, null);
  }

  function pixelPointerUp(event) {
    if (!state.project || state.activeWorkspace !== 'pixel') return;
    const canvas = $('pixel-canvas'), point = coordsFromPointer(event, canvas, activeDocumentSize());
    if (state.dragMode === 'draw' && state.draftObject) {
      if (state.draftObject.type === 'stroke' || state.draftObject.type === 'path') state.draftObject.points.push(point);
      else setShapeFromPoints(state.draftObject, state.pointerStart, point);
      finishDrawObject(state.draftObject);
    } else if (state.dragMode === 'move' && state.movingObject) {
      const didMove = state.dragHasMoved;
      state.pointerStart = null; state.lastPointer = null; state.movingObject = null; state.dragMode = null;
      if (didMove) markDirty();
      renderAll();
    }
    state.pointerStart = null; state.lastPointer = null; state.drawing = false; state.dragMode = null;
    state.dragHistoryRecorded = false; state.dragHasMoved = false;
  }

  function addBezierAnchor() {
    const object = activeObjects().find(item => item.id === state.selectedId && item.type === 'bezier');
    if (!object || !['vector', 'layout'].includes(state.activeWorkspace) || object.locked || object.points.length < 2) return;
    let segmentIndex = 0, longest = -1;
    for (let i = 0; i < object.points.length - 1; i++) {
      const a = object.points[i], b = object.points[i + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > longest) { longest = length; segmentIndex = i; }
    }
    const split = Core.splitBezierSegment(object.points, segmentIndex, 0.5);
    if (!split) { notify('Dit curve-segment kon niet worden gesplitst.', 'error'); return; }
    checkpoint();
    object.points = split.points;
    state.selectedBezierPointIndex = split.index;
    markDirty('Bézier-anker toegevoegd'); renderAll();
    notify('Ankerpunt toegevoegd aan het langste segment.', 'success');
  }

  function deleteBezierAnchor() {
    const object = activeObjects().find(item => item.id === state.selectedId && item.type === 'bezier');
    const index = state.selectedBezierPointIndex;
    if (!object || object.locked || object.points.length <= 2 || !Number.isInteger(index)) return;
    const points = Core.deleteBezierAnchor(object.points, index);
    if (!points) return;
    checkpoint(); object.points = points;
    state.selectedBezierPointIndex = Math.min(index, points.length - 1);
    markDirty('Bézier-anker verwijderd'); renderAll();
    notify('Ankerpunt verwijderd. De curve is opnieuw berekend.', 'success');
  }

  function applyPixelCrop() {
    if (!state.project || state.activeWorkspace !== 'pixel') {
      notify('Bijsnijden is beschikbaar in Pixel Lab.', 'error');
      return;
    }
    const doc = state.project.pixel;
    const x = Number($('crop-x').value);
    const y = Number($('crop-y').value);
    const width = Number($('crop-width').value);
    const height = Number($('crop-height').value);
    if (![x, y, width, height].every(Number.isFinite) || ![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width < 100 || height < 100 || x + width > doc.width || y + height > doc.height || width > 6000 || height > 6000) {
      notify(`Ongeldige uitsnede. Kies X/Y binnen het canvas en een breedte/hoogte van 100–${Math.max(doc.width, doc.height)} px.`, 'error');
      return;
    }
    if (x === 0 && y === 0 && width === doc.width && height === doc.height) {
      notify('De uitsnede is gelijk aan het huidige canvas.');
      return;
    }
    let croppedDataUrl = doc.baseImage;
    if (doc.baseImage) {
      const image = getCachedImage(doc.baseImage);
      if (!image.complete || !image.naturalWidth) {
        notify('De afbeelding wordt nog geladen. Probeer het zo opnieuw.', 'error');
        return;
      }
      try {
        const output = document.createElement('canvas');
        output.width = width; output.height = height;
        const ctx = output.getContext('2d');
        const sourceX = x * image.naturalWidth / doc.width;
        const sourceY = y * image.naturalHeight / doc.height;
        const sourceWidth = width * image.naturalWidth / doc.width;
        const sourceHeight = height * image.naturalHeight / doc.height;
        ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
        croppedDataUrl = output.toDataURL('image/png');
        imageCache.set(croppedDataUrl, (() => { const next = new Image(); next.src = croppedDataUrl; return next; })());
      } catch (error) {
        notify(`Bijsnijden is mislukt: ${error.message || 'afbeelding kon niet worden verwerkt'}`, 'error');
        return;
      }
    }
    checkpoint();
    doc.baseImage = croppedDataUrl;
    doc.width = width; doc.height = height;
    for (const obj of doc.objects || []) {
      if (Number.isFinite(obj.x)) obj.x -= x;
      if (Number.isFinite(obj.y)) obj.y -= y;
      if (Array.isArray(obj.points)) {
        for (const point of obj.points) {
          if (Number.isFinite(point.x)) point.x -= x;
          if (Number.isFinite(point.y)) point.y -= y;
          for (const name of ['inHandle', 'outHandle']) if (point[name]) { if (Number.isFinite(point[name].x)) point[name].x -= x; if (Number.isFinite(point[name].y)) point[name].y -= y; }
        }
      }
    }
    $('pixel-canvas').dataset.baseToken = croppedDataUrl || '';
    $('crop-x').value = '0'; $('crop-y').value = '0';
    $('crop-width').value = String(width); $('crop-height').value = String(height);
    markDirty('Canvas bijgesneden');
    renderAll();
    notify(`Canvas bijgesneden naar ${width} × ${height} px.`, 'success');
  }

  async function importImage() {
    if (!state.project) { showNewProjectModal('pixel'); return; }
    try {
      const file = await window.fluxivora.openImage();
      if (!file) return;
      if (state.activeWorkspace === 'pixel') {
        const image = new Image(); image.src = file.dataUrl;
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
        checkpoint();
        state.project.pixel.baseImage = file.dataUrl;
        state.project.pixel.width = Math.max(100, Math.min(6000, image.naturalWidth));
        state.project.pixel.height = Math.max(100, Math.min(6000, image.naturalHeight));
        state.project.pixel.brightness = 100; state.project.pixel.contrast = 100; state.project.pixel.saturation = 100;
        $('pixel-canvas').dataset.baseToken = file.dataUrl; imageCache.set(file.dataUrl, image);
        notify(`Afbeelding geïmporteerd: ${file.name}`, 'success');
      } else {
        const image = new Image(); image.src = file.dataUrl;
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
        checkpoint();
        const limitW = state.activeWorkspace === 'vector' ? state.project.vector.width * .56 : state.project.layout.pages[state.project.layout.currentPage].width * .55;
        const limitH = state.activeWorkspace === 'vector' ? state.project.vector.height * .56 : state.project.layout.pages[state.project.layout.currentPage].height * .38;
        const scale = Math.min(limitW / image.naturalWidth, limitH / image.naturalHeight, 1);
        const obj = Core.makeObject('image', 70, 85, Math.max(10, image.naturalWidth * scale), Math.max(10, image.naturalHeight * scale), { dataUrl: file.dataUrl, fill: 'none', stroke: 'none', strokeWidth: 0 });
        activeObjects().push(obj); state.selectedId = obj.id;
        notify(`Afbeelding geplaatst: ${file.name}`, 'success');
      }
      markDirty(); renderAll();
    } catch (err) {
      notify(`Afbeelding kon niet worden geopend: ${err.message || 'onbekende fout'}`, 'error');
    }
  }

  async function openProjectFile() {
    try {
      const opened = await window.fluxivora.openProject();
      if (!opened) return;
      const parsed = Core.normaliseProject(JSON.parse(opened.json));
      state.project = parsed; state.filePath = opened.filePath; state.activeWorkspace = parsed.workspace || 'pixel';
      state.selectedId = null; state.selectedBezierPointIndex = null; state.draftObject = null; state.undoStack.length = 0; state.redoStack.length = 0; state.zoom = 0;
      showEditor(); await markSaved(); renderAll(); notify('Project geopend.', 'success');
    } catch (err) {
      notify(`Project niet geopend: ${err.message || 'controleer het bestand.'}`, 'error');
    }
  }

  async function openProject() {
    if (state.project && state.dirty) {
      showModal({
        title: 'Niet-opgeslagen wijzigingen',
        description: 'Sla je huidige project eerst op voordat je een ander project opent. Zo raak je geen werk kwijt.',
        confirmText: 'Opslaan en openen',
        cancelText: 'Annuleren',
        onConfirm: async () => {
          const saved = await saveProject();
          if (!saved) return false;
          await openProjectFile();
          return true;
        }
      });
      return;
    }
    await openProjectFile();
  }

  async function saveProject(asNew = false) {
    if (!state.project) return false;
    try {
      state.project.workspace = state.activeWorkspace;
      const payload = { name: state.project.name, json: JSON.stringify(state.project, null, 2), filePath: asNew ? null : state.filePath };
      const result = await window.fluxivora.saveProject(payload);
      if (!result) return false;
      state.filePath = result.filePath;
      await markSaved();
      notify('Project lokaal opgeslagen.', 'success');
      return true;
    } catch (err) {
      notify(`Opslaan mislukt: ${err.message || 'onbekende fout'}`, 'error');
      return false;
    }
  }

  async function createPixelExportCanvas() {
    const doc = state.project.pixel;
    const scaleValue = Number($('export-scale-select')?.value || 1);
    const scale = [1, 2, 3].includes(scaleValue) ? scaleValue : 1;
    const width = Math.max(1, Number(doc.width) || 1200);
    const height = Math.max(1, Number(doc.height) || 800);
    const outputWidth = width * scale;
    const outputHeight = height * scale;
    if (outputWidth > 16000 || outputHeight > 16000 || outputWidth * outputHeight > 50000000) {
      throw new Error('Deze exportresolutie is te groot voor veilig geheugenverbruik. Kies een lagere PNG-exportresolutie.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Het exportcanvas kon niet worden aangemaakt.');
    ctx.scale(scale, scale);
    if (!$('export-transparent-background').checked) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
    if (doc.baseImage) {
      const image = getCachedImage(doc.baseImage);
      if (image.complete && !image.naturalWidth) throw new Error('De basisafbeelding kon niet worden geladen.');
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          const onLoad = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error('De basisafbeelding kon niet worden geladen.')); };
          const cleanup = () => { image.removeEventListener('load', onLoad); image.removeEventListener('error', onError); };
          image.addEventListener('load', onLoad, { once: true });
          image.addEventListener('error', onError, { once: true });
        });
      }
      ctx.save();
      ctx.filter = `brightness(${doc.brightness ?? 100}%) contrast(${doc.contrast ?? 100}%) saturate(${doc.saturation ?? 100}%)`;
      ctx.drawImage(image, 0, 0, width, height);
      ctx.restore();
    }
    // Selection outlines are editor UI, not part of the user's artwork.
    drawPixelObjects(ctx, doc.objects, null);
    return canvas;
  }

  async function exportCurrent() {
    if (!state.project) return;
    try {
      if (state.activeWorkspace === 'pixel') {
        const canvas = await createPixelExportCanvas();
        const data = canvas.toDataURL('image/png').split(',')[1];
        const result = await window.fluxivora.exportFile({ title: 'Afbeelding exporteren', suggestedName: `${state.project.name || 'Fluxivora'}-export.png`, base64Data: data, filters: [{ name: 'PNG-afbeelding', extensions: ['png'] }] });
        if (result) notify(`PNG geëxporteerd op ${canvas.width} × ${canvas.height} px${$('export-transparent-background').checked ? ' met transparante achtergrond waar mogelijk' : ' zonder selectie-rand'}.`, 'success');
      } else if (state.activeWorkspace === 'vector') {
        const svgOptions = $('export-transparent-background').checked ? {} : { background: '#ffffff' };
        const svg = Core.serializeSvg(state.project.vector.width, state.project.vector.height, state.project.vector.objects, svgOptions);
        const result = await window.fluxivora.exportFile({ title: 'Vectorontwerp exporteren', suggestedName: `${state.project.name || 'Fluxivora'}-vector.svg`, content: svg, filters: [{ name: 'SVG-vectorbestand', extensions: ['svg'] }] });
        if (result) notify($('export-transparent-background').checked ? 'SVG geëxporteerd met transparante achtergrond.' : 'Vectorbestand geëxporteerd als SVG met witte achtergrond.', 'success');
      } else {
        exportLayoutPdf();
      }
    } catch (err) {
      notify(`Exporteren mislukt: ${err.message || 'onbekende fout'}`, 'error');
    }
  }

  const PAGE_FORMATS = {
    'a4-portrait': { width: 794, height: 1123, cssSize: 'A4 portrait', cssWidth: '210mm', cssHeight: '297mm' },
    'a4-landscape': { width: 1123, height: 794, cssSize: 'A4 landscape', cssWidth: '297mm', cssHeight: '210mm' },
    'a5-portrait': { width: 559, height: 794, cssSize: 'A5 portrait', cssWidth: '148mm', cssHeight: '210mm' },
    'letter-portrait': { width: 816, height: 1056, cssSize: 'Letter portrait', cssWidth: '8.5in', cssHeight: '11in' }
  };

  function applyPageFormat() {
    if (!state.project || state.activeWorkspace !== 'layout') return;
    const formatKey = $('page-format-select').value;
    const format = PAGE_FORMATS[formatKey];
    if (!format) { notify('Kies een geldig papierformaat.', 'error'); return; }
    checkpoint();
    const layout = state.project.layout;
    layout.pageFormat = formatKey;
    markDirty(); renderAll();
    notify(`PDF-papierformaat ingesteld op ${format.cssSize} voor alle ${layout.pages.length} pagina’s. De inhoud wordt passend geschaald.`, 'success');
  }

  function exportLayoutPdf() {
    if (!state.project) return;
    const pages = state.project.layout.pages;
    const format = PAGE_FORMATS[state.project.layout.pageFormat] || PAGE_FORMATS['a4-portrait'];
    let printStyle = document.getElementById('print-format-style');
    if (!printStyle) { printStyle = document.createElement('style'); printStyle.id = 'print-format-style'; document.head.append(printStyle); }
    printStyle.textContent = `@media print { @page { size: ${format.cssSize}; margin: 0; } #print-container .print-page { width: ${format.cssWidth}; height: ${format.cssHeight}; } }`;
    const pagesToPrint = pages;
    const print = $('print-container'); print.innerHTML = '';
    pagesToPrint.forEach((page) => {
      const wrapper = document.createElement('div'); wrapper.className = 'print-page';
      const markup = Core.serializeSvg(page.width, page.height, page.objects, { background: '#ffffff' });
      wrapper.innerHTML = markup.replace(/^<\?xml[^>]*\?>\s*/, '');
      print.append(wrapper);
    });
    notify('Kies in het afdrukvenster “Opslaan als PDF”.', 'success');
    // Keep print-only markup and paper-size rules out of the editor after the dialog closes.
    const cleanupPrintExport = () => {
      window.removeEventListener('afterprint', cleanupPrintExport);
      print.replaceChildren();
      printStyle.remove();
    };
    window.addEventListener('afterprint', cleanupPrintExport);
    window.setTimeout(() => window.print(), 180);
  }

  function addPage() {
    if (!state.project || state.activeWorkspace !== 'layout') return;
    checkpoint();
    const n = state.project.layout.pages.length + 1;
    state.project.layout.pages.push({ width: state.project.layout.width || 794, height: state.project.layout.height || 1123, name: `Pagina ${n}`, objects: [] });
    state.project.layout.currentPage = state.project.layout.pages.length - 1;
    state.selectedId = null; markDirty(); renderAll(); notify(`Pagina ${n} toegevoegd.`, 'success');
  }

  function duplicatePage() {
    if (!state.project || state.activeWorkspace !== 'layout') return;
    checkpoint();
    const pages = state.project.layout.pages;
    const source = pages[state.project.layout.currentPage];
    const copy = JSON.parse(JSON.stringify(source));
    copy.name = `Pagina ${pages.length + 1}`;
    copy.objects = (copy.objects || []).map(obj => Core.duplicateObject(obj, 0));
    const nextIndex = state.project.layout.currentPage + 1;
    pages.splice(nextIndex, 0, copy);
    state.project.layout.currentPage = nextIndex;
    state.selectedId = null; markDirty(); renderAll(); notify('Pagina gedupliceerd.', 'success');
  }

  function deletePage() {
    if (!state.project || state.activeWorkspace !== 'layout') return;
    const pages = state.project.layout.pages;
    if (pages.length <= 1) { notify('Een document moet minstens één pagina bevatten.'); return; }
    checkpoint();
    pages.splice(state.project.layout.currentPage, 1);
    state.project.layout.currentPage = Math.max(0, Math.min(state.project.layout.currentPage, pages.length - 1));
    state.selectedId = null; markDirty(); renderAll(); notify('Pagina verwijderd.');
  }

  function switchPage(delta) {
    if (!state.project || state.activeWorkspace !== 'layout') return;
    const current = state.project.layout.currentPage;
    const target = Math.max(0, Math.min(state.project.layout.pages.length - 1, current + delta));
    if (target === current) return;
    state.project.layout.currentPage = target; state.selectedId = null; renderAll();
  }

  function deleteSelected() {
    if (!state.project || !state.selectedId) return;
    const objects = activeObjects(), idx = objects.findIndex(o => o.id === state.selectedId);
    if (idx < 0) return;
    if (objects[idx].locked) { notify('Ontgrendel deze laag voordat je haar verwijdert.'); return; }
    checkpoint();
    objects.splice(idx, 1);
    state.selectedId = null; markDirty(); renderAll(); notify('Object verwijderd.');
  }

  function nudgeSelected(dx, dy, recordHistory = true) {
    if (!state.project || !state.selectedId) return false;
    const object = activeObjects().find(item => item.id === state.selectedId);
    if (!object) return false;
    if (object.locked) { if (recordHistory) notify('Ontgrendel deze laag voordat je haar verplaatst.'); return true; }
    if (recordHistory) checkpoint();
    object.x = (Number(object.x) || 0) + dx;
    object.y = (Number(object.y) || 0) + dy;
    if (Array.isArray(object.points)) {
      for (const point of object.points) {
        point.x = (Number(point.x) || 0) + dx;
        point.y = (Number(point.y) || 0) + dy;
        for (const handleName of ['inHandle', 'outHandle']) {
          if (point[handleName]) {
            point[handleName].x = (Number(point[handleName].x) || 0) + dx;
            point[handleName].y = (Number(point[handleName].y) || 0) + dy;
          }
        }
      }
    }
    markDirty();
    renderAll();
    return true;
  }

  function duplicateSelected() {
    if (!state.project || !state.selectedId) return;
    const objects = activeObjects();
    const index = objects.findIndex(obj => obj.id === state.selectedId);
    if (index < 0) return;
    if (objects[index].locked) { notify('Ontgrendel deze laag voordat je haar dupliceert.'); return; }
    checkpoint();
    const duplicate = Core.duplicateObject(objects[index], 20);
    objects.splice(index + 1, 0, duplicate);
    state.selectedId = duplicate.id; state.inspector = 'layers'; markDirty(); renderAll(); notify('Object gedupliceerd.', 'success');
  }

  function copySelected() {
    if (!state.project || !state.selectedId) return;
    const object = activeObjects().find(item => item.id === state.selectedId);
    if (!object) return;
    state.clipboardObject = JSON.parse(JSON.stringify(object));
    notify('Object gekopieerd. Gebruik Ctrl+V om het te plakken.', 'success');
  }

  function pasteCopied() {
    if (!state.project || !state.clipboardObject) return;
    const duplicate = Core.duplicateObject(state.clipboardObject, 20);
    duplicate.locked = false;
    duplicate.visible = true;
    checkpoint();
    activeObjects().push(duplicate);
    state.selectedId = duplicate.id;
    state.inspector = 'layers';
    markDirty('Object geplakt');
    renderAll();
    notify('Object geplakt.', 'success');
  }

  function moveSelectedLayer(delta) {
    if (!state.project || !state.selectedId) return;
    const objects = activeObjects();
    const index = objects.findIndex(obj => obj.id === state.selectedId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= objects.length) return;
    checkpoint();
    if (!Core.moveObject(objects, state.selectedId, delta)) return;
    state.inspector = 'layers'; markDirty(); renderAll();
    notify(delta > 0 ? 'Laag naar voren verplaatst.' : 'Laag naar achteren verplaatst.', 'success');
  }

  function undo() {
    if (!state.project) return;
    const selectedId = state.selectedId;
    const previous = Core.undoProjectHistory(state.undoStack, state.redoStack, state.project, 60);
    if (!previous) return;
    state.project = previous;
    state.activeWorkspace = state.project.workspace || state.activeWorkspace;
    state.selectedId = Core.resolveSelectionId(activeObjects(), selectedId);
    state.selectedBezierPointIndex = null;
    state.bezierHandleType = null;
    markDirty(); renderAll(); updateHistoryButtons(); notify('Laatste stap ongedaan gemaakt.');
  }
  function redo() {
    if (!state.project) return;
    const selectedId = state.selectedId;
    const next = Core.redoProjectHistory(state.undoStack, state.redoStack, state.project, 60);
    if (!next) return;
    state.project = next;
    state.activeWorkspace = state.project.workspace || state.activeWorkspace;
    state.selectedId = Core.resolveSelectionId(activeObjects(), selectedId);
    state.selectedBezierPointIndex = null;
    state.bezierHandleType = null;
    markDirty(); renderAll(); updateHistoryButtons(); notify('Stap opnieuw uitgevoerd.');
  }

  function resetDocument() {
    if (!state.project) return;
    const alreadyDefault = state.activeWorkspace === 'pixel'
      ? state.project.pixel.width === 1200 && state.project.pixel.height === 800 && state.project.pixel.brightness === 100 && state.project.pixel.contrast === 100 && state.project.pixel.saturation === 100
      : state.activeWorkspace === 'vector'
        ? state.project.vector.width === 1000 && state.project.vector.height === 700
        : state.project.layout.width === 794 && state.project.layout.height === 1123 && state.project.layout.pages[state.project.layout.currentPage].width === 794 && state.project.layout.pages[state.project.layout.currentPage].height === 1123;
    if (alreadyDefault) return;
    checkpoint();
    if (state.activeWorkspace === 'pixel') Object.assign(state.project.pixel, { width: 1200, height: 800, brightness: 100, contrast: 100, saturation: 100 });
    if (state.activeWorkspace === 'vector') Object.assign(state.project.vector, { width: 1000, height: 700 });
    if (state.activeWorkspace === 'layout') {
      state.project.layout.width = 794; state.project.layout.height = 1123;
      const p = state.project.layout.pages[state.project.layout.currentPage]; p.width = 794; p.height = 1123;
    }
    markDirty(); renderAll();
  }

  function changeDocumentSize() {
    if (!state.project) return;
    const w = Math.max(100, Math.min(6000, Number($('document-width').value) || 1200));
    const h = Math.max(100, Math.min(6000, Number($('document-height').value) || 800));
    const current = state.activeWorkspace === 'pixel' ? state.project.pixel : state.activeWorkspace === 'vector' ? state.project.vector : state.project.layout.pages[state.project.layout.currentPage];
    const layoutMetadataMatches = state.activeWorkspace !== 'layout' || (state.project.layout.width === w && state.project.layout.height === h);
    if (current.width === w && current.height === h && layoutMetadataMatches) return;
    checkpoint();
    if (state.activeWorkspace === 'pixel') { state.project.pixel.width = w; state.project.pixel.height = h; }
    else if (state.activeWorkspace === 'vector') { state.project.vector.width = w; state.project.vector.height = h; }
    else {
      const p = state.project.layout.pages[state.project.layout.currentPage]; p.width = w; p.height = h;
      state.project.layout.width = w; state.project.layout.height = h;
    }
    markDirty(); renderAll();
  }

  function alignSelectedToCanvas(alignment) {
    if (!state.project || !state.selectedId) return;
    const object = activeObjects().find(item => item.id === state.selectedId);
    if (!object || object.locked || object.visible === false) {
      if (object?.visible === false) notify('Maak de laag eerst zichtbaar om deze uit te lijnen.', 'error');
      return;
    }
    const bounds = objectBounds(object);
    const canvas = activeDocumentSize();
    let dx = 0, dy = 0;
    if (alignment === 'left') dx = -bounds.x;
    else if (alignment === 'center-x') dx = (canvas.width - bounds.w) / 2 - bounds.x;
    else if (alignment === 'right') dx = canvas.width - bounds.w - bounds.x;
    else if (alignment === 'top') dy = -bounds.y;
    else if (alignment === 'center-y') dy = (canvas.height - bounds.h) / 2 - bounds.y;
    else if (alignment === 'bottom') dy = canvas.height - bounds.h - bounds.y;
    else return;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      notify('Het object staat al op deze uitlijnpositie.');
      return;
    }
    checkpoint();
    object.x = Number(object.x || 0) + dx;
    object.y = Number(object.y || 0) + dy;
    if (Array.isArray(object.points)) object.points.forEach(point => {
      point.x += dx; point.y += dy;
      for (const name of ['inHandle', 'outHandle']) if (point[name]) {
        point[name].x += dx; point[name].y += dy;
      }
    });
    markDirty('Object uitgelijnd');
    renderAll();
    notify('Object uitgelijnd met het canvas.', 'success');
  }

  function updateSelectedFromField(field, editId) {
    if (!state.project || !state.selectedId) return false;
    const obj = activeObjects().find(o => o.id === state.selectedId); if (!obj) return false;
    const beforeProject = JSON.parse(JSON.stringify(state.project));
    const before = JSON.stringify(beforeProject);
    if (field === 'text') obj.text = $('object-text').value;
    if (field === 'position') { obj.x = Math.max(-100000, Math.min(10000000, Number($('object-x').value) || 0)); obj.y = Math.max(-100000, Math.min(10000000, Number($('object-y').value) || 0)); }
    if (field === 'size') {
      const resized = Core.resizeObject(obj, Math.max(0, Number($('object-width').value) || 0), Math.max(0, Number($('object-height').value) || 0), { keepAspect: $('keep-aspect').checked });
      if (resized) Object.assign(obj, resized);
    }
    if (field === 'rotation') {
      const requested = Math.max(-360, Math.min(360, Number($('object-rotation').value) || 0));
      const rotated = Core.rotateObject(obj, requested - Number(obj.rotation || 0));
      if (rotated) Object.assign(obj, rotated);
    }
    if (field === 'fill') obj.fill = $('fill-color').value;
    if (field === 'stroke') obj.stroke = $('stroke-color').value;
    if (field === 'strokeWidth') obj.strokeWidth = Math.max(0, Number($('stroke-width').value) || 0);
    if (field === 'fontSize') obj.fontSize = Math.max(6, Math.min(400, Number($('font-size').value) || 32));
    if (field === 'opacity') obj.opacity = Number($('opacity-slider').value) / 100;
    if (JSON.stringify(state.project) === before) return false;
    if (editId) commitEditorEdit(editId, beforeProject);
    if (field === 'text') {
      renderPixel(); renderSvgWorkspace('vector'); renderSvgWorkspace('layout'); renderLayers();
      markDirty();
    } else {
      renderAll(); markDirty();
    }
    return true;
  }

  function showHelp() {
    showModal({
      title: 'Snel aan de slag', description: 'De huidige bèta bevat uitgebreide gereedschappen voor foto, vector en pagina-opmaak. Bewaar je projecten als .fluxivora om ze later verder te bewerken.', confirmText: 'Begrepen', cancelText: 'Sluiten',
      body: (body) => {
        const list = document.createElement('div'); list.className = 'shortcut-list';
        const entries = [['Object precies verplaatsen', 'Pijltjes (1 px), Shift + pijltje (10 px)'], ['Opslaan', 'Ctrl + S'], ['Ongedaan maken', 'Ctrl + Z'], ['Opnieuw', 'Ctrl + Y'], ['Object verwijderen', 'Delete'], ['Object dupliceren', 'Ctrl + D'], ['Kopiëren / plakken', 'Ctrl + C / Ctrl + V'], ['Laag naar voren', 'Ctrl + ]'], ['Laag naar achteren', 'Ctrl + ['], ['Pixel export', 'PNG'], ['Vector export', 'SVG'], ['Lay-out export', 'Afdrukken → PDF'], ['Pagina dupliceren', 'Knop in Pagina’s'], ['Zoom in/uit', 'Knoppen, Ctrl + muiswiel of Ctrl + +/-'], ['Aanpassen aan scherm', 'Ctrl + 0'], ['Laag verbergen', 'Oog in Lagen'], ['Laag vergrendelen', 'Slot in Lagen'], ['Nieuw project', 'Start → Nieuw ontwerp']];
        entries.forEach(([name, keys]) => { const row = document.createElement('div'); row.className = 'shortcut-row'; const a = document.createElement('span'); a.textContent = name; const k = document.createElement('kbd'); k.textContent = keys; row.append(a, k); list.append(row); });
        body.append(list);
        const note = document.createElement('p'); note.className = 'muted-note'; note.style.marginTop = '18px'; note.textContent = 'Fluxivora Studio is in actieve ontwikkeling. Deze alpha is een eerste basis, nog geen volledige vervanging van Photoshop, Illustrator of InDesign.'; body.append(note);
      }
    });
  }

  function handleMenu() {
    showModal({
      title: 'Projectmenu', description: 'Kies een actie voor je huidige project.', confirmText: 'Gereed', cancelText: 'Sluiten',
      body: (body) => {
        const actions = [
          ['Opslaan', () => saveProject()], ['Opslaan als…', () => saveProject(true)], ['Afbeelding importeren', () => importImage()],
          ['Nieuw ontwerp', () => showNewProjectModal(state.activeWorkspace === 'home' ? 'pixel' : state.activeWorkspace)], ['Sneltoetsen & uitleg', showHelp]
        ];
        actions.forEach(([label, action]) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'workspace-option';
          b.innerHTML = `<span class="option-icon">↗</span><span><strong>${label}</strong><small>Open deze actie</small></span>`;
          b.addEventListener('click', () => { $('modal-backdrop').classList.add('hidden'); action(); }); body.append(b);
        });
      }
    });
  }

  // Wire editor events.
  document.querySelectorAll('.rail-button[data-workspace]').forEach(btn => btn.addEventListener('click', () => activateWorkspace(btn.dataset.workspace)));
  document.querySelectorAll('[data-start-workspace]').forEach(btn => btn.addEventListener('click', () => showNewProjectModal(btn.dataset.startWorkspace)));
  $('create-project-button').addEventListener('click', () => showNewProjectModal('pixel'));
  $('open-button').addEventListener('click', openProject); $('welcome-open-button').addEventListener('click', openProject);
  $('save-button').addEventListener('click', () => saveProject()); $('save-as-button').addEventListener('click', exportCurrent);
  $('undo-button').addEventListener('click', undo); $('redo-button').addEventListener('click', redo);
  $('import-image-button').addEventListener('click', importImage); $('fit-canvas-button').addEventListener('click', () => { state.zoom = 0; applyCanvasScale(); });
  $('zoom-out-button').addEventListener('click', () => setZoom(state.zoom / 1.2));
  $('zoom-in-button').addEventListener('click', () => setZoom(state.zoom * 1.2));
  $('document-reset-button').addEventListener('click', resetDocument);
  $('document-width').addEventListener('change', changeDocumentSize); $('document-height').addEventListener('change', changeDocumentSize);
  $('delete-object-button').addEventListener('click', deleteSelected); $('delete-layer-button').addEventListener('click', deleteSelected); $('duplicate-object-button').addEventListener('click', duplicateSelected); $('layer-up-button').addEventListener('click', () => moveSelectedLayer(1)); $('layer-down-button').addEventListener('click', () => moveSelectedLayer(-1));
  const editingFields = ['object-text', 'object-x', 'object-y', 'object-width', 'object-height', 'object-rotation', 'fill-color', 'stroke-color', 'stroke-width', 'font-size', 'opacity-slider', 'brightness-slider', 'contrast-slider', 'saturation-slider'];
  const editingStarted = new Map();
  editingFields.forEach(id => {
    const field = $(id);
    const startEdit = () => beginEditorEdit(id);
    field.addEventListener('focus', startEdit);
    field.addEventListener('pointerdown', startEdit);
    field.addEventListener('blur', () => editingStarted.delete(id));
  });
  $('object-text').addEventListener('input', () => updateSelectedFromField('text', 'object-text'));
  for (const id of ['object-x', 'object-y']) $(id).addEventListener('change', () => updateSelectedFromField('position', id));
  for (const id of ['object-width', 'object-height']) $(id).addEventListener('change', () => updateSelectedFromField('size', id));
  $('object-rotation').addEventListener('change', () => updateSelectedFromField('rotation', 'object-rotation'));
  $('fill-color').addEventListener('input', () => updateSelectedFromField('fill', 'fill-color'));
  $('stroke-color').addEventListener('input', () => updateSelectedFromField('stroke', 'stroke-color'));
  $('stroke-width').addEventListener('change', () => updateSelectedFromField('strokeWidth', 'stroke-width'));
  $('font-size').addEventListener('change', () => updateSelectedFromField('fontSize', 'font-size'));
  $('opacity-slider').addEventListener('input', () => updateSelectedFromField('opacity', 'opacity-slider'));
  $('reset-adjustments-button').addEventListener('click', () => {
    if (!state.project) return;
    const doc = state.project.pixel;
    if (doc.brightness === 100 && doc.contrast === 100 && doc.saturation === 100) return;
    checkpoint();
    Object.assign(doc, { brightness: 100, contrast: 100, saturation: 100 });
    markDirty(); renderAll();
  });
  $('crop-apply-button').addEventListener('click', applyPixelCrop);
  for (const [id, alignment] of [['align-left-button', 'left'], ['align-center-x-button', 'center-x'], ['align-right-button', 'right'], ['align-top-button', 'top'], ['align-center-y-button', 'center-y'], ['align-bottom-button', 'bottom']]) $(id).addEventListener('click', () => alignSelectedToCanvas(alignment));
  $('add-bezier-point-button').addEventListener('click', addBezierAnchor);
  $('delete-bezier-point-button').addEventListener('click', deleteBezierAnchor);
  for (const key of ['brightness', 'contrast', 'saturation']) {
    const id = `${key}-slider`;
    $(id).addEventListener('input', () => {
      if (!state.project) return;
      const nextValue = Number($(id).value);
      if (state.project.pixel[key] === nextValue) return;
      const beforeProject = JSON.parse(JSON.stringify(state.project));
      state.project.pixel[key] = nextValue;
      commitEditorEdit(id, beforeProject);
      $(`${key}-value`).textContent = `${nextValue}%`;
      renderPixel();
      markDirty();
    });
  }
  document.querySelectorAll('.inspector-tab').forEach(btn => btn.addEventListener('click', () => { state.inspector = btn.dataset.inspector; renderInspector(); }));
  $('previous-page-button').addEventListener('click', () => switchPage(-1)); $('next-page-button').addEventListener('click', () => switchPage(1)); $('add-page-button').addEventListener('click', addPage); $('duplicate-page-button').addEventListener('click', duplicatePage); $('delete-page-button').addEventListener('click', deletePage);
  $('apply-page-format-button').addEventListener('click', applyPageFormat);
  $('add-layer-button').addEventListener('click', () => setTool(state.activeWorkspace === 'pixel' ? 'brush' : state.activeWorkspace === 'vector' ? 'rect' : 'text'));
  $('help-button').addEventListener('click', showHelp); $('menu-button').addEventListener('click', handleMenu); $('stage-menu-button').addEventListener('click', () => showModal({ title: 'Canvasopties', description: 'Stel het zichtbare canvas opnieuw in of pas de documentafmetingen aan in Eigenschappen.', confirmText: 'Oké', cancelText: 'Sluiten', body: (body) => { const p = document.createElement('p'); p.className = 'muted-note'; p.textContent = 'De knop “Aanpassen aan scherm” zoomt uit of in totdat de volledige pagina zichtbaar is. De afmetingen in Eigenschappen wijzigen de documentruimte.'; body.append(p); } }));
  $('vector-grid-button').addEventListener('click', () => {
    if (!['vector', 'layout'].includes(state.activeWorkspace)) { notify('Het raster is beschikbaar in Vector Forge en Page Studio.'); return; }
    state.vectorGridEnabled = !state.vectorGridEnabled;
    $('vector-grid-button').classList.toggle('active', state.vectorGridEnabled);
    $('vector-grid-button').textContent = state.vectorGridEnabled ? 'Raster aan' : 'Raster uit';
    $('vector-grid-button').setAttribute('aria-pressed', String(state.vectorGridEnabled));
    renderSvgWorkspace('vector'); renderSvgWorkspace('layout');
    notify(state.vectorGridEnabled ? 'Raster en magnetisch uitlijnen ingeschakeld (40 px).' : 'Raster en magnetisch uitlijnen uitgeschakeld.');
  });
    $('project-name').addEventListener('change', () => {
    if (!state.project) return;
    const nextName = $('project-name').value.trim() || 'Naamloos ontwerp';
    if (nextName === state.project.name) return;
    checkpoint();
    state.project.name = nextName;
    markDirty('Naam gewijzigd');
  });
  $('pixel-canvas').addEventListener('pointerdown', pixelPointerDown); $('pixel-canvas').addEventListener('pointermove', pixelPointerMove); $('pixel-canvas').addEventListener('pointerup', pixelPointerUp); $('pixel-canvas').addEventListener('pointercancel', pixelPointerUp);
  for (const [id, workspace] of [['vector-canvas', 'vector'], ['layout-canvas', 'layout']]) {
    const svg = $(id);
    svg.addEventListener('pointerdown', (event) => { state.lastPointer = coordsFromPointer(event, svg, activeDocumentSize()); svgPointerDown(event, workspace); });
    svg.addEventListener('pointermove', (event) => svgPointerMove(event, workspace));
    svg.addEventListener('pointerup', (event) => svgPointerUp(event, workspace));
    svg.addEventListener('pointercancel', (event) => svgPointerUp(event, workspace));
    if (workspace !== 'pixel') svg.addEventListener('dblclick', (event) => { if (state.currentTool === 'bezier' && state.draftObject?.type === 'bezier') { event.preventDefault(); finishBezierPath(); } });
  }

  const canvasScroll = $('canvas-scroll');
  // Pan the viewport without changing the artwork: Space+left-drag or middle-drag.
  // Ctrl/Cmd + mouse wheel zooms around the pointer instead of the canvas centre.
  // Keep ordinary wheel scrolling available for navigating the viewport.
  canvasScroll.addEventListener('wheel', (event) => {
    if (!state.project || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const currentZoom = state.zoom || 1;
    const nextZoom = currentZoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12);
    if (Math.abs(nextZoom - currentZoom) < 0.0001) return;
    const holder = $('canvas-holder');
    const before = holder.getBoundingClientRect();
    const localX = (event.clientX - before.left) / currentZoom;
    const localY = (event.clientY - before.top) / currentZoom;
    setZoom(nextZoom);
    const after = holder.getBoundingClientRect();
    canvasScroll.scrollLeft += after.left + localX * state.zoom - event.clientX;
    canvasScroll.scrollTop += after.top + localY * state.zoom - event.clientY;
  }, { passive: false });

  canvasScroll.addEventListener('pointerdown', (event) => {
    if (!state.project || !((state.spaceHeld && event.button === 0) || event.button === 1)) return;
    event.preventDefault();
    event.stopPropagation();
    state.panDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: canvasScroll.scrollLeft, top: canvasScroll.scrollTop };
    canvasScroll.classList.add('panning');
    try { canvasScroll.setPointerCapture(event.pointerId); } catch {}
  }, true);
  canvasScroll.addEventListener('pointermove', (event) => {
    if (!state.panDrag || state.panDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    canvasScroll.scrollLeft = state.panDrag.left - (event.clientX - state.panDrag.x);
    canvasScroll.scrollTop = state.panDrag.top - (event.clientY - state.panDrag.y);
  }, true);
  const finishPan = (event) => {
    if (!state.panDrag || (event && state.panDrag.pointerId !== event.pointerId)) return;
    state.panDrag = null;
    canvasScroll.classList.remove('panning');
  };
  canvasScroll.addEventListener('pointerup', finishPan, true);
  canvasScroll.addEventListener('pointercancel', finishPan, true);
  canvasScroll.addEventListener('lostpointercapture', finishPan, true);
  window.addEventListener('blur', () => { state.spaceHeld = false; finishPan(); });

  window.addEventListener('resize', () => { if (state.project) { state.zoom = 0; applyCanvasScale(); } });
  window.addEventListener('keydown', (event) => {
    if (!$('video-screen').classList.contains('hidden')) return;
    const mod = event.ctrlKey || event.metaKey;
    const activeElement = document.activeElement;
    const tag = activeElement?.tagName || '';
    const editingText = ['INPUT', 'TEXTAREA'].includes(tag) || activeElement?.isContentEditable === true;
    const shortcutEditingAllowed = !editingText && tag !== 'SELECT';
    if (event.code === 'Space' && shortcutEditingAllowed && state.project) {
      state.spaceHeld = true;
      event.preventDefault();
    }
    if (!editingText && state.currentTool === 'bezier' && state.draftObject?.type === 'bezier' && event.key === 'Enter') { event.preventDefault(); finishBezierPath(); }
    else if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject(event.shiftKey); }
    else if (shortcutEditingAllowed && mod && ['=', '+'].includes(event.key)) { event.preventDefault(); setZoom((state.zoom || 1) * 1.2); }
    else if (shortcutEditingAllowed && mod && ['-', '_'].includes(event.key)) { event.preventDefault(); setZoom((state.zoom || 1) / 1.2); }
    else if (shortcutEditingAllowed && mod && event.key === '0') { event.preventDefault(); state.zoom = 0; applyCanvasScale(); }
    else if (shortcutEditingAllowed && mod && event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
    else if (shortcutEditingAllowed && mod && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) { event.preventDefault(); redo(); }
    else if (mod && event.key.toLowerCase() === 'c' && shortcutEditingAllowed) { event.preventDefault(); copySelected(); }
    else if (mod && event.key.toLowerCase() === 'v' && shortcutEditingAllowed) { event.preventDefault(); pasteCopied(); }
    else if (mod && event.key.toLowerCase() === 'd' && shortcutEditingAllowed) { event.preventDefault(); duplicateSelected(); }
    else if (mod && event.key === ']' && shortcutEditingAllowed) { event.preventDefault(); moveSelectedLayer(1); }
    else if (mod && event.key === '[' && shortcutEditingAllowed) { event.preventDefault(); moveSelectedLayer(-1); }
    else if (shortcutEditingAllowed && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && state.selectedId) {
      const amount = event.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] }[event.key];
      if (nudgeSelected(delta[0], delta[1], !event.repeat)) event.preventDefault();
    }
    else if (event.key === 'Delete' && shortcutEditingAllowed) { deleteSelected(); }
    else if (event.key === 'Escape') { state.selectedId = null; state.selectedBezierPointIndex = null; state.draftObject = null; renderAll(); $('modal-backdrop').classList.add('hidden'); }
  });
  window.addEventListener('keyup', (event) => { if (event.code === 'Space') state.spaceHeld = false; });
  // Prepare the last recovery snapshot before Electron completes the close handshake.
  window.fluxivora?.onPrepareClose?.(async () => {
    try {
      cancelRecoveryTimer();
      await persistRecoverySnapshot();
    } catch (_) {
      // Closing the app must remain possible even if recovery storage fails.
    } finally {
      closePreparationCompleted = true;
      window.fluxivora?.confirmClose?.();
    }
  });
  window.addEventListener('beforeunload', () => { if (state.dirty && !closePreparationCompleted) { cancelRecoveryTimer(); persistRecoverySnapshot(); } });

  // Start in the welcome view. Each workspace has a separate object collection inside one project.

  function playStartupIntro() {
    const intro = $('startup-intro');
    if (!intro) return;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      intro.classList.add('intro-exit');
      window.setTimeout(() => intro.remove(), 750);
    };
    $('skip-intro')?.addEventListener('click', finish);
    window.setTimeout(finish, 3300);
  }

  showWelcome(); updateHistoryButtons(); offerRecoveryIfAvailable(); playStartupIntro();
})();
