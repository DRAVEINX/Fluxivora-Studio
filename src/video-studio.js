(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const state = {
    tracks: [
      { id: 'v2', name: 'V2', kind: 'video', hidden: false, locked: false, muted: false },
      { id: 'v1', name: 'V1', kind: 'video', hidden: false, locked: false, muted: false },
      { id: 'a1', name: 'A1', kind: 'audio', hidden: false, locked: false, muted: false },
      { id: 'a2', name: 'A2', kind: 'audio', hidden: false, locked: false, muted: false },
      { id: 't1', name: 'T1', kind: 'title', hidden: false, locked: false, muted: false }
    ],
    clips: [], selected: null, activeTrack: 'v1', playhead: 0, zoom: 48, playing: false,
    lastTick: 0, raf: 0, lastUi: 0, name: 'Mijn videoproject', media: new Map(),
    history: [], redo: [], audioContext: null, masterGain: null, exportDestination: null,
    recorder: null, exportChunks: [], exportActive: false, exportSize: '1080p'
  };
  const uid = prefix => (prefix || 'clip') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const selected = () => state.clips.find(c => c.id === state.selected) || null;
  const track = id => state.tracks.find(t => t.id === id) || null;
  const clipLength = c => Math.max(0, Number(c.out || 0) - Number(c.in || 0)) / Math.max(0.1, Math.min(4, Number(c.speed) || 1));
  const timelineEnd = () => state.clips.reduce((m, c) => Math.max(m, c.start + clipLength(c)), 0);
  const tc = value => {
    const n = Math.max(0, Number(value) || 0);
    const p = x => String(x).padStart(2, '0');
    return p(Math.floor(n / 60)) + ':' + p(Math.floor(n % 60)) + ':' + p(Math.floor((n % 1) * 25));
  };
  function notice(message, kind) {
    const stack = $('toast-stack');
    if (!stack) return;
    const item = document.createElement('div');
    item.className = 'toast' + (kind ? ' ' + kind : '');
    item.textContent = message;
    stack.append(item);
    window.setTimeout(() => item.remove(), 4200);
  }
  function metaClip(c) {
    const result = {};
    ['id','name','type','trackId','start','duration','in','out','speed','volume','opacity','scale','x','y','filter','fit','fadeIn','fadeOut','text','fontSize','color','bold'].forEach(k => {
      if (c[k] !== undefined) result[k] = c[k];
    });
    return result;
  }
  function snapshot() {
    return { name: state.name, tracks: state.tracks.map(t => ({...t})), clips: state.clips.map(metaClip), selected: state.selected, playhead: state.playhead };
  }
  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 60) state.history.shift();
    state.redo.length = 0;
    updateHistoryButtons();
  }
  function hydrateSnapshot(snap) {
    state.name = snap.name;
    state.tracks = snap.tracks.map(t => ({...t}));
    state.clips = snap.clips.map(data => {
      const media = state.media.get(data.id) || {};
      return { ...data, ...media, file: media.file || null, url: media.url || null, mediaEl: media.mediaEl || null, audioEl: media.audioEl || null, audioGain: media.audioGain || null, audioSource: media.audioSource || null, missing: !media.url && data.type !== 'title' };
    });
    state.selected = snap.selected;
    state.playhead = snap.playhead;
    $('video-project-name').value = state.name;
    refresh();
    renderPreview();
  }
  function undo() {
    if (!state.history.length) return;
    state.redo.push(snapshot());
    hydrateSnapshot(state.history.pop());
    updateHistoryButtons();
  }
  function redo() {
    if (!state.redo.length) return;
    state.history.push(snapshot());
    hydrateSnapshot(state.redo.pop());
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    const undo = $('video-undo'), redoButton = $('video-redo');
    if (undo) undo.disabled = !state.history.length;
    if (redoButton) redoButton.disabled = !state.redo.length;
  }
  function ensureAudioContext() {
    if (!AudioContextClass) return null;
    if (!state.audioContext) {
      const context = new AudioContextClass();
      const master = context.createGain();
      master.gain.value = 0.9;
      master.connect(context.destination);
      state.audioContext = context;
      state.masterGain = master;
    }
    for (const c of state.clips) {
      if (!c.audioEl || c.audioSource || !state.audioContext) continue;
      try {
        c.audioSource = state.audioContext.createMediaElementSource(c.audioEl);
        c.audioGain = state.audioContext.createGain();
        c.audioSource.connect(c.audioGain);
        c.audioGain.connect(state.masterGain);
        state.media.set(c.id, { ...(state.media.get(c.id) || {}), file: c.file, url: c.url, mediaEl: c.mediaEl, audioEl: c.audioEl, audioSource: c.audioSource, audioGain: c.audioGain });
      } catch (_) {}
    }
    return state.audioContext;
  }
  function createMedia(c) {
    const holder = $('video-media-engine');
    if (c.type === 'title') return c;
    const media = document.createElement(c.type === 'audio' ? 'audio' : 'video');
    media.preload = 'auto';
    media.src = c.url;
    media.playsInline = true;
    if (c.type === 'video') media.muted = true;
    media.setAttribute('aria-hidden', 'true');
    const audio = c.type === 'video' ? document.createElement('audio') : media;
    if (audio !== media) { audio.preload = 'auto'; audio.src = c.url; audio.setAttribute('aria-hidden', 'true'); }
    holder.append(media);
    if (audio !== media) holder.append(audio);
    c.mediaEl = media;
    c.audioEl = audio;
    state.media.set(c.id, { file: c.file || null, url: c.url, mediaEl: media, audioEl: audio });
    if (state.audioContext) ensureAudioContext();
    return c;
  }
  function disposeMedia(c, revoke) {
    if (!c) return;
    [c.mediaEl, c.audioEl].filter((el, i, arr) => el && arr.indexOf(el) === i).forEach(el => { try { el.pause(); el.removeAttribute('src'); el.load(); el.remove(); } catch (_) {} });
    if (revoke && c.url) URL.revokeObjectURL(c.url);
    state.media.delete(c.id);
  }
  function trackEnd(trackId) {
    return state.clips.filter(c => c.trackId === trackId).reduce((max, c) => Math.max(max, c.start + clipLength(c)), 0);
  }
  function addTrack(kind) {
    pushHistory();
    const tracks = state.tracks.filter(t => t.kind === kind);
    const name = (kind === 'video' ? 'V' : kind === 'audio' ? 'A' : 'T') + (tracks.length + 1);
    const t = { id: uid('track'), name, kind, hidden: false, locked: false, muted: false };
    state.tracks.unshift(t);
    state.activeTrack = t.id;
    refresh();
    notice(name + ' toegevoegd');
  }
  function removeTrack(trackId) {
    const t = track(trackId);
    if (!t || state.tracks.filter(x => x.kind === t.kind).length <= 1) { notice('Minimaal één track van dit type moet blijven staan.'); return; }
    pushHistory();
    const fallback = state.tracks.find(x => x.id !== t.id && x.kind === t.kind);
    state.clips.filter(c => c.trackId === t.id).forEach(c => { c.trackId = fallback.id; });
    state.tracks = state.tracks.filter(x => x.id !== t.id);
    if (state.activeTrack === t.id) state.activeTrack = fallback.id;
    refresh();
  }
  function compatibleTrack(c, t) {
    return !!t && ((c.type === 'video' && t.kind === 'video') || (c.type === 'audio' && t.kind === 'audio') || (c.type === 'title' && t.kind === 'title'));
  }
  function createClip({type, name, file, url, duration, trackId, start, text}) {
    const t = track(trackId) || state.tracks.find(x => x.kind === (type === 'title' ? 'title' : type === 'audio' ? 'audio' : 'video'));
    const c = {
      id: uid(), name: name || (type === 'title' ? 'Titel' : 'Media'), type, trackId: t.id,
      start: start == null ? trackEnd(t.id) : Math.max(0, start), duration: duration || 5,
      in: 0, out: duration || 5, speed: 1, volume: 1, opacity: 1, scale: 1, x: 0, y: 0,
      filter: 'normal', fit: 'contain', fadeIn: 0, fadeOut: 0, text: text || 'Jouw titel',
      fontSize: 72, color: '#ffffff', bold: true, file: file || null, url: url || null,
      mediaEl: null, audioEl: null, audioSource: null, audioGain: null, missing: type !== 'title'
    };
    if (type !== 'title' && url) { c.missing = false; createMedia(c); }
    state.clips.push(c);
    state.selected = c.id;
    state.activeTrack = t.id;
    return c;
  }
  function importFiles(fileList, kind) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    pushHistory();
    for (const file of files) {
      const type = kind === 'audio' ? 'audio' : 'video';
      if (type === 'video' && !file.type.startsWith('video/')) { notice('Kies een geldig videobestand.'); continue; }
      if (type === 'audio' && !file.type.startsWith('audio/')) { notice('Kies een geldig audiobestand.'); continue; }
      const missing = state.clips.find(c => c.missing && c.type === type && c.name.toLowerCase() === file.name.toLowerCase());
      const url = URL.createObjectURL(file);
      const probe = document.createElement(type === 'audio' ? 'audio' : 'video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        const duration = Number.isFinite(probe.duration) ? probe.duration : 0;
        if (missing) {
          missing.url = url; missing.file = file; missing.duration = duration;
          missing.in = Math.max(0, Math.min(missing.in || 0, duration));
          missing.out = Math.max(missing.in, Math.min(missing.out || duration, duration));
          missing.missing = false;
          createMedia(missing);
        } else {
          const preferred = type === 'audio' ? state.tracks.find(t => t.kind === 'audio') : state.tracks.find(t => t.kind === 'video' && t.id === state.activeTrack) || state.tracks.find(t => t.kind === 'video' && t.name === 'V1') || state.tracks.find(t => t.kind === 'video');
          createClip({type, name: file.name, file, url, duration, trackId: preferred.id});
        }
        refresh();
        renderPreview();
        probe.removeAttribute('src'); probe.load();
      };
      probe.onerror = () => { URL.revokeObjectURL(url); notice('Kan bestand niet lezen: ' + file.name); };
      probe.src = url;
    }
    if (kind === 'audio') $('video-audio-files').value = ''; else $('video-files').value = '';
    notice(files.length + (files.length === 1 ? ' bestand toegevoegd' : ' bestanden toegevoegd'));
  }
  function addTitle() {
    pushHistory();
    const t = state.tracks.find(x => x.id === state.activeTrack && x.kind === 'title') || state.tracks.find(x => x.kind === 'title');
    const c = createClip({type: 'title', name: 'Titel', duration: 5, trackId: t.id, start: state.playhead, text: 'Jouw titel'});
    state.activeTrack = t.id;
    refresh();
    notice('Titel toegevoegd; pas de tekst aan in Eigenschappen.');
    return c;
  }
  function seekTo(time) {
    state.playhead = Math.max(0, Math.min(Math.max(timelineEnd(), 0.01), Number(time) || 0));
    syncMedia(true);
    renderPreview();
    updateTransport();
  }
  function currentSourceTime(c) {
    return c.in + Math.max(0, state.playhead - c.start) * Math.max(0.1, Math.min(4, c.speed || 1));
  }
  function activeAt(c) {
    return state.playhead >= c.start && state.playhead < c.start + clipLength(c);
  }
  function gainFor(c) {
    const t = track(c.trackId);
    return c.volume * (t && t.muted ? 0 : 1);
  }
  function syncMedia(forceSeek) {
    for (const c of state.clips) {
      if (c.type === 'title' || c.missing) continue;
      const active = activeAt(c);
      const position = Math.min(c.out, currentSourceTime(c));
      const media = c.mediaEl, audio = c.audioEl;
      if (c.type === 'video' && media) {
        const t = track(c.trackId);
        if (!active || (t && t.hidden)) { media.pause(); }
        else {
          if (media.readyState >= 1 && (forceSeek || Math.abs(media.currentTime - position) > 0.28)) { try { media.currentTime = position; } catch (_) {} }
          if (state.playing && media.paused && media.readyState >= 2) media.play().catch(() => {});
          if (!state.playing) media.pause();
        }
      }
      if (audio) {
        const enabledTrack = track(c.trackId);
        const audioActive = active && !(enabledTrack && enabledTrack.muted) && (c.type === 'audio' || c.type === 'video');
        if (c.audioGain) c.audioGain.gain.value = audioActive ? gainFor(c) : 0;
        if (!audioActive) audio.pause();
        else {
          if (audio.readyState >= 1 && (forceSeek || Math.abs(audio.currentTime - position) > 0.25)) { try { audio.currentTime = position; } catch (_) {} }
          if (state.playing && audio.paused && audio.readyState >= 2) audio.play().catch(() => {});
          if (!state.playing) audio.pause();
        }
      }
    }
  }
  function effectFilter(value) {
    const map = {
      normal: 'none', cinematic: 'contrast(1.18) saturate(.82)', monochrome: 'grayscale(1)',
      warm: 'sepia(.28) saturate(1.22)', cool: 'hue-rotate(12deg) saturate(.9)',
      faded: 'contrast(.88) saturate(.78)', blur: 'blur(2px)'
    };
    return map[value] || 'none';
  }
  function alphaFor(c) {
    let alpha = Math.max(0, Math.min(1, c.opacity == null ? 1 : c.opacity));
    const elapsed = state.playhead - c.start, remaining = c.start + clipLength(c) - state.playhead;
    if (c.fadeIn > 0 && elapsed < c.fadeIn) alpha *= Math.max(0, elapsed / c.fadeIn);
    if (c.fadeOut > 0 && remaining < c.fadeOut) alpha *= Math.max(0, remaining / c.fadeOut);
    return alpha;
  }
  function drawVideoClip(ctx, c) {
    if (!c.mediaEl || c.mediaEl.readyState < 2 || c.mediaEl.videoWidth === 0) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save();
    ctx.globalAlpha = alphaFor(c);
    ctx.filter = effectFilter(c.filter);
    const w = W * c.scale, h = H * c.scale;
    const ratio = c.mediaEl.videoWidth / c.mediaEl.videoHeight;
    let drawW = w, drawH = h;
    if (c.fit !== 'fill') {
      if ((ratio > w / h && c.fit === 'contain') || (ratio < w / h && c.fit === 'cover')) { drawW = w; drawH = w / ratio; }
      else { drawH = h; drawW = h * ratio; }
      if (c.fit === 'cover') { drawW = w; drawH = h; }
    }
    const x = (W - drawW) / 2 + c.x * W / 100;
    const y = (H - drawH) / 2 + c.y * H / 100;
    ctx.drawImage(c.mediaEl, x, y, drawW, drawH);
    ctx.restore();
  }
  function drawTitle(ctx, c) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save();
    ctx.globalAlpha = alphaFor(c);
    const size = Math.max(18, Math.min(180, c.fontSize || 72)) * (H / 1080);
    ctx.font = (c.bold ? '700 ' : '400 ') + size + 'px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 14 * (H / 1080);
    ctx.fillStyle = c.color || '#ffffff';
    const lines = String(c.text || '').split('\n').slice(0, 5);
    const x = W / 2 + (c.x || 0) * W / 100, y = H * 0.815 + (c.y || 0) * H / 100;
    lines.forEach((line, i) => ctx.fillText(line.slice(0, 250), x, y + (i - (lines.length - 1) / 2) * size * 1.16, W * .88));
    ctx.restore();
  }
  function renderPreview() {
    const canvas = $('video-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 1920, 1080);
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, 1920, 1080);
    const videoTracks = state.tracks.filter(t => t.kind === 'video' && !t.hidden);
    // Composite lower tracks first, then upper tracks.
    videoTracks.slice().reverse().forEach(t => state.clips.filter(c => c.trackId === t.id && c.type === 'video' && !c.missing && activeAt(c)).forEach(c => drawVideoClip(ctx, c)));
    state.tracks.filter(t => t.kind === 'title' && !t.hidden).forEach(t => state.clips.filter(c => c.trackId === t.id && c.type === 'title' && activeAt(c)).forEach(c => drawTitle(ctx, c)));
    $('video-empty').classList.toggle('hidden', state.clips.some(c => c.type === 'video' && activeAt(c) && !c.missing) || state.clips.some(c => c.type === 'title' && activeAt(c)));
  }
  function updateTransport() {
    $('video-current').textContent = tc(state.playhead);
    $('video-duration').textContent = tc(timelineEnd());
    $('video-seek').max = String(Math.max(0.01, timelineEnd()));
    $('video-seek').value = String(Math.min(timelineEnd(), state.playhead));
    $('video-play').textContent = state.playing ? 'Ⅱ' : '▶';
    $('video-export').disabled = !state.clips.length || state.clips.some(c => c.missing);
    $('video-zoom').value = String(state.zoom);
    $('video-zoom-label').textContent = state.zoom + ' px/s';
  }
  function renderTracks() {
    const tracks = $('video-tracks'), ruler = $('video-ruler');
    tracks.replaceChildren(); ruler.replaceChildren();
    const maxTime = Math.max(20, timelineEnd() + 8);
    const width = Math.max(1100, maxTime * state.zoom);
    $('video-timeline-content').style.width = (width + 132) + 'px';
    ruler.style.width = width + 'px';
    ruler.style.marginLeft = '132px';
    const step = state.zoom >= 72 ? 1 : state.zoom >= 36 ? 2 : 5;
    for (let t = 0; t <= maxTime; t += step) {
      const tick = document.createElement('button');
      tick.type = 'button'; tick.className = 'video-ruler-tick';
      tick.style.left = (t * state.zoom) + 'px'; tick.textContent = tc(t).slice(0, 5);
      tick.addEventListener('click', () => seekTo(t));
      ruler.append(tick);
    }
    state.tracks.forEach(t => {
      const row = document.createElement('div'); row.className = 'video-track-row' + (t.id === state.activeTrack ? ' active-track' : '');
      const header = document.createElement('div'); header.className = 'video-track-label';
      const name = document.createElement('strong'); name.textContent = t.name;
      const kind = document.createElement('small'); kind.textContent = t.kind === 'video' ? 'VIDEO' : t.kind === 'audio' ? 'AUDIO' : 'TITELS';
      const controls = document.createElement('div'); controls.className = 'video-track-buttons';
      const toggle = (label, stateName, title) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
        b.title = title; b.className = t[stateName] ? 'track-toggle active' : 'track-toggle';
        b.addEventListener('click', e => { e.stopPropagation(); pushHistory(); t[stateName] = !t[stateName]; refresh(); renderPreview(); });
        controls.append(b);
      };
      if (t.kind === 'audio') toggle('M', 'muted', 'Track dempen');
      if (t.kind === 'video') toggle('◉', 'hidden', 'Track verbergen');
      toggle('⌑', 'locked', 'Track vergrendelen');
      const remove = document.createElement('button'); remove.className = 'track-toggle remove-track'; remove.textContent = '×'; remove.title = 'Track verwijderen'; remove.addEventListener('click', e => { e.stopPropagation(); removeTrack(t.id); }); controls.append(remove);
      header.append(name, kind, controls); header.addEventListener('click', () => { state.activeTrack = t.id; refresh(); });
      const lane = document.createElement('div'); lane.className = 'video-track-lane'; lane.dataset.trackId = t.id; lane.style.width = width + 'px';
      if (t.locked) lane.classList.add('locked');
      lane.addEventListener('click', e => {
        if (e.target.closest('.video-clip-block')) return;
        const rect = lane.getBoundingClientRect();
        seekTo(Math.max(0, (e.clientX - rect.left) / state.zoom));
        state.activeTrack = t.id;
      });
      lane.addEventListener('dragover', e => { if (!t.locked) { e.preventDefault(); lane.classList.add('drop-target'); } });
      lane.addEventListener('dragleave', () => lane.classList.remove('drop-target'));
      lane.addEventListener('drop', e => {
        e.preventDefault(); lane.classList.remove('drop-target');
        if (t.locked) return;
        const id = e.dataTransfer.getData('text/plain');
        const c = state.clips.find(x => x.id === id);
        if (!c || !compatibleTrack(c, t)) { notice('Dit type clip past niet op deze track.'); return; }
        pushHistory();
        c.trackId = t.id;
        c.start = Math.max(0, (e.clientX - lane.getBoundingClientRect().left) / state.zoom);
        state.selected = c.id; state.activeTrack = t.id; refresh();
      });
      state.clips.filter(c => c.trackId === t.id).forEach(c => {
        const block = document.createElement('div');
        block.className = 'video-clip-block ' + c.type + (c.id === state.selected ? ' selected' : '') + (c.missing ? ' missing' : '');
        block.style.left = (c.start * state.zoom) + 'px';
        block.style.width = Math.max(28, clipLength(c) * state.zoom) + 'px';
        block.draggable = !t.locked;
        block.title = c.name + ' · ' + tc(clipLength(c));
        const title = document.createElement('strong'); title.textContent = c.type === 'title' ? 'T · ' + c.text : c.name;
        const duration = document.createElement('small'); duration.textContent = tc(clipLength(c));
        const left = document.createElement('span'); left.className = 'clip-trim trim-left'; left.title = 'Beginpunt trimmen';
        const right = document.createElement('span'); right.className = 'clip-trim trim-right'; right.title = 'Eindpunt trimmen';
        if (c.type !== 'title') block.append(left);
        block.append(title, duration);
        if (c.type !== 'title') block.append(right);
        block.addEventListener('click', e => { e.stopPropagation(); state.selected = c.id; state.activeTrack = t.id; refresh(); });
        block.addEventListener('dragstart', e => { if (t.locked) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', c.id); });
        [left, right].forEach((handle, idx) => handle.addEventListener('pointerdown', e => {
          e.preventDefault(); e.stopPropagation(); if (t.locked || c.missing) return;
          pushHistory(); const edge = idx === 0 ? 'left' : 'right', originX = e.clientX, sourceIn = c.in, sourceOut = c.out, startAt = c.start;
          handle.setPointerCapture?.(e.pointerId);
          const move = ev => {
            const delta = (ev.clientX - originX) / state.zoom;
            if (edge === 'left') {
              const next = Math.max(0, Math.min(sourceOut - 0.1, sourceIn + delta));
              c.in = next; c.start = Math.max(0, startAt + (next - sourceIn));
            } else c.out = Math.max(sourceIn + 0.1, Math.min(c.duration, sourceOut + delta));
            renderTracks(); renderPreview(); updateTransport();
          };
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); refresh(); };
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
        }));
        lane.append(block);
      });
      row.append(lane);
      tracks.append(row);
    });
    const playhead = $('video-playhead-line'); playhead.style.left = (132 + state.playhead * state.zoom) + 'px'; playhead.style.height = (tracks.scrollHeight + 40) + 'px';
    $('video-track-count').textContent = state.tracks.length + ' tracks';
  }
  function populateInspector() {
    const c = selected();
    $('video-inspector-empty').classList.toggle('hidden', !!c);
    $('video-inspector-fields').classList.toggle('hidden', !c);
    $('video-selected-name').textContent = c ? c.name : 'Selecteer een clip';
    if (!c) return;
    $('video-clip-name').value = c.name || '';
    $('video-clip-start').value = Number(c.start || 0).toFixed(2);
    $('video-in').value = Number(c.in || 0).toFixed(2);
    $('video-out').value = Number(c.out || 0).toFixed(2);
    $('video-speed').value = String(c.speed || 1);
    $('video-opacity').value = String(c.opacity == null ? 1 : c.opacity);
    $('video-volume').value = String(c.volume == null ? 1 : c.volume);
    $('video-scale').value = String(c.scale || 1);
    $('video-filter').value = c.filter || 'normal';
    $('video-fit').value = c.fit || 'contain';
    $('video-fade-in').value = String(c.fadeIn || 0);
    $('video-fade-out').value = String(c.fadeOut || 0);
    $('video-title-text').value = c.text || '';
    $('video-title-size').value = String(c.fontSize || 72);
    $('video-title-color').value = c.color || '#ffffff';
    $('video-title-controls').classList.toggle('hidden', c.type !== 'title');
    $('video-video-controls').classList.toggle('hidden', c.type !== 'video');
    $('video-audio-controls').classList.toggle('hidden', c.type === 'title');
    ['video-in','video-out','video-speed','video-volume'].forEach(id => { $(id).disabled = c.missing; });
  }
  function refresh() {
    renderTracks(); populateInspector(); updateTransport(); updateHistoryButtons();
    const n = state.clips.length;
    $('video-count').textContent = n + (n === 1 ? ' clip' : ' clips');
    $('video-project-name').value = state.name;
  }
  function applyProperty(id, key, cast) {
    const c = selected(); if (!c) return;
    const value = cast($(id).value);
    if (Object.is(c[key], value)) return;
    pushHistory(); c[key] = value; refresh(); renderPreview();
  }
  function startPlayback() {
    if (state.playing) return;
    if (state.playhead >= timelineEnd()) state.playhead = 0;
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    state.playing = true; state.lastTick = performance.now();
    syncMedia(true); updateTransport();
    if (!state.raf) state.raf = requestAnimationFrame(tick);
  }
  function stopPlayback() {
    state.playing = false;
    state.clips.forEach(c => {
      if (c.mediaEl) c.mediaEl.pause();
      if (c.audioEl) c.audioEl.pause();
    });
    if (state.recorder && state.recorder.state === 'recording') state.recorder.stop();
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    renderPreview(); refresh();
  }
  function tick(now) {
    state.raf = 0;
    if (!state.playing) return;
    const delta = Math.min(0.1, Math.max(0, (now - state.lastTick) / 1000));
    state.lastTick = now;
    state.playhead = Math.min(timelineEnd(), state.playhead + delta);
    syncMedia(false);
    renderPreview();
    if (now - state.lastUi > 100) { updateTransport(); renderTracks(); state.lastUi = now; }
    if (state.playhead >= timelineEnd() && timelineEnd() > 0) { stopPlayback(); return; }
    state.raf = requestAnimationFrame(tick);
  }
  function exportVideo() {
    const Recorder = window.MediaRecorder;
    if (!Recorder || !HTMLCanvasElement.prototype.captureStream) { notice('WebM-export wordt niet ondersteund door deze Electron-versie.'); return; }
    if (!state.clips.length || state.clips.some(c => c.missing && c.type !== 'title')) { notice('Koppel alle ontbrekende bronbestanden voordat je exporteert.'); return; }
    stopPlayback();
    const ctxAudio = ensureAudioContext();
    const canvas = $('video-canvas');
    if (ctxAudio && ctxAudio.state === 'suspended') ctxAudio.resume().catch(() => {});
    if (ctxAudio && !state.exportDestination) {
      state.exportDestination = ctxAudio.createMediaStreamDestination();
      state.masterGain.connect(state.exportDestination);
    }
    const size = $('video-export-size').value;
    canvas.width = size === '720p' ? 1280 : size === '4k' ? 3840 : 1920;
    canvas.height = size === '720p' ? 720 : size === '4k' ? 2160 : 1080;
    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];
    if (state.exportDestination) tracks.push(...state.exportDestination.stream.getAudioTracks());
    const stream = new MediaStream(tracks);
    const mime = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm;codecs=vp9','video/webm'].find(t => Recorder.isTypeSupported(t));
    if (!mime) { stream.getTracks().forEach(t => t.stop()); notice('Geen geschikte WebM-encoder beschikbaar.'); return; }
    state.exportChunks = []; state.exportActive = true;
    const recorder = new Recorder(stream, { mimeType: mime, videoBitsPerSecond: size === '4k' ? 18000000 : size === '720p' ? 5000000 : 10000000 });
    state.recorder = recorder;
    recorder.ondataavailable = e => { if (e.data && e.data.size) state.exportChunks.push(e.data); };
    recorder.onerror = () => notice('Fout tijdens export. Probeer 1080p of 720p.');
    recorder.onstop = () => {
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0; state.recorder = null; state.exportActive = false;
      canvasStream.getTracks().forEach(t => t.stop());
      stream.getTracks().filter(t => t.kind === 'audio').forEach(t => t.stop());
      if (!state.exportChunks.length) return;
      const url = URL.createObjectURL(new Blob(state.exportChunks, { type: mime }));
      const link = document.createElement('a'); link.href = url;
      link.download = state.name.replace(/[\\/:*?"<>|]+/g, '_') + '.webm'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      notice('Export afgerond als WebM met gemixte audiotracks waar de browser dit ondersteunt.');
      if (ctxAudio && state.exportDestination) { try { state.masterGain.disconnect(state.exportDestination); } catch (_) {} state.exportDestination = null; }
      state.exportChunks = [];
    };
    state.playhead = 0; recorder.start(250);
    startPlayback();
    notice('Export gestart: realtime render, met audio wanneer beschikbaar.');
  }
  function saveSession() {
    const data = {
      format: 'fluxivora-video-project', version: '0.5.0-beta.4', name: state.name,
      sequence: { width: 1920, height: 1080, fps: 30, zoom: state.zoom },
      tracks: state.tracks.map(t => ({...t})),
      clips: state.clips.map(c => ({...metaClip(c), missing: c.type !== 'title'}))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = state.name.replace(/[\\/:*?"<>|]+/g, '_') + '.fluxivora-video.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    notice('Montage en trackindeling opgeslagen; bronbestanden worden niet in het projectbestand gekopieerd.');
  }
  async function openSession(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== 'fluxivora-video-project' || !Array.isArray(data.clips) || data.clips.length > 1000 || !Array.isArray(data.tracks)) throw new Error('Dit is geen geldig Fluxivora-video-project.');
      stopPlayback();
      state.clips.forEach(c => disposeMedia(c, true));
      state.name = String(data.name || 'Mijn videoproject').slice(0, 100);
      state.tracks = data.tracks.slice(0, 24).map(t => ({
        id: String(t.id || uid('track')), name: String(t.name || 'Track').slice(0, 12),
        kind: ['video','audio','title'].includes(t.kind) ? t.kind : 'video',
        hidden: !!t.hidden, muted: !!t.muted, locked: !!t.locked
      }));
      if (!state.tracks.length) state.tracks = [{id:'v1',name:'V1',kind:'video',hidden:false,muted:false,locked:false}];
      state.clips = data.clips.map(c => ({
        id: String(c.id || uid()), name: String(c.name || 'Clip').slice(0, 512),
        type: ['video','audio','title'].includes(c.type) ? c.type : 'video',
        trackId: String(c.trackId || state.tracks[0].id),
        start: Math.max(0, Math.min(86400, Number(c.start) || 0)),
        duration: Math.max(0, Math.min(86400, Number(c.duration) || 0)),
        in: Math.max(0, Number(c.in) || 0), out: Math.max(0, Number(c.out) || 0),
        speed: Math.max(.1, Math.min(4, Number(c.speed) || 1)), volume: Math.max(0, Math.min(2, Number(c.volume) || 0)),
        opacity: Math.max(0, Math.min(1, c.opacity == null ? 1 : Number(c.opacity))),
        scale: Math.max(.1, Math.min(3, Number(c.scale) || 1)),
        x: Math.max(-100, Math.min(100, Number(c.x) || 0)), y: Math.max(-100, Math.min(100, Number(c.y) || 0)),
        filter: String(c.filter || 'normal'), fit: String(c.fit || 'contain'),
        fadeIn: Math.max(0, Math.min(10, Number(c.fadeIn) || 0)), fadeOut: Math.max(0, Math.min(10, Number(c.fadeOut) || 0)),
        text: String(c.text || '').slice(0, 1000), fontSize: Math.max(18, Math.min(180, Number(c.fontSize) || 72)),
        color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#ffffff', bold: c.bold !== false,
        url: null, file: null, mediaEl: null, audioEl: null, audioSource: null, audioGain: null, missing: c.type !== 'title'
      })).map(c => {
        if (!track(c.trackId)) c.trackId = state.tracks.find(t => t.kind === c.type || (c.type === 'title' && t.kind === 'title'))?.id || state.tracks[0].id;
        return c;
      });
      state.selected = state.clips[0]?.id || null;
      state.playhead = 0; state.zoom = Math.max(16, Math.min(100, Number(data.sequence?.zoom) || 48));
      $('video-project-name').value = state.name;
      $('video-preview').pause(); $('video-preview').removeAttribute('src'); $('video-preview').load();
      $('video-empty').classList.remove('hidden');
      refresh(); renderPreview();
      notice('Montage geopend. Voeg de bronbestanden opnieuw toe om ontbrekende clips te koppelen.');
    } catch (error) { notice('Montage openen mislukt: ' + error.message); }
    finally { $('video-session-file').value = ''; }
  }
  function show() {
    $('welcome-screen').classList.add('hidden'); $('editor-screen').classList.add('hidden'); $('video-screen').classList.remove('hidden');
    document.body.classList.add('video-mode');
    document.querySelectorAll('.rail-button[data-workspace]').forEach(b => b.classList.toggle('active', b.dataset.workspace === 'video'));
    $('footer-workspace').textContent = 'Motion Studio';
    refresh(); renderPreview();
  }
  function wireProperties() {
    $('video-clip-name').addEventListener('change', () => applyProperty('video-clip-name', 'name', v => String(v).slice(0, 512)));
    $('video-clip-start').addEventListener('change', () => {
      const c = selected(); if (!c) return;
      const v = Math.max(0, Number($('video-clip-start').value) || 0);
      if (v === c.start) return;
      pushHistory(); c.start = v; refresh(); renderPreview();
    });
    $('video-in').addEventListener('change', () => {
      const c = selected(); if (!c || c.missing) return;
      const v = Math.max(0, Math.min(c.out - 0.1, Number($('video-in').value) || 0));
      if (v === c.in) return;
      pushHistory(); c.start += v - c.in; c.in = v; refresh(); renderPreview();
    });
    $('video-out').addEventListener('change', () => {
      const c = selected(); if (!c || c.missing) return;
      const v = Math.max(c.in + 0.1, Math.min(c.duration, Number($('video-out').value) || c.duration));
      if (v === c.out) return;
      pushHistory(); c.out = v; refresh(); renderPreview();
    });
    const binding = (id, key, cast) => {
      $(id).addEventListener('change', () => applyProperty(id, key, cast));
    };
    binding('video-speed', 'speed', v => Math.max(0.1, Math.min(4, Number(v) || 1)));
    binding('video-opacity', 'opacity', v => Math.max(0, Math.min(1, Number(v) || 0)));
    binding('video-volume', 'volume', v => Math.max(0, Math.min(2, Number(v) || 0)));
    binding('video-scale', 'scale', v => Math.max(0.1, Math.min(3, Number(v) || 1)));
    binding('video-filter', 'filter', String);
    binding('video-fit', 'fit', String);
    binding('video-fade-in', 'fadeIn', v => Math.max(0, Math.min(10, Number(v) || 0)));
    binding('video-fade-out', 'fadeOut', v => Math.max(0, Math.min(10, Number(v) || 0)));
    binding('video-title-text', 'text', v => String(v).slice(0, 1000));
    binding('video-title-size', 'fontSize', v => Math.max(18, Math.min(180, Number(v) || 72)));
    binding('video-title-color', 'color', String);
  }
  function wire() {
    $('video-import').addEventListener('click', () => $('video-files').click());
    $('video-import-audio').addEventListener('click', () => $('video-audio-files').click());
    $('video-files').addEventListener('change', e => importFiles(e.target.files, 'video'));
    $('video-audio-files').addEventListener('change', e => importFiles(e.target.files, 'audio'));
    $('video-save-session').addEventListener('click', saveSession);
    $('video-open-session').addEventListener('click', () => $('video-session-file').click());
    $('video-session-file').addEventListener('change', e => openSession(e.target.files?.[0]));
    $('video-export').addEventListener('click', exportVideo);
    $('video-add-title').addEventListener('click', addTitle);
    $('video-add-track-video').addEventListener('click', () => addTrack('video'));
    $('video-add-track-audio').addEventListener('click', () => addTrack('audio'));
    $('video-add-track-title').addEventListener('click', () => addTrack('title'));
    $('video-play').addEventListener('click', () => state.playing ? stopPlayback() : startPlayback());
    $('video-stop').addEventListener('click', () => { stopPlayback(); seekTo(0); });
    $('video-seek').addEventListener('input', e => seekTo(Number(e.target.value)));
    $('video-zoom').addEventListener('input', e => { state.zoom = Number(e.target.value); renderTracks(); });
    $('video-project-name').addEventListener('change', () => { state.name = $('video-project-name').value.trim().slice(0, 100) || 'Mijn videoproject'; $('video-project-name').value = state.name; });
    $('video-undo').addEventListener('click', undo); $('video-redo').addEventListener('click', redo);
    wireProperties();
    window.addEventListener('keydown', e => {
      const target = e.target;
      const typing = target && ['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (e.code === 'Space' && !typing && !$('video-screen').classList.contains('hidden')) { e.preventDefault(); state.playing ? stopPlayback() : startPlayback(); }
      else if (e.key === 'Delete' && !typing && !$('video-screen').classList.contains('hidden')) { const c = selected(); if (c) { pushHistory(); state.clips = state.clips.filter(x => x.id !== c.id); state.selected = null; refresh(); renderPreview(); } }
    });
    document.querySelectorAll('.rail-button[data-workspace]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.workspace === 'video') show();
      else { $('video-screen').classList.add('hidden'); document.body.classList.remove('video-mode'); stopPlayback(); }
    }));
    window.addEventListener('beforeunload', () => state.clips.forEach(c => disposeMedia(c, true)));
  }
  wire();
  refresh();
})();