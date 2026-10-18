(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const state = {
    markers: [],
    tracks: [
      { id: 'v2', name: 'V2', kind: 'video', hidden: false, locked: false, muted: false },
      { id: 'v1', name: 'V1', kind: 'video', hidden: false, locked: false, muted: false },
      { id: 'a1', name: 'A1', kind: 'audio', hidden: false, locked: false, muted: false },
      { id: 'a2', name: 'A2', kind: 'audio', hidden: false, locked: false, muted: false },
      { id: 't1', name: 'T1', kind: 'title', hidden: false, locked: false, muted: false }
    ],
    clips: [], assets: [], programLut: null, multicamGroups: [], selected: null, activeTrack: 'v1', playhead: 0, zoom: 48, playing: false,
    lastTick: 0, raf: 0, lastUi: 0, name: 'Mijn videoproject', media: new Map(),
    history: [], redo: [], audioContext: null, masterGain: null, exportDestination: null,
    recorder: null, exportChunks: [], exportActive: false, offlineExportActive: false, offlineExportCancel: false, offlineSessionId: null, exportSize: '1080p', snap: true
  };
  const SEQUENCE_FPS = 25;
  function normaliseProgramLut(lut) {
    if (!lut || typeof lut !== 'object') return null;
    const size = Number(lut.size);
    if (!Number.isInteger(size) || size < 2 || size > 64 || !Array.isArray(lut.data) || lut.data.length !== size * size * size * 3 || lut.data.length > 786432) return null;
    const domainMin = Array.isArray(lut.domainMin) && lut.domainMin.length === 3 ? lut.domainMin.map(Number) : [0, 0, 0];
    const domainMax = Array.isArray(lut.domainMax) && lut.domainMax.length === 3 ? lut.domainMax.map(Number) : [1, 1, 1];
    if (domainMin.some((v, i) => !Number.isFinite(v) || !Number.isFinite(domainMax[i]) || domainMax[i] <= v)) return null;
    const values = lut.data.map(Number);
    if (values.some(v => !Number.isFinite(v) || v < -16 || v > 16)) return null;
    return { name: String(lut.name || 'Output LUT').slice(0, 128), size, domainMin, domainMax, data: values };
  }
  const uid = prefix => (prefix || 'clip') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const selected = () => state.clips.find(c => c.id === state.selected) || null;
  const track = id => state.tracks.find(t => t.id === id) || null;
  const clipLength = c => Math.max(0, Number(c.out || 0) - Number(c.in || 0)) / Math.max(0.1, Math.min(4, Number(c.speed) || 1));
  const timelineEnd = () => state.clips.reduce((m, c) => Math.max(m, c.start + clipLength(c)), 0);
  const tc = value => {
    const n = Math.max(0, Number(value) || 0);
    const p = x => String(x).padStart(2, '0');
    return p(Math.floor(n / 60)) + ':' + p(Math.floor(n % 60)) + ':' + p(Math.floor((n % 1) * SEQUENCE_FPS));
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
    ['id','name','type','trackId','start','duration','in','out','speed','volume','opacity','scale','x','y','filter','fit','fadeIn','fadeOut','text','fontSize','color','bold','compositionId','compositionName','shapeType','strokeColor','strokeWidth','maskType','maskSize','maskX','maskY','maskSecondaryType','maskSecondarySize','maskSecondaryX','maskSecondaryY','maskOperation','keyframes','keyframeEase','effects','colorAdjustments','assetId','multicamGroupId','activeAngleAssetId','activeAngleIn'].forEach(k => {
      if (k === 'keyframes') result[k] = Array.isArray(c[k]) ? c[k].map(frame => ({...frame, outHandle: frame.outHandle ? {...frame.outHandle} : null, inHandle: frame.inHandle ? {...frame.inHandle} : null})) : [];
      else if (k === 'effects') result[k] = Array.isArray(c[k]) ? c[k].map(effect => ({...effect})) : [];
      else if (k === 'colorAdjustments') result[k] = { exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0, ...(c[k] || {}) };
      else if (c[k] !== undefined) result[k] = c[k];
    });
    return result;
  }
  function snapshot() {
    return { name: state.name, tracks: state.tracks.map(t => ({...t})), clips: state.clips.map(metaClip), markers: state.markers.map(m => ({...m})), programLut: state.programLut, multicamGroups: state.multicamGroups.map(g => ({...g, angleAssetIds:[...g.angleAssetIds], offsets:{...g.offsets}})), selected: state.selected, playhead: state.playhead };
  }
  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 60) state.history.shift();
    state.redo.length = 0;
    updateHistoryButtons();
  }
  function hydrateSnapshot(snap) {
    state.name = snap.name;
    state.programLut = normaliseProgramLut(snap.programLut);
    state.multicamGroups = Array.isArray(snap.multicamGroups) ? snap.multicamGroups.map(g => ({...g, angleAssetIds:[...(g.angleAssetIds || [])], offsets:{...(g.offsets || {})}})) : [];
    state.tracks = snap.tracks.map(t => ({...t}));
    state.clips = snap.clips.map(data => {
      const media = state.media.get(data.id) || {};
      return { ...data, ...media, file: media.file || null, url: media.url || null, mediaEl: media.mediaEl || null, audioEl: media.audioEl || null, audioGain: media.audioGain || null, audioSource: media.audioSource || null, missing: !media.url && data.type !== 'title' };
    });
    state.markers = (snap.markers || []).map(m => ({...m}));
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
    media.preload = 'metadata';
    media.src = c.url;
    media.playsInline = true;
    if (c.type === 'video') media.muted = true;
    media.setAttribute('aria-hidden', 'true');
    const audio = c.type === 'video' ? document.createElement('audio') : media;
    if (audio !== media) { audio.preload = 'metadata'; audio.src = c.url; audio.setAttribute('aria-hidden', 'true'); }
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
      fontSize: 72, color: '#ffffff', bold: true, keyframes: [], keyframeEase: 'easeInOut', effects: [],
      colorAdjustments: { exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0 }, file: file || null, url: url || null,
      mediaEl: null, audioEl: null, audioSource: null, audioGain: null, missing: type !== 'title'
    };
    if (type !== 'title' && url) { c.missing = false; createMedia(c); }
    state.clips.push(c);
    state.selected = c.id;
    state.activeTrack = t.id;
    return c;
  }
  function isCompatibleMediaFile(file, type) {
    if (!file || typeof file.name !== 'string') return false;
    const mime = String(file.type || '').toLowerCase().split(';')[0].trim();
    if (mime.startsWith(type + '/')) return true;
    // Some Windows pickers and browser wrappers return an empty or generic MIME type.
    // Only use the extension fallback for generic/unknown MIME values, not a conflicting known type.
    const genericMime = !mime || ['application/octet-stream', 'binary/octet-stream', 'application/x-unknown', 'application/unknown'].includes(mime);
    if (!genericMime) return false;
    const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
    const extensions = type === 'video'
      ? ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'mpeg', 'mpg', 'mpe', 'm2v', '3gp', 'ogv', 'ts', 'mts', 'm2ts']
      : ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'aif', 'aiff', 'wma', 'weba'];
    return extensions.includes(extension);
  }

  function importFiles(fileList, kind) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    for (const file of files) {
      const type = kind === 'audio' ? 'audio' : 'video';
      if (type === 'video' && !isCompatibleMediaFile(file, 'video')) { notice('Kies een geldig videobestand.'); continue; }
      if (type === 'audio' && !isCompatibleMediaFile(file, 'audio')) { notice('Kies een geldig audiobestand.'); continue; }
      const missing = state.clips.find(c => c.missing && c.type === type && c.name.toLowerCase() === file.name.toLowerCase());
      const url = URL.createObjectURL(file);
      const probe = document.createElement(type === 'audio' ? 'audio' : 'video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        const duration = Number.isFinite(probe.duration) ? probe.duration : 0;
        let imported = null;
        if (missing) {
          pushHistory();
          missing.url = url; missing.file = file; missing.duration = duration;
          missing.in = Math.max(0, Math.min(missing.in || 0, duration));
          missing.out = Math.max(missing.in, Math.min(missing.out || duration, duration));
          missing.missing = false;
          createMedia(missing);
          imported = missing;
        } else if (!$('video-import-to-timeline').checked) {
          window.dispatchEvent(new CustomEvent('fluxivora:asset-file-imported', { detail: { file, name: file.name, type, duration } }));
          URL.revokeObjectURL(url);
        } else {
          pushHistory();
          const preferred = type === 'audio' ? state.tracks.find(t => t.kind === 'audio') : state.tracks.find(t => t.kind === 'video' && t.id === state.activeTrack) || state.tracks.find(t => t.kind === 'video' && t.name === 'V1') || state.tracks.find(t => t.kind === 'video');
          imported = createClip({type, name: file.name, file, url, duration, trackId: preferred.id});
        }
        if (imported) {
          refresh();
          renderPreview();
          if (type === 'audio') computeAudioWaveform(file, imported.id);
          else captureVideoThumbnails(file, imported.id);
          window.dispatchEvent(new CustomEvent('fluxivora:asset-imported', { detail: { clipId: imported.id } }));
        }
        probe.removeAttribute('src'); probe.load();
      };
      probe.onerror = () => { URL.revokeObjectURL(url); notice('Kan bestand niet lezen: ' + file.name); };
      probe.src = url;
    }
    if (kind === 'audio') $('video-audio-files').value = ''; else $('video-files').value = '';
    notice(files.length + (files.length === 1 ? ' bestand toegevoegd' : ' bestanden toegevoegd'));
  }
  async function computeAudioWaveform(file, clipId) {
    if (!AudioContextClass || file.size > 100 * 1024 * 1024) return;
    try {
      const context = ensureAudioContext();
      if (!context || typeof context.decodeAudioData !== 'function') return;
      const decoded = await context.decodeAudioData((await file.arrayBuffer()).slice(0));
      const item = state.clips.find(c => c.id === clipId);
      if (!item || item.type !== 'audio') return;
      const samples = decoded.getChannelData(0);
      const bins = Math.max(64, Math.min(600, Math.ceil(decoded.duration * 8)));
      const step = Math.max(1, Math.floor(samples.length / bins));
      const peaks = [];
      for (let i = 0; i < bins; i++) {
        let peak = 0;
        const end = Math.min(samples.length, (i + 1) * step);
        for (let j = i * step; j < end; j++) peak = Math.max(peak, Math.abs(samples[j]));
        peaks.push(peak);
      }
      item.waveform = peaks;
      state.media.set(item.id, { ...(state.media.get(item.id) || {}), file: item.file, url: item.url, mediaEl: item.mediaEl, audioEl: item.audioEl, audioSource: item.audioSource, audioGain: item.audioGain, waveform: peaks });
      renderTracks();
    } catch (_) {
      // Waveforms are a preview enhancement; unsupported audio codecs do not block import.
    }
  }
  function addMarker() {
    const label = window.prompt('Geef de marker een naam:', 'Marker ' + (state.markers.length + 1));
    if (label === null) return;
    pushHistory();
    const cleanLabel = String(label).trim().slice(0, 80) || ('Marker ' + (state.markers.length + 1));
    const existing = state.markers.find(m => Math.abs(m.time - state.playhead) < 0.08);
    if (existing) { existing.label = cleanLabel; }
    else state.markers.push({ id: uid('marker'), time: Math.max(0, state.playhead), label: cleanLabel });
    state.markers.sort((a, b) => a.time - b.time);
    renderTracks(); notice('Marker toegevoegd op ' + tc(state.playhead) + '.');
  }
  async function captureVideoThumbnails(file, clipId) {
    if (!file || file.size > 2 * 1024 * 1024 * 1024) return;
    const temporaryUrl = URL.createObjectURL(file);
    const decoder = document.createElement('video');
    decoder.preload = 'auto'; decoder.muted = true; decoder.playsInline = true;
    try {
      decoder.src = temporaryUrl;
      await new Promise((resolve, reject) => {
        decoder.addEventListener('loadedmetadata', resolve, { once: true });
        decoder.addEventListener('error', () => reject(new Error('Video cannot provide thumbnails')), { once: true });
        decoder.load();
      });
      if (!Number.isFinite(decoder.duration) || decoder.duration <= 0) return;
      const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 68;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const points = [...new Set([0.05, 0.25, 0.5, 0.75, 0.95].map(p => Math.min(Math.max(0, decoder.duration - 0.04), decoder.duration * p)))];
      const thumbnails = [];
      for (const point of points) {
        await new Promise((resolve, reject) => {
          const done = () => { cleanup(); resolve(); };
          const fail = () => { cleanup(); reject(new Error('Thumbnail seek failed')); };
          const cleanup = () => { decoder.removeEventListener('seeked', done); decoder.removeEventListener('error', fail); };
          decoder.addEventListener('seeked', done, { once: true }); decoder.addEventListener('error', fail, { once: true });
          try { decoder.currentTime = point; } catch (error) { cleanup(); reject(error); }
        });
        if (decoder.readyState < 2 || !decoder.videoWidth) continue;
        const scale = Math.min(canvas.width / decoder.videoWidth, canvas.height / decoder.videoHeight);
        const w = decoder.videoWidth * scale, h = decoder.videoHeight * scale;
        ctx.fillStyle = '#080a12'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(decoder, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        thumbnails.push(canvas.toDataURL('image/jpeg', 0.58));
      }
      const c = state.clips.find(item => item.id === clipId);
      if (c && c.type === 'video') {
        c.thumbnails = thumbnails;
        state.media.set(c.id, { ...(state.media.get(c.id) || {}), file: c.file, url: c.url, mediaEl: c.mediaEl, audioEl: c.audioEl, audioSource: c.audioSource, audioGain: c.audioGain, waveform: c.waveform, thumbnails });
        renderTracks();
      }
    } catch (_) {
      // Some hardware/codec combinations cannot seek fast enough for thumbnails; timeline editing remains usable.
    } finally {
      decoder.pause(); decoder.removeAttribute('src'); decoder.load(); decoder.remove();
      URL.revokeObjectURL(temporaryUrl);
    }
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
  function addShape(shapeType = 'rectangle') {
    pushHistory();
    const t = state.tracks.find(x => x.id === state.activeTrack && x.kind === 'title') || state.tracks.find(x => x.kind === 'title');
    const isEllipse = shapeType === 'ellipse';
    const c = createClip({type: 'title', name: isEllipse ? 'Vormlaag · ellips' : 'Vormlaag · rechthoek', duration: 5, trackId: t.id, start: state.playhead, text: ''});
    c.shapeType = isEllipse ? 'ellipse' : 'rectangle'; c.fontSize = 120; c.color = '#8b7cff'; c.strokeColor = '#ffffff'; c.strokeWidth = 0; c.bold = false;
    state.activeTrack = t.id;
    refresh(); renderPreview();
    notice((isEllipse ? 'Ellips' : 'Rechthoek') + ' toegevoegd als vormlaag. De laag gebruikt de bestaande keyframe-animatie.');
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
  function animatedValue(c, key, baseValue) {
    const frames = Array.isArray(c.keyframes) ? c.keyframes : [];
    const t = Math.max(0, state.playhead - c.start);
    const bezierValue = window.FluxivoraKeyframeCurves && typeof window.FluxivoraKeyframeCurves.bezierValue === 'function'
      ? (left, right, key, raw) => window.FluxivoraKeyframeCurves.bezierValue(left, right, key, raw)
      : null;
    // Keep one shared keyframe path for preview and offline rendering.
    // The browser-safe runtime mirrors the legacy seconds-based keyframe format.
    if (window.FluxivoraMotionFxRuntime?.interpolateProperty) {
      return window.FluxivoraMotionFxRuntime.interpolateProperty(frames, key, t, Number(baseValue) || 0, { bezierValue });
    }
    const validFrames = frames.filter(f => Number.isFinite(f.time) && Number.isFinite(f[key])).slice().sort((a, b) => a.time - b.time);
    if (!validFrames.length) return Number(baseValue) || 0;
    if (t <= validFrames[0].time) return validFrames[0][key];
    if (t >= validFrames[validFrames.length - 1].time) return validFrames[validFrames.length - 1][key];
    const curves = { linear: v => v, easeIn: v => v * v, easeOut: v => 1 - Math.pow(1 - v, 2), easeInOut: v => v < .5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2, hold: () => 0 };
    for (let i = 1; i < validFrames.length; i++) {
      const left = validFrames[i - 1], right = validFrames[i];
      if (t <= right.time) {
        const span = Math.max(0.0001, right.time - left.time);
        const raw = (t - left.time) / span;
        if (right.ease === 'bezier' && bezierValue) {
          const value = bezierValue(left, right, key, raw);
          if (Number.isFinite(value)) return value;
        }
        return left[key] + (right[key] - left[key]) * (curves[right.ease] || curves.linear)(raw);
      }
    }
    return Number(baseValue) || 0;
  }
  function gainFor(c) {
    const t = track(c.trackId);
    return animatedValue(c, 'volume', c.volume) * alphaFor(c) * (t && t.muted ? 0 : 1);
  }
  function syncMedia(forceSeek) {
    for (const c of state.clips) {
      if (c.type === 'title' || c.missing) continue;
      const active = activeAt(c);
      const position = Math.min(c.out, currentSourceTime(c));
      const media = c.mediaEl, audio = c.audioEl;
      if (c.type === 'video' && media) {
        media.playbackRate = Math.max(0.1, Math.min(4, c.speed || 1));
        const angleAsset = c.activeAngleAssetId && state.assets.find(asset => asset.id === c.activeAngleAssetId && asset.url && !asset.missing);
        const videoPosition = angleAsset && Number.isFinite(Number(c.activeAngleIn))
          ? Math.max(0, Number(c.activeAngleIn) + Math.max(0, state.playhead - c.start) * Math.max(0.1, Math.min(4, c.speed || 1)))
          : position;
        const t = track(c.trackId);
        if (!active || (t && t.hidden)) { media.pause(); }
        else {
          if (media.readyState >= 1 && (forceSeek || Math.abs(media.currentTime - videoPosition) > 0.28)) { try { media.currentTime = videoPosition; } catch (_) {} }
          if (state.playing && media.paused && media.readyState >= 2) media.play().catch(() => {});
          if (!state.playing) media.pause();
        }
      }
      if (audio) {
        audio.playbackRate = Math.max(0.1, Math.min(4, c.speed || 1));
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
  function effectFilter(value, clip) {
    const map = {
      normal: '', cinematic: 'contrast(1.18) saturate(.82)', monochrome: 'grayscale(1)',
      warm: 'sepia(.28) saturate(1.22)', cool: 'hue-rotate(12deg) saturate(.9)',
      faded: 'contrast(.88) saturate(.78)', blur: 'blur(2px)'
    };
    const parts = [];
    if (map[value]) parts.push(map[value]);
    const grade = clip && clip.colorAdjustments || {};
    const exposure = Math.max(-2, Math.min(2, Number(grade.exposure) || 0));
    const contrast = Math.max(.5, Math.min(2, Number(grade.contrast) || 1));
    const saturation = Math.max(0, Math.min(2, grade.saturation == null ? 1 : Number(grade.saturation)));
    if (exposure) parts.push('brightness(' + Math.pow(2, exposure).toFixed(3) + ')');
    if (contrast !== 1) parts.push('contrast(' + contrast.toFixed(3) + ')');
    if (saturation !== 1) parts.push('saturate(' + saturation.toFixed(3) + ')');
    const effectMap = {
      grayscale: amount => 'grayscale(' + (amount / 100).toFixed(2) + ')',
      sepia: amount => 'sepia(' + (amount / 100).toFixed(2) + ')',
      blur: amount => 'blur(' + (amount / 10).toFixed(2) + 'px)',
      soften: amount => 'blur(' + (amount / 20).toFixed(2) + 'px)',
      boost: amount => 'contrast(' + (1 + amount / 200).toFixed(2) + ') saturate(' + (1 + amount / 200).toFixed(2) + ')',
      desaturate: amount => 'saturate(' + (1 - amount / 125).toFixed(2) + ')',
      invert: amount => 'invert(' + (amount / 100).toFixed(2) + ')',
      hue: amount => 'hue-rotate(' + (amount * 3.6).toFixed(1) + 'deg)',
      brighten: amount => 'brightness(' + (0.5 + amount / 100).toFixed(2) + ')',
      crush: amount => 'contrast(' + (1 + amount / 125).toFixed(2) + ')'
    };
    (clip && Array.isArray(clip.effects) ? clip.effects : []).filter(e => e && e.enabled !== false).forEach(e => {
      const render = effectMap[e.type];
      if (render) parts.push(render(Math.max(0, Math.min(100, e.amount == null ? 100 : Number(e.amount)))));
    });
    return parts.join(' ') || 'none';
  }
  function alphaFor(c) {
    let alpha = Math.max(0, Math.min(1, animatedValue(c, 'opacity', c.opacity == null ? 1 : c.opacity)));
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
    ctx.filter = effectFilter(c.filter, c);
    const animatedScale = Math.max(0.1, Math.min(3, animatedValue(c, 'scale', c.scale || 1)));
    const w = W * animatedScale, h = H * animatedScale;
    const ratio = c.mediaEl.videoWidth / c.mediaEl.videoHeight;
    let drawW = w, drawH = h;
    if (c.fit !== 'fill') {
      if ((ratio > w / h && c.fit === 'contain') || (ratio < w / h && c.fit === 'cover')) { drawW = w; drawH = w / ratio; }
      else { drawH = h; drawW = h * ratio; }
      if (c.fit === 'cover') { drawW = w; drawH = h; }
    }
    const x = (W - drawW) / 2 + animatedValue(c, 'x', c.x || 0) * W / 100;
    const y = (H - drawH) / 2 + animatedValue(c, 'y', c.y || 0) * H / 100;
    ctx.drawImage(c.mediaEl, x, y, drawW, drawH);
    const grade = c.colorAdjustments || {};
    const temperature = Math.max(-100, Math.min(100, Number(grade.temperature) || 0));
    const tint = Math.max(-100, Math.min(100, Number(grade.tint) || 0));
    if (temperature || tint) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = alphaFor(c) * Math.min(.42, (Math.abs(temperature) + Math.abs(tint)) / 480);
      ctx.fillStyle = temperature > 0 ? '#ff9b52' : temperature < 0 ? '#438dff' : (tint > 0 ? '#c56cff' : '#65c77c');
      ctx.fillRect(x, y, drawW, drawH);
    }
    ctx.restore();
  }
  function drawTitle(ctx, c) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save();
    ctx.globalAlpha = alphaFor(c);
    const animatedScale = Math.max(0.1, Math.min(3, animatedValue(c, 'scale', c.scale || 1)));
    const size = Math.max(18, Math.min(180, c.fontSize || 72)) * (H / 1080) * animatedScale;
    ctx.font = (c.bold ? '700 ' : '400 ') + size + 'px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 14 * (H / 1080);
    if (['rectangle','roundRect','ellipse'].includes(c.maskType)) {
      const maskPath = (type, percent, offsetX, offsetY) => {
        const scale = Math.max(10, Math.min(100, Number(percent) || 90)) / 100;
        const centerX = W / 2 + Math.max(-50, Math.min(50, Number(offsetX) || 0)) * W / 100;
        const centerY = H / 2 + Math.max(-50, Math.min(50, Number(offsetY) || 0)) * H / 100;
        const path = new Path2D();
        if (type === 'ellipse') path.ellipse(centerX, centerY, W * scale / 2, H * scale / 2, 0, 0, Math.PI * 2);
        // Keep the corner radius proportional to the mask size so the shape scales consistently.
        else if (type === 'roundRect') path.roundRect(centerX - W * scale / 2, centerY - H * scale / 2, W * scale, H * scale, Math.min(W * scale, H * scale) * 0.12);
        else path.rect(centerX - W * scale / 2, centerY - H * scale / 2, W * scale, H * scale);
        return path;
      };
      const primary = maskPath(c.maskType, animatedValue(c, 'maskSize', c.maskSize || 90), c.maskX, c.maskY);
      const secondaryType = c.maskSecondaryType;
      if (!['rectangle','roundRect','ellipse'].includes(secondaryType)) ctx.clip(primary);
      else {
        const secondary = maskPath(secondaryType, animatedValue(c, 'maskSecondarySize', c.maskSecondarySize || 60), c.maskSecondaryX, c.maskSecondaryY);
        if (c.maskOperation === 'intersect') { ctx.clip(primary); ctx.clip(secondary); }
        else if (c.maskOperation === 'xor') {
          const exclusive = new Path2D();
          exclusive.addPath(primary); exclusive.addPath(secondary);
          ctx.clip(exclusive, 'evenodd');
        } else if (c.maskOperation === 'subtract') {
          // First constrain output to the primary mask, then remove the secondary
          // shape from the full frame. This implements A minus B even when B
          // extends beyond A; XOR of the two paths would be incorrect here.
          ctx.clip(primary);
          const outsideSecondary = new Path2D();
          outsideSecondary.rect(0, 0, W, H);
          outsideSecondary.addPath(secondary);
          ctx.clip(outsideSecondary, 'evenodd');
        } else {
          const combined = new Path2D();
          combined.addPath(primary); combined.addPath(secondary);
          ctx.clip(combined, 'nonzero');
        }
      }
    }
    ctx.fillStyle = c.color || '#ffffff';
    const x = W / 2 + animatedValue(c, 'x', c.x || 0) * W / 100;
    if (c.shapeType === 'rectangle' || c.shapeType === 'ellipse') {
      const y = H / 2 + animatedValue(c, 'y', c.y || 0) * H / 100;
      const shapeW = Math.max(20, (c.fontSize || 120) * 2.4 * animatedScale * (W / 1920));
      const shapeH = Math.max(20, (c.fontSize || 120) * animatedScale * (H / 1080));
      ctx.shadowBlur = 0;
      if (c.shapeType === 'ellipse') { ctx.beginPath(); ctx.ellipse(x, y, shapeW / 2, shapeH / 2, 0, 0, Math.PI * 2); ctx.fill(); if (Number(c.strokeWidth) > 0) { ctx.strokeStyle = c.strokeColor || '#ffffff'; ctx.lineWidth = Math.min(30, Math.max(0, Number(c.strokeWidth))) * (W / 1920); ctx.stroke(); } }
      else { ctx.fillRect(x - shapeW / 2, y - shapeH / 2, shapeW, shapeH); if (Number(c.strokeWidth) > 0) { ctx.strokeStyle = c.strokeColor || '#ffffff'; ctx.lineWidth = Math.min(30, Math.max(0, Number(c.strokeWidth))) * (W / 1920); ctx.strokeRect(x - shapeW / 2, y - shapeH / 2, shapeW, shapeH); } }
    } else {
      const lines = String(c.text || '').split('\\n').slice(0, 5);
      const y = H * 0.815 + animatedValue(c, 'y', c.y || 0) * H / 100;
      lines.forEach((line, i) => ctx.fillText(line.slice(0, 250), x, y + (i - (lines.length - 1) / 2) * size * 1.16, W * .88));
    }
    ctx.restore();
  }
  function renderPreview() {
    const canvas = $('video-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const videoTracks = state.tracks.filter(t => t.kind === 'video' && !t.hidden);
    // Composite lower tracks first, then upper tracks.
    videoTracks.slice().reverse().forEach(t => state.clips.filter(c => c.trackId === t.id && c.type === 'video' && !c.missing && activeAt(c)).sort((a, b) => a.start - b.start).forEach(c => drawVideoClip(ctx, c)));
    state.tracks.filter(t => t.kind === 'title' && !t.hidden).forEach(t => state.clips.filter(c => c.trackId === t.id && c.type === 'title' && activeAt(c)).sort((a, b) => a.start - b.start).forEach(c => drawTitle(ctx, c)));
    const hasVisibleContent = state.clips.some(c => c.type === 'video' && activeAt(c) && !c.missing && !(track(c.trackId) || {}).hidden) || state.clips.some(c => c.type === 'title' && activeAt(c) && !(track(c.trackId) || {}).hidden);
    $('video-empty').classList.toggle('hidden', hasVisibleContent);
    if (window.FluxivoraMotionStudio?.applyProgramLut) window.FluxivoraMotionStudio.applyProgramLut(canvas);
    window.dispatchEvent(new Event('fluxivora:preview-rendered'));
  }
  function updateTransport() {
    $('video-current').textContent = tc(state.playhead);
    $('video-duration').textContent = tc(timelineEnd());
    $('video-seek').max = String(Math.max(0.01, timelineEnd()));
    $('video-seek').value = String(Math.min(timelineEnd(), state.playhead));
    $('video-play').textContent = state.playing ? 'Ⅱ' : '▶';
    const canExport = state.clips.length > 0 && !state.clips.some(c => c.missing);
    $('video-export').disabled = !canExport || state.exportActive || state.offlineExportActive;
    $('video-export-webm').disabled = !canExport || state.exportActive || state.offlineExportActive;
    $('video-export-cancel').disabled = !state.offlineExportActive;
    $('video-zoom').value = String(state.zoom);
    $('video-zoom-label').textContent = state.zoom + ' px/s';
    $('video-snap').classList.toggle('active', state.snap);
  }
  function fitTimeline() {
    const scroll = $('video-timeline-scroll');
    const available = Math.max(160, scroll.clientWidth - 160);
    const end = Math.max(20, timelineEnd() + 2);
    state.zoom = Math.max(16, Math.min(100, Math.floor(available / end)));
    $('video-zoom').value = String(state.zoom);
    $('video-zoom-label').textContent = state.zoom + ' px/s';
    renderTracks();
    scroll.scrollLeft = 0;
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
    state.markers.forEach(marker => {
      const flag = document.createElement('button');
      flag.type = 'button'; flag.className = 'video-marker';
      flag.style.left = (marker.time * state.zoom) + 'px';
      flag.title = marker.label + ' · ' + tc(marker.time);
      flag.setAttribute('aria-label', 'Ga naar marker ' + marker.label);
      flag.addEventListener('click', e => { e.stopPropagation(); seekTo(marker.time); });
      flag.addEventListener('contextmenu', e => {
        e.preventDefault(); pushHistory(); state.markers = state.markers.filter(m => m.id !== marker.id); renderTracks();
      });
      const label = document.createElement('span'); label.textContent = marker.label;
      flag.append(label); ruler.append(flag);
    });
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
        c.start = snapTime((e.clientX - lane.getBoundingClientRect().left) / state.zoom, c.id);
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
        if (c.type === 'video' && Array.isArray(c.thumbnails) && c.thumbnails.length) {
          const filmstrip = document.createElement('div');
          filmstrip.className = 'video-clip-filmstrip';
          c.thumbnails.forEach(src => {
            const thumb = document.createElement('img'); thumb.src = src; thumb.alt = ''; thumb.draggable = false;
            filmstrip.append(thumb);
          });
          block.append(filmstrip);
        }
        block.append(title);
        if (c.type === 'audio' && Array.isArray(c.waveform) && c.waveform.length) {
          const wave = document.createElement('canvas');
          wave.className = 'video-clip-waveform';
          wave.width = Math.min(600, Math.max(32, Math.floor(clipLength(c) * state.zoom)));
          wave.height = 16;
          wave.style.width = '100%';
          wave.style.height = '16px';
          const waveCtx = wave.getContext('2d');
          if (waveCtx) {
            waveCtx.fillStyle = '#79e3cd';
            const barStep = wave.width / c.waveform.length;
            c.waveform.forEach((peak, idx) => {
              const h = Math.max(1, peak * (wave.height - 2));
              waveCtx.fillRect(idx * barStep, (wave.height - h) / 2, Math.max(1, barStep * 0.58), h);
            });
          }
          block.append(wave);
        }
        block.append(duration);
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
              c.in = next; c.start = Math.max(0, startAt + (next - sourceIn) / Math.max(0.1, c.speed || 1));
            } else c.out = Math.max(sourceIn + 0.1, Math.min(c.duration, sourceOut + delta));
            renderTracks(); renderPreview(); updateTransport();
          };
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); refresh(); };
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
        }));
        lane.append(block);
      });
      row.append(header, lane);
      tracks.append(row);
    });
    updatePlayheadLine();
    $('video-track-count').textContent = state.tracks.length + ' tracks';
  }
  function updatePlayheadLine() {
    const tracks = $('video-tracks'), playhead = $('video-playhead-line');
    if (!tracks || !playhead) return;
    playhead.style.left = (132 + state.playhead * state.zoom) + 'px';
    playhead.style.height = (tracks.scrollHeight + 40) + 'px';
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
    $('video-x').value = String(c.x || 0);
    $('video-y').value = String(c.y || 0);
    $('video-keyframe-count').textContent = (c.keyframes || []).length + ' keyframes';
    $('video-filter').value = c.filter || 'normal';
    $('video-fit').value = c.fit || 'contain';
    $('video-fade-in').value = String(c.fadeIn || 0);
    $('video-fade-out').value = String(c.fadeOut || 0);
    $('video-title-text').value = c.text || '';
    $('video-title-size').value = String(c.fontSize || 72);
    $('video-title-color').value = c.color || '#ffffff';
    $('video-shape-stroke-color').value = /^#[0-9a-f]{6}$/i.test(c.strokeColor || '') ? c.strokeColor : '#ffffff';
    $('video-shape-stroke-width').value = String(Math.max(0, Math.min(30, Number(c.strokeWidth) || 0)));
    $('video-mask-type').value = ['none','rectangle','roundRect','ellipse'].includes(c.maskType) ? c.maskType : 'none';
    $('video-mask-size').value = String(Math.max(10, Math.min(100, Number(c.maskSize) || 90)));
    $('video-mask-x').value = String(Math.max(-50, Math.min(50, Number(c.maskX) || 0)));
    $('video-mask-y').value = String(Math.max(-50, Math.min(50, Number(c.maskY) || 0)));
    $('video-mask-secondary').value = ['none','rectangle','roundRect','ellipse'].includes(c.maskSecondaryType) ? c.maskSecondaryType : 'none';
    $('video-mask-secondary-size').value = String(Math.max(10, Math.min(100, Number(c.maskSecondarySize) || 60)));
    $('video-mask-secondary-x').value = String(Math.max(-50, Math.min(50, Number(c.maskSecondaryX) || 0)));
    $('video-mask-secondary-y').value = String(Math.max(-50, Math.min(50, Number(c.maskSecondaryY) || 0)));
    $('video-mask-operation').value = ['add','subtract','intersect','xor'].includes(c.maskOperation) ? c.maskOperation : 'add';
    $('video-shape-controls').classList.toggle('hidden', c.type !== 'title' || !['rectangle','ellipse'].includes(c.shapeType));
    $('video-title-controls').classList.toggle('hidden', c.type !== 'title');
    document.querySelectorAll('.video-video-controls').forEach(element => element.classList.toggle('hidden', c.type !== 'video'));
    $('video-motion-controls').classList.toggle('hidden', c.type === 'audio');
    document.querySelectorAll('.video-audio-controls').forEach(element => element.classList.toggle('hidden', c.type === 'title'));
    ['video-in','video-out','video-speed','video-volume'].forEach(id => { $(id).disabled = c.missing; });
  }
  function renderMotionLayers() {
    const list = $('motionfx-layer-list');
    const count = $('motionfx-layer-count');
    if (!list || !count) return;
    list.replaceChildren();
    count.textContent = String(state.tracks.length);
    state.tracks.forEach((t, index) => {
      const row = document.createElement('div');
      row.className = 'motionfx-layer-row' + (t.id === state.activeTrack ? ' active' : '');
      const select = document.createElement('button');
      select.type = 'button'; select.className = 'motionfx-layer-select';
      select.dataset.layerAction = 'select'; select.dataset.trackId = t.id;
      select.title = 'Selecteer ' + t.name + ' in de tijdlijn';
      const kind = document.createElement('span'); kind.className = 'motionfx-layer-kind';
      kind.textContent = t.kind === 'video' ? '▣' : t.kind === 'audio' ? '♫' : 'T';
      const label = document.createElement('strong'); label.textContent = t.name;
      const details = document.createElement('small');
      details.textContent = state.clips.filter(c => c.trackId === t.id).length + ' clips';
      select.append(kind, label, details);
      const actions = document.createElement('div'); actions.className = 'motionfx-layer-actions';
      const actionButton = (text, action, title, active = false, disabled = false) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
        b.dataset.layerAction = action; b.dataset.trackId = t.id; b.title = title;
        if (active) b.classList.add('active');
        b.disabled = disabled; actions.append(b);
      };
      const sameKindIndices = state.tracks.map((x, i) => x.kind === t.kind ? i : -1).filter(i => i >= 0);
      const kindIndex = sameKindIndices.indexOf(index);
      actionButton('↑', 'up', 'Laag naar voren / hoger', false, kindIndex <= 0);
      actionButton('↓', 'down', 'Laag naar achteren / lager', false, kindIndex < 0 || kindIndex >= sameKindIndices.length - 1);
      if (t.kind === 'audio') actionButton(t.muted ? 'M̸' : 'M', 'visibility', t.muted ? 'Track weer hoorbaar maken' : 'Track dempen', t.muted);
      else actionButton(t.hidden ? '◌' : '◉', 'visibility', t.hidden ? 'Track zichtbaar maken' : 'Track verbergen', t.hidden);
      actionButton(t.locked ? '🔒' : '⌑', 'lock', t.locked ? 'Track ontgrendelen' : 'Track vergrendelen', t.locked);
      row.append(select, actions); list.append(row);
    });
  }
  function handleMotionLayerAction(event) {
    const button = event.target.closest('[data-layer-action]');
    if (!button || !$('motionfx-layer-list')?.contains(button)) return;
    const t = track(button.dataset.trackId);
    if (!t) return;
    const action = button.dataset.layerAction;
    if (action === 'select') { state.activeTrack = t.id; refresh(); return; }
    if (action === 'visibility') {
      pushHistory();
      if (t.kind === 'audio') t.muted = !t.muted;
      else t.hidden = !t.hidden;
      refresh(); renderPreview(); return;
    }
    if (action === 'lock') { pushHistory(); t.locked = !t.locked; refresh(); return; }
    if (action === 'up' || action === 'down') {
      const index = state.tracks.findIndex(x => x.id === t.id);
      const indices = state.tracks.map((x, i) => x.kind === t.kind ? i : -1).filter(i => i >= 0);
      const position = indices.indexOf(index);
      const next = indices[position + (action === 'up' ? -1 : 1)];
      if (next === undefined) return;
      pushHistory();
      [state.tracks[index], state.tracks[next]] = [state.tracks[next], state.tracks[index]];
      state.activeTrack = t.id;
      refresh(); renderPreview();
    }
  }
  const MOTION_COMPOSITIONS_KEY = 'fluxivora.motionfx.compositions.v1';
  function readMotionCompositions() {
    try {
      const raw = localStorage.getItem(MOTION_COMPOSITIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.layers))
        .slice(0, 30).map(item => ({ id: item.id, name: item.name.slice(0, 60), layers: item.layers.slice(0, 30).filter(layer => layer && layer.type === 'title' && typeof layer.name === 'string') }));
    } catch (_) { return []; }
  }
  function writeMotionCompositions(items) {
    try { localStorage.setItem(MOTION_COMPOSITIONS_KEY, JSON.stringify(items.slice(0, 30))); return true; }
    catch (_) { notice('De lokale compositiebibliotheek kan niet worden opgeslagen.'); return false; }
  }
  function exportMotionCompositions() {
    const items = readMotionCompositions();
    const payload = { format: 'fluxivora-motion-compositions', version: 1, exportedAt: new Date().toISOString(), compositions: items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fluxivora-motion-compositions.json';
    anchor.click();
    URL.revokeObjectURL(url);
    notice(items.length + (items.length === 1 ? ' compositie geëxporteerd.' : ' composities geëxporteerd.'));
  }
  async function importMotionCompositions(file) {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Het JSON-bestand is groter dan 2 MB.');
      const text = await file.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { throw new Error('Het bestand bevat geen geldige JSON.'); }
      const imported = Array.isArray(parsed) ? parsed : parsed && parsed.format === 'fluxivora-motion-compositions' && parsed.version === 1 ? parsed.compositions : null;
      if (!Array.isArray(imported) || imported.length > 30) throw new Error('Dit is geen ondersteunde compositiebibliotheek (maximaal 30 composities).');
      const existing = readMotionCompositions();
      const merged = existing.slice();
      const usedIds = new Set(existing.map(item => item.id));
      for (const candidate of imported) {
        if (!candidate || typeof candidate !== 'object' || typeof candidate.name !== 'string' || !candidate.name.trim() || candidate.name.trim().length > 60 || !Array.isArray(candidate.layers) || candidate.layers.length < 1 || candidate.layers.length > 30) {
          throw new Error('Een compositie heeft een ongeldige naam of laagstructuur.');
        }
        const layers = candidate.layers.map(layer => {
          if (!layer || typeof layer !== 'object' || layer.type !== 'title' || typeof layer.name !== 'string' || !layer.name || layer.name.length > 128) {
            throw new Error('Alleen geldige grafische titel-/vormlagen kunnen worden geïmporteerd.');
          }
          return { ...layer, type: 'title', keyframes: Array.isArray(layer.keyframes) ? layer.keyframes.slice(0, 1000) : [], effects: Array.isArray(layer.effects) ? layer.effects.slice(0, 100) : [] };
        });
        let id = typeof candidate.id === 'string' && candidate.id.length <= 128 ? candidate.id : uid('composition');
        if (usedIds.has(id)) id = uid('composition');
        usedIds.add(id);
        merged.push({ id, name: candidate.name.trim(), layers });
      }
      if (merged.length > 30) throw new Error('Er is ruimte voor maximaal 30 composities. Verwijder eerst composities en probeer opnieuw.');
      if (!writeMotionCompositions(merged)) return;
      renderMotionCompositions();
      notice(imported.length + (imported.length === 1 ? ' compositie geïmporteerd.' : ' composities geïmporteerd.'));
    } catch (error) {
      notice('Importeren mislukt: ' + (error && error.message ? error.message : 'ongeldig bestand.'));
    }
  }
  function renderMotionCompositions() {
    const list = $('motionfx-composition-list');
    const count = $('motionfx-composition-count');
    if (!list || !count) return;
    const items = readMotionCompositions();
    count.textContent = String(items.length);
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'motionfx-composition-empty';
      empty.textContent = 'Nog geen opgeslagen composities. Voeg eerst titel- of vormlagen toe.';
      list.append(empty);
      return;
    }
    items.forEach(item => {
      const row = document.createElement('div'); row.className = 'motionfx-composition-row';
      const copy = document.createElement('div'); copy.className = 'motionfx-composition-copy';
      const title = document.createElement('strong'); title.textContent = item.name;
      const detail = document.createElement('small'); detail.textContent = item.layers.length + (item.layers.length === 1 ? ' grafische laag' : ' grafische lagen');
      copy.append(title, detail);
      const actions = document.createElement('div'); actions.className = 'motionfx-composition-actions';
      const insert = document.createElement('button'); insert.type = 'button'; insert.textContent = '＋'; insert.title = 'Compositie invoegen op de afspeelkop'; insert.dataset.compositionAction = 'insert'; insert.dataset.compositionId = item.id;
      const update = document.createElement('button'); update.type = 'button'; update.textContent = '↻'; update.title = 'Compositie bijwerken met huidige grafische lagen'; update.dataset.compositionAction = 'update'; update.dataset.compositionId = item.id;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = 'Compositie verwijderen'; remove.dataset.compositionAction = 'delete'; remove.dataset.compositionId = item.id;
      actions.append(insert, update, remove); row.append(copy, actions); list.append(row);
    });
  }
  function saveMotionComposition() {
    const layers = state.clips.filter(c => c.type === 'title').sort((a, b) => a.start - b.start);
    if (!layers.length) { notice('Voeg eerst een titel- of vormlaag toe om een compositie te bewaren.'); return; }
    if (layers.length > 30) { notice('Een compositie kan maximaal 30 grafische lagen bevatten.'); return; }
    const input = $('motionfx-composition-name');
    const name = String(input.value || '').trim().slice(0, 60);
    if (!name) { input.focus(); notice('Geef de compositie eerst een naam.'); return; }
    const items = readMotionCompositions();
    if (items.length >= 30) { notice('De bibliotheek bevat al 30 composities. Verwijder er eerst één.'); return; }
    const origin = Math.min(...layers.map(c => c.start));
    const item = {
      id: uid('composition'), name,
      layers: layers.map(c => ({ ...metaClip(c), start: Math.max(0, c.start - origin), type: 'title' }))
    };
    items.unshift(item);
    if (writeMotionCompositions(items)) {
      input.value = '';
      renderMotionCompositions();
      notice('Compositie bewaard: ' + name);
    }
  }
  function handleMotionCompositionAction(event) {
    const button = event.target.closest('[data-composition-action]');
    if (!button || !$('motionfx-composition-list')?.contains(button)) return;
    const items = readMotionCompositions();
    const item = items.find(entry => entry.id === button.dataset.compositionId);
    if (!item) return;
    if (button.dataset.compositionAction === 'delete') {
      if (writeMotionCompositions(items.filter(entry => entry.id !== item.id))) {
        renderMotionCompositions();
        notice('Compositie verwijderd uit de lokale bibliotheek.');
      }
      return;
    }
    if (button.dataset.compositionAction === 'update') {
      const layers = state.clips.filter(c => c.type === 'title').sort((a, b) => a.start - b.start);
      if (!layers.length) { notice('Voeg eerst grafische lagen toe om deze compositie bij te werken.'); return; }
      if (layers.length > 30) { notice('Een compositie kan maximaal 30 grafische lagen bevatten.'); return; }
      const origin = Math.min(...layers.map(c => c.start));
      const updated = { ...item, layers: layers.map(layer => ({ ...metaClip(layer), start: Math.max(0, layer.start - origin), type: 'title' })) };
      if (writeMotionCompositions(items.map(entry => entry.id === item.id ? updated : entry))) {
        renderMotionCompositions();
        notice('Compositie bijgewerkt: ' + item.name);
      }
      return;
    }
    if (button.dataset.compositionAction !== 'insert') return;
    const targetTrack = state.tracks.find(t => t.kind === 'title');
    if (!targetTrack) { notice('Voeg eerst een titeltrack toe.'); return; }
    pushHistory();
    const compositionId = uid('placed-composition');
    item.layers.forEach(layer => {
      const clone = {
        ...layer,
        id: uid('layer'),
        name: layer.name.slice(0, 128),
        type: 'title',
        trackId: targetTrack.id,
        start: Math.max(0, state.playhead + Number(layer.start || 0)),
        keyframes: Array.isArray(layer.keyframes) ? layer.keyframes.map(frame => ({ ...frame })) : [],
        effects: Array.isArray(layer.effects) ? layer.effects.map(effect => ({ ...effect })) : [],
        colorAdjustments: { exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0, ...(layer.colorAdjustments || {}) },
        compositionId,
        compositionName: item.name,
        file: null, url: null, mediaEl: null, audioEl: null, audioSource: null, audioGain: null, missing: false
      };
      state.clips.push(clone);
      state.selected = clone.id;
    });
    state.activeTrack = targetTrack.id;
    refresh(); renderPreview();
    notice('Compositie ingevoegd: ' + item.name);
  }
  function refresh() {
    renderTracks(); renderMotionLayers(); renderMotionCompositions(); populateInspector(); updateTransport(); updateHistoryButtons();
    const n = state.clips.length;
    $('video-count').textContent = n + (n === 1 ? ' clip' : ' clips');
    $('video-project-name').value = state.name;
    window.dispatchEvent(new Event('fluxivora:motion-refresh'));
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
    if (now - state.lastUi > 100) { updateTransport(); updatePlayheadLine(); state.lastUi = now; }
    if (state.playhead >= timelineEnd() && timelineEnd() > 0) { stopPlayback(); return; }
    state.raf = requestAnimationFrame(tick);
  }
  const offlineAudioBufferCache = new WeakMap();
  const OFFLINE_AUDIO_CHUNK_SAMPLES = 4 * 48000;

  function setOfflineProgress(title, detail, progress) {
    $('video-render-progress').classList.remove('hidden');
    $('video-render-progress-title').textContent = title;
    $('video-render-progress-detail').textContent = detail;
    if (Number.isFinite(progress)) $('video-render-meter').value = Math.max(0, Math.min(1, progress));
  }

  function requestRenderPaint() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  function waitForVideoFrame(media, name, targetTime) {
    if (!media) return Promise.resolve();
    if (media.error) return Promise.reject(new Error('De video-decoder kan "' + name + '" niet lezen.'));
    const target = Number.isFinite(targetTime) ? Math.max(0, targetTime) : null;
    if (target === null && media.readyState >= 2 && !media.seeking && media.videoWidth > 0) return Promise.resolve();
    if (target !== null && media.readyState >= 2 && !media.seeking &&
        media.videoWidth > 0 && Math.abs(media.currentTime - target) <= 0.025) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timer = null;
      let pendingSeek = false;
      let settled = false;
      const cleanup = () => {
        if (timer !== null) clearTimeout(timer);
        media.removeEventListener('seeked', onSeeked);
        media.removeEventListener('loadedmetadata', check);
        media.removeEventListener('loadeddata', check);
        media.removeEventListener('error', failed);
      };
      const finish = error => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error); else resolve();
      };
      const check = () => {
        if (settled) return;
        if (media.error) return failed();
        if (media.readyState < 1 || media.seeking) return;
        const duration = Number.isFinite(media.duration) ? media.duration : Infinity;
        const desired = target === null ? media.currentTime : Math.max(0, Math.min(target, Math.max(0, duration - 0.0005)));
        if (target !== null && Math.abs(media.currentTime - desired) > 0.025) {
          try {
            pendingSeek = true;
            media.currentTime = desired;
          } catch (_) {
            pendingSeek = false;
          }
          if (pendingSeek) return;
        }
        if (media.readyState >= 2 && !media.seeking && media.videoWidth > 0 &&
            !pendingSeek && (target === null || Math.abs(media.currentTime - desired) <= 0.025)) {
          finish();
        }
      };
      const onSeeked = () => {
        pendingSeek = false;
        check();
      };
      const failed = () => finish(new Error('De video-decoder kon geen frame laden uit "' + name + '". Controleer of dit bronformaat in deze versie wordt ondersteund.'));
      media.addEventListener('seeked', onSeeked);
      media.addEventListener('loadedmetadata', check);
      media.addEventListener('loadeddata', check);
      media.addEventListener('error', failed);
      timer = window.setTimeout(() => {
        check();
        if (!settled) failed();
      }, 6000);
      check();
    });
  }
  async function renderTimelineFrame(time) {
    state.playhead = Math.max(0, time);
    state.playing = false;
    syncMedia(true);
    const activeVideos = state.clips.filter(clip => clip.type === 'video' && !clip.missing && activeAt(clip) && clip.mediaEl);
    await Promise.all(activeVideos.map(clip => {
      const speed = Math.max(0.1, Math.min(4, Number(clip.speed) || 1));
      const elapsed = Math.max(0, state.playhead - clip.start) * speed;
      const angle = clip.activeAngleAssetId && state.assets.find(asset => asset.id === clip.activeAngleAssetId && asset.url && !asset.missing);
      const target = angle && Number.isFinite(Number(clip.activeAngleIn))
        ? Number(clip.activeAngleIn) + elapsed
        : Math.min(clip.out, clip.in + elapsed);
      return waitForVideoFrame(clip.mediaEl, clip.name, target);
    }));
    await requestRenderPaint();
    if (state.offlineExportCancel) throw new Error('MP4-export geannuleerd.');
    renderPreview();
    await requestRenderPaint();
  }

  function toBase64(bytes) {
    let binary = '';
    const sliceSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += sliceSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + sliceSize)));
    }
    return btoa(binary);
  }

  async function decodeOfflineAudioFile(file) {
    if (!file) throw new Error('Een audiobron ontbreekt in het project.');
    if (state.offlineExportCancel) throw new Error('MP4-export geannuleerd.');
    if (file.size > 256 * 1024 * 1024) {
      throw new Error('Deze bron is groter dan 256 MB en past niet veilig in de offline audiodecoder van beta.6. Gebruik een kleinere audio-extractie.');
    }
    if (offlineAudioBufferCache.has(file)) return offlineAudioBufferCache.get(file);
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioContextClass || !OfflineContext) throw new Error('Offline audio-rendering wordt niet door deze Electron-versie ondersteund.');
    const promise = (async () => {
      const decoder = new AudioContextClass({ sampleRate: 48000 });
      try {
        const bytes = await file.arrayBuffer();
        return await decoder.decodeAudioData(bytes);
      } finally {
        try { await decoder.close(); } catch (_) {}
      }
    })();
    offlineAudioBufferCache.set(file, promise);
    try { return await promise; }
    catch (error) {
      offlineAudioBufferCache.delete(file);
      throw error;
    }
  }

  function exportAnimatedValue(clip, key, relativeTime, baseValue) {
    const frames = Array.isArray(clip.keyframes)
      ? clip.keyframes.filter(frame => Number.isFinite(frame.time) && Number.isFinite(frame[key])).slice().sort((a, b) => a.time - b.time)
      : [];
    if (!frames.length) return Number(baseValue) || 0;
    if (relativeTime <= frames[0].time) return frames[0][key];
    if (relativeTime >= frames[frames.length - 1].time) return frames[frames.length - 1][key];
    const curves = {
      linear: value => value,
      easeIn: value => value * value,
      easeOut: value => 1 - Math.pow(1 - value, 2),
      easeInOut: value => value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2,
      hold: () => 0
    };
    for (let i = 1; i < frames.length; i++) {
      const left = frames[i - 1], right = frames[i];
      if (relativeTime <= right.time) {
        const amount = Math.max(0, Math.min(1, (relativeTime - left.time) / Math.max(0.0001, right.time - left.time)));
        if (right.ease === 'bezier' && window.FluxivoraKeyframeCurves) return window.FluxivoraKeyframeCurves.bezierValue(left, right, key, amount);
        const t = (curves[right.ease] || curves.linear)(amount);
        return left[key] + (right[key] - left[key]) * t;
      }
    }
    return Number(baseValue) || 0;
  }

  function exportAudioGain(clip, relativeTime) {
    const length = clipLength(clip);
    let fade = 1;
    const fadeIn = Math.max(0, Number(clip.fadeIn) || 0);
    const fadeOut = Math.max(0, Number(clip.fadeOut) || 0);
    if (fadeIn > 0) fade = Math.min(fade, Math.max(0, Math.min(1, relativeTime / fadeIn)));
    if (fadeOut > 0) fade = Math.min(fade, Math.max(0, Math.min(1, (length - relativeTime) / fadeOut)));
    return Math.max(0, exportAnimatedValue(clip, 'volume', relativeTime, clip.volume) * fade);
  }

  async function prepareOfflineAudio(durationSeconds) {
    const entries = [];
    let skippedVideoAudio = 0;
    for (const clip of state.clips) {
      if (state.offlineExportCancel) throw new Error('MP4-export geannuleerd.');
      if (!['video', 'audio'].includes(clip.type) || clip.missing || clip.start >= durationSeconds || clipLength(clip) <= 0) continue;
      const clipTrack = track(clip.trackId);
      if (clipTrack && clipTrack.muted) continue;
      const possibleVolume = [Number(clip.volume) || 0, ...(clip.keyframes || []).map(frame => Number(frame.volume) || 0)];
      if (possibleVolume.every(value => value <= 0)) continue;
      const asset = state.assets.find(item => item.id === clip.assetId) ||
        state.assets.find(item => item.file && clip.file && item.file === clip.file) ||
        state.assets.find(item => item.type === clip.type && item.name.toLowerCase() === String(clip.name || '').toLowerCase());
      const file = clip.file || asset?.file;
      if (!file) {
        if (clip.type === 'audio') throw new Error('Koppel eerst het audiobestand "' + clip.name + '" opnieuw.');
        skippedVideoAudio++;
        continue;
      }
      try {
        const buffer = await decodeOfflineAudioFile(file);
        entries.push({ clip, buffer });
      } catch (error) {
        if (clip.type === 'audio') {
          throw new Error('De audioclip "' + clip.name + '" kon niet worden gedecodeerd: ' + error.message);
        }
        skippedVideoAudio++;
      }
    }
    return { entries, skippedVideoAudio };
  }

  function softLimitSample(sample) {
    const value = sample * 0.85;
    const magnitude = Math.abs(value);
    if (magnitude <= 0.84) return value;
    return Math.sign(value) * (0.84 + 0.16 * Math.tanh((magnitude - 0.84) / 0.16));
  }

  async function renderOfflineAudioChunk(entries, chunkStartSample, chunkSamples) {
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const context = new OfflineContext(2, chunkSamples, 48000);
    const chunkStart = chunkStartSample / 48000;
    const chunkDuration = chunkSamples / 48000;
    for (const entry of entries) {
      const clip = entry.clip, buffer = entry.buffer;
      const speed = Math.max(0.1, Math.min(4, Number(clip.speed) || 1));
      const clipStart = Math.max(0, Number(clip.start) || 0);
      const clipEnd = clipStart + clipLength(clip);
      const overlapStart = Math.max(chunkStart, clipStart);
      const overlapEnd = Math.min(chunkStart + chunkDuration, clipEnd);
      if (overlapEnd - overlapStart < 0.002) continue;
      const relativeStart = overlapStart - clipStart;
      const sourceOffset = Math.max(0, Number(clip.in) || 0) + relativeStart * speed;
      if (sourceOffset >= buffer.duration) continue;
      const availableTimeline = (buffer.duration - sourceOffset) / speed;
      const overlapDuration = Math.min(overlapEnd - overlapStart, availableTimeline);
      if (overlapDuration < 0.002) continue;
      const when = Math.max(0, overlapStart - chunkStart);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speed;
      const gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      const curveLength = Math.max(2, Math.min(128, Math.ceil(overlapDuration * 24) + 1));
      const curve = new Float32Array(curveLength);
      for (let i = 0; i < curveLength; i++) {
        const time = relativeStart + overlapDuration * i / (curveLength - 1);
        curve[i] = exportAudioGain(clip, time);
      }
      try {
        if (overlapDuration > 0.01) gain.gain.setValueCurveAtTime(curve, when, overlapDuration);
        else gain.gain.setValueAtTime(curve[0], when);
        source.start(when, sourceOffset);
        source.stop(Math.min(chunkDuration, when + overlapDuration));
      } catch (error) {
        throw new Error('Audio-rendering mislukt voor "' + clip.name + '": ' + error.message);
      }
    }
    const mixed = await context.startRendering();
    const left = mixed.getChannelData(0), right = mixed.getChannelData(1);
    const interleaved = new Float32Array(chunkSamples * 2);
    for (let i = 0; i < chunkSamples; i++) {
      interleaved[i * 2] = softLimitSample(left[i]);
      interleaved[i * 2 + 1] = softLimitSample(right[i]);
    }
    return new Uint8Array(interleaved.buffer);
  }

  async function streamOfflineAudio(sessionId, entries, totalSamples, onProgress) {
    let startSample = 0;
    let chunkIndex = 0;
    while (startSample < totalSamples) {
      if (state.offlineExportCancel) throw new Error('MP4-export geannuleerd.');
      const chunkSamples = Math.min(OFFLINE_AUDIO_CHUNK_SAMPLES, totalSamples - startSample);
      const bytes = await renderOfflineAudioChunk(entries, startSample, chunkSamples);
      if (state.offlineExportCancel) throw new Error('MP4-export geannuleerd.');
      await window.fluxivora.writeVideoAudio({ sessionId, base64Data: toBase64(bytes) });
      startSample += chunkSamples;
      chunkIndex++;
      onProgress(startSample / totalSamples, chunkIndex);
    }
  }

  async function cancelOfflineMp4() {
    if (!state.offlineExportActive) return;
    state.offlineExportCancel = true;
    $('video-export-cancel').disabled = true;
    setOfflineProgress('Render annuleren…', 'De encoder en tijdelijke uitvoer worden gestopt.', $('video-render-meter').value);
    if (state.offlineSessionId && window.fluxivora?.cancelVideoRender) {
      try { await window.fluxivora.cancelVideoRender({ sessionId: state.offlineSessionId }); } catch (_) {}
    }
  }

  async function exportOfflineMp4() {
    if (state.offlineExportActive || state.exportActive) return;
    if (window.FluxivoraMotionStudio?.hasProxyPreview?.()) {
      notice('Zet Proxy preview uit voordat je exporteert. MP4 gebruikt anders onbedoeld proxykwaliteit.');
      return;
    }
    if (!window.fluxivora?.beginVideoRender || !window.fluxivora?.writeVideoFrame ||
        !window.fluxivora?.writeVideoAudio || !window.fluxivora?.finishVideoRender) {
      notice('Offline MP4-export is beschikbaar in de desktopinstallatie van Fluxivora Studio.');
      return;
    }
    if (!state.clips.length || state.clips.some(clip => clip.missing && clip.type !== 'title')) {
      notice('Koppel alle ontbrekende bronbestanden voordat je exporteert.');
      return;
    }
    const endTime = timelineEnd();
    const frameCount = Math.ceil(endTime * SEQUENCE_FPS);
    if (frameCount < 2) { notice('De montage is te kort om te exporteren.'); return; }
    if (frameCount > 15 * 60 * SEQUENCE_FPS) {
      notice('Deze bèta ondersteunt offline MP4-projecten tot maximaal 15 minuten.');
      return;
    }
    const canvas = $('video-canvas');
    const originalWidth = canvas.width, originalHeight = canvas.height;
    const originalPlayhead = state.playhead;
    const exportSize = $('video-export-size').value;
    const dimensions = exportSize === '720p' ? [1280, 720] : exportSize === '4k' ? [3840, 2160] : [1920, 1080];
    let sessionId = null;
    state.offlineExportActive = true;
    $('video-screen').classList.add('offline-rendering');
    state.offlineExportCancel = false;
    state.offlineSessionId = null;
    stopPlayback();
    $('video-render-meter').value = 0;
    $('video-export-cancel').disabled = false;
    setOfflineProgress('MP4 render voorbereiden', 'Frames: ' + frameCount.toLocaleString('nl-NL') + ' · ' + exportSize + ' · 25 fps', 0);
    updateTransport();
    try {
      const started = await window.fluxivora.beginVideoRender({
        name: state.name, size: exportSize, fps: SEQUENCE_FPS, frameCount
      });
      if (!started || !started.sessionId) {
        notice('MP4-export geannuleerd voordat de render begon.');
        return;
      }
      sessionId = started.sessionId;
      state.offlineSessionId = sessionId;
      const totalSamples = Math.round((frameCount / SEQUENCE_FPS) * 48000);
      setOfflineProgress('Audiotracks voorbereiden', 'Bronaudio wordt gedecodeerd en in tijdlijnvolgorde gemixt.', 0);
      const audio = await prepareOfflineAudio(totalSamples / 48000);
      if (state.offlineExportCancel) throw new Error('MP4-export geannuleerd.');
      let audioProgress = 0, videoProgress = 0;
      const updateCombinedProgress = () => {
        const audioPercent = Math.round(audioProgress * 100);
        const videoPercent = Math.round(videoProgress * 100);
        setOfflineProgress('Offline MP4 renderen',
          'Video ' + videoPercent + '% · audio ' + audioPercent + '%' +
          (audio.skippedVideoAudio ? ' · ' + audio.skippedVideoAudio + ' videobron(nen) zonder decodeerbare audio' : ''),
          audioProgress * 0.20 + videoProgress * 0.75);
      };
      const audioTask = streamOfflineAudio(sessionId, audio.entries, totalSamples, (progress, chunkIndex) => {
        audioProgress = progress;
        if (chunkIndex % 4 === 0 || progress >= 1) updateCombinedProgress();
      });
      let audioError = null;
      audioTask.catch(error => { audioError = error; state.offlineExportCancel = true; });
      canvas.width = dimensions[0];
      canvas.height = dimensions[1];
      for (let index = 0; index < frameCount; index++) {
        if (state.offlineExportCancel) throw audioError || new Error('MP4-export geannuleerd.');
        const time = index / SEQUENCE_FPS;
        await renderTimelineFrame(time);
        const url = canvas.toDataURL('image/jpeg', 0.92);
        const base64Data = url.slice(url.indexOf(',') + 1);
        await window.fluxivora.writeVideoFrame({ sessionId, index, base64Data });
        if (index % SEQUENCE_FPS === 0 || index === frameCount - 1) {
          videoProgress = (index + 1) / frameCount;
          updateCombinedProgress();
        }
      }
      await audioTask;
      if (state.offlineExportCancel) throw audioError || new Error('MP4-export geannuleerd.');
      setOfflineProgress('MP4 encoderen', 'H.264-video en AAC-audio worden samengevoegd.', 0.95);
      const result = await window.fluxivora.finishVideoRender({ sessionId });
      sessionId = null;
      state.offlineSessionId = null;
      setOfflineProgress('MP4 opgeslagen', (result.filePath ? result.filePath.split(/[\\\\/]/).pop() : 'MP4') +
        ' · ' + (result.size / (1024 * 1024)).toFixed(1) + ' MB', 1);
      notice('Offline MP4-export afgerond (H.264 + AAC).');
      if (audio.skippedVideoAudio) {
        notice('Let op: audio uit ' + audio.skippedVideoAudio + ' videobron(nen) kon niet offline worden gedecodeerd; controleer de audiomix.');
      }
    } catch (error) {
      if (sessionId && window.fluxivora?.cancelVideoRender) {
        try { await window.fluxivora.cancelVideoRender({ sessionId }); } catch (_) {}
      }
      if (state.offlineExportCancel || /geannuleerd/i.test(error.message)) notice('Offline MP4-export geannuleerd.');
      else notice('Offline MP4-export mislukt: ' + (error?.message || 'onbekende fout'));
    } finally {
      state.offlineSessionId = null;
      state.offlineExportActive = false;
      $('video-screen').classList.remove('offline-rendering');
      state.offlineExportCancel = false;
      canvas.width = originalWidth || 1920;
      canvas.height = originalHeight || 1080;
      state.playhead = originalPlayhead;
      renderPreview();
      updateTransport();
      $('video-render-progress').classList.add('hidden');
    }
  }

  async function exportRealtimeWebm() {
    if (state.offlineExportActive || state.exportActive) return;

    if (window.FluxivoraMotionStudio?.hasProxyPreview?.()) {
      notice('Zet Proxy preview uit voordat je exporteert. Dan wordt de originele bronkwaliteit gebruikt.');
      return;
    }
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
    const canvasStream = canvas.captureStream(SEQUENCE_FPS);
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
      if (ctxAudio && state.exportDestination) {
        try { state.masterGain.disconnect(state.exportDestination); } catch (_) {}
        state.exportDestination = null;
      }
      if (state.exportChunks.length) {
        const url = URL.createObjectURL(new Blob(state.exportChunks, { type: mime }));
        const link = document.createElement('a'); link.href = url;
        link.download = state.name.replace(/[\\/:*?"<>|]+/g, '_') + '.webm'; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
        notice('Export afgerond als WebM met gemixte audiotracks waar de browser dit ondersteunt.');
      }
      state.exportChunks = [];
      canvas.width = 1920; canvas.height = 1080;
      renderPreview(); updateTransport();
    };
    state.playhead = 0; recorder.start(250);
    startPlayback();
    notice('Export gestart: realtime render, met audio wanneer beschikbaar.');
  }
  function saveSession() {
    const data = {
      format: 'fluxivora-video-project', version: '0.5.0-beta.7', name: state.name,
      sequence: { width: 1920, height: 1080, fps: SEQUENCE_FPS, zoom: state.zoom, markers: state.markers.map(m => ({...m})), lut: state.programLut, multicamGroups: state.multicamGroups.map(g => ({...g, angleAssetIds:[...g.angleAssetIds], offsets:{...g.offsets}})) },
      tracks: state.tracks.map(t => ({...t})),
      assets: state.assets.map(a => ({ id: a.id, name: a.name, type: a.type, duration: a.duration, missing: true, proxyName: a.proxyName || null })),
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
      if (data.format !== 'fluxivora-video-project' || !Array.isArray(data.clips) || data.clips.length > 1000) throw new Error('Dit is geen geldig Fluxivora-video-project.');
      // Migrate the original beta.3 single-track montage format into beta.4 tracks.
      if (!Array.isArray(data.tracks)) {
        data.tracks = [
          { id: 'v2', name: 'V2', kind: 'video', hidden: false, locked: false, muted: false },
          { id: 'v1', name: 'V1', kind: 'video', hidden: false, locked: false, muted: false },
          { id: 'a1', name: 'A1', kind: 'audio', hidden: false, locked: false, muted: false },
          { id: 'a2', name: 'A2', kind: 'audio', hidden: false, locked: false, muted: false },
          { id: 't1', name: 'T1', kind: 'title', hidden: false, locked: false, muted: false }
        ];
        let cursor = 0;
        data.clips = data.clips.map(old => {
          const duration = Math.max(0, Math.min(86400, Number(old.duration) || 0));
          const inPoint = Math.max(0, Math.min(duration, Number(old.inPoint) || 0));
          const outPoint = Math.max(inPoint, Math.min(duration, Number(old.outPoint) || duration));
          const migrated = {
            id: uid(), name: String(old.fileName || old.name || 'Video').slice(0, 512), type: 'video', trackId: 'v1',
            start: cursor, duration, in: inPoint, out: outPoint, speed: 1, volume: 1, opacity: 1,
            scale: 1, x: 0, y: 0, filter: 'normal', fit: 'contain', fadeIn: 0, fadeOut: 0, keyframes: [],
            text: '', fontSize: 72, color: '#ffffff', bold: true, missing: true
          };
          cursor += Math.max(0.1, outPoint - inPoint);
          return migrated;
        });
        notice('Oud montageproject omgezet naar de multi-track tijdlijn.');
      }
      if (data.tracks.length > 24) throw new Error('Het montageproject bevat te veel tracks.');
      stopPlayback();
      state.clips.forEach(c => disposeMedia(c, true));
      state.history.length = 0; state.redo.length = 0;
      state.name = String(data.name || 'Mijn videoproject').slice(0, 100);
      state.programLut = normaliseProgramLut(data.sequence?.lut);
      if (data.sequence?.lut && !state.programLut) notice('De opgeslagen 3D-LUT is ongeldig en is niet geladen.');
      state.multicamGroups = Array.isArray(data.sequence?.multicamGroups) ? data.sequence.multicamGroups.slice(0, 200).filter(g => g && Array.isArray(g.angleAssetIds)).map(g => ({ id: String(g.id || uid('multicam')), name: String(g.name || 'Multicamgroep').slice(0,128), angleAssetIds: [...new Set(g.angleAssetIds.filter(id => typeof id === 'string').map(id=>id.slice(0,256)))].slice(0,32), offsets: Object.fromEntries(Object.entries(g.offsets || {}).filter(([id, value]) => typeof id === 'string' && Number.isFinite(Number(value))).slice(0,32).map(([id,value]) => [id,Math.max(-86400,Math.min(86400,Number(value)))])) })) : [];
      state.assets.forEach(asset => { if (asset.url) URL.revokeObjectURL(asset.url); if (asset.proxyUrl) URL.revokeObjectURL(asset.proxyUrl); });
      state.assets = Array.isArray(data.assets) ? data.assets.slice(0, 2000).filter(a => a && ['video','audio'].includes(a.type)).map(a => ({ id: String(a.id || uid('asset')), name: String(a.name || 'Media').slice(0, 512), type: a.type, duration: Math.max(0, Math.min(86400, Number(a.duration) || 0)), url: null, file: null, missing: true, proxyName: a.proxyName ? String(a.proxyName).slice(0, 512) : null, proxyFile: null, proxyUrl: null, proxyDuration: 0, proxyMissing: !!a.proxyName })) : [];
      if (!Array.isArray(data.assets)) {
        const seenAssets = new Set();
        data.clips.filter(clip => clip && ['video','audio'].includes(clip.type)).forEach(clip => {
          const key = clip.type + ':' + String(clip.name || 'Media').toLowerCase();
          if (seenAssets.has(key)) return;
          seenAssets.add(key);
          state.assets.push({ id: uid('asset'), name: String(clip.name || 'Media').slice(0, 512), type: clip.type, duration: Math.max(0, Number(clip.duration) || 0), url: null, file: null, missing: true });
        });
      }
      state.markers = Array.isArray(data.sequence?.markers) ? data.sequence.markers.slice(0, 500).map(m => ({ id: String(m.id || uid('marker')), time: Math.max(0, Math.min(86400, Number(m.time) || 0)), label: String(m.label || 'Marker').slice(0, 80) })).sort((a, b) => a.time - b.time) : [];
      state.tracks = data.tracks.slice(0, 24).map(t => ({
        id: String(t.id || uid('track')), name: String(t.name || 'Track').slice(0, 12),
        kind: ['video','audio','title'].includes(t.kind) ? t.kind : 'video',
        hidden: !!t.hidden, muted: !!t.muted, locked: !!t.locked
      }));
      if (!state.tracks.length) state.tracks = [{id:'v1',name:'V1',kind:'video',hidden:false,muted:false,locked:false}];
      state.clips = data.clips.map(c => ({
        id: String(c.id || uid()), name: String(c.name || 'Clip').slice(0, 512), assetId: typeof c.assetId === 'string' ? c.assetId.slice(0, 256) : null,
        type: ['video','audio','title'].includes(c.type) ? c.type : 'video',
        shapeType: ['rectangle','ellipse'].includes(c.shapeType) ? c.shapeType : null,
        multicamGroupId: typeof c.multicamGroupId === 'string' ? c.multicamGroupId.slice(0,256) : null,
        activeAngleAssetId: typeof c.activeAngleAssetId === 'string' ? c.activeAngleAssetId.slice(0,256) : null,
        activeAngleIn: Number.isFinite(Number(c.activeAngleIn)) ? Math.max(0,Math.min(86400,Number(c.activeAngleIn))) : null,
        trackId: String(c.trackId || state.tracks[0].id),
        start: Math.max(0, Math.min(86400, Number(c.start) || 0)),
        duration: Math.max(0, Math.min(86400, Number(c.duration) || 0)),
        in: Math.max(0, Number(c.in) || 0), out: Math.max(0, Number(c.out) || 0),
        speed: Math.max(.1, Math.min(4, Number(c.speed) || 1)), volume: Math.max(0, Math.min(2, Number(c.volume) || 0)),
        opacity: Math.max(0, Math.min(1, c.opacity == null ? 1 : Number(c.opacity))),
        scale: Math.max(.1, Math.min(3, Number(c.scale) || 1)),
        x: Math.max(-100, Math.min(100, Number(c.x) || 0)), y: Math.max(-100, Math.min(100, Number(c.y) || 0)),
        filter: String(c.filter || 'normal'), fit: String(c.fit || 'contain'),
        effects: Array.isArray(c.effects) ? c.effects.slice(0, 30).filter(e => e && ['grayscale','sepia','blur','soften','boost','desaturate','invert','hue','brighten','crush'].includes(e.type)).map(e => ({ id: String(e.id || uid('effect')), type: e.type, enabled: e.enabled !== false, amount: Math.max(0, Math.min(100, e.amount == null ? 100 : Number(e.amount))) })) : [],
        colorAdjustments: {
          exposure: Math.max(-2, Math.min(2, Number(c.colorAdjustments?.exposure) || 0)),
          contrast: Math.max(.5, Math.min(2, c.colorAdjustments?.contrast == null ? 1 : Number(c.colorAdjustments.contrast))),
          saturation: Math.max(0, Math.min(2, c.colorAdjustments?.saturation == null ? 1 : Number(c.colorAdjustments.saturation))),
          temperature: Math.max(-100, Math.min(100, Number(c.colorAdjustments?.temperature) || 0)),
          tint: Math.max(-100, Math.min(100, Number(c.colorAdjustments?.tint) || 0))
        },
        keyframeEase: ['linear','easeIn','easeOut','easeInOut','bezier','hold'].includes(c.keyframeEase) ? c.keyframeEase : 'easeInOut',
        fadeIn: Math.max(0, Math.min(10, Number(c.fadeIn) || 0)), fadeOut: Math.max(0, Math.min(10, Number(c.fadeOut) || 0)),
        keyframes: Array.isArray(c.keyframes) ? c.keyframes.slice(0, 200).map(f => ({
          time: Math.max(0, Math.min(86400, Number(f.time) || 0)),
          opacity: Math.max(0, Math.min(1, Number(f.opacity) || 0)),
          scale: Math.max(0.1, Math.min(3, Number(f.scale) || 1)),
          x: Math.max(-100, Math.min(100, Number(f.x) || 0)),
          y: Math.max(-100, Math.min(100, Number(f.y) || 0)),
          volume: Math.max(0, Math.min(2, Number(f.volume) || 0)),
          id: String(f.id || uid('keyframe')),
          outHandle: window.FluxivoraKeyframeCurves?.normaliseHandle(f.outHandle, f) || null,
          inHandle: window.FluxivoraKeyframeCurves?.normaliseHandle(f.inHandle, f) || null,
          ease: ['linear','easeIn','easeOut','easeInOut','bezier','hold'].includes(f.ease) ? f.ease : 'linear'
        })) : [],
        text: String(c.text || '').slice(0, 1000), fontSize: Math.max(18, Math.min(180, Number(c.fontSize) || 72)),
        color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#ffffff', bold: c.bold !== false,
        shapeType: ['rectangle','ellipse'].includes(c.shapeType) ? c.shapeType : null,
        strokeColor: /^#[0-9a-f]{6}$/i.test(c.strokeColor || '') ? c.strokeColor : '#ffffff',
        strokeWidth: Math.max(0, Math.min(30, Number(c.strokeWidth) || 0)),
        maskType: ['none','rectangle','roundRect','ellipse'].includes(c.maskType) ? c.maskType : 'none',
        maskSize: Math.max(10, Math.min(100, Number(c.maskSize) || 90)),
        maskX: Math.max(-50, Math.min(50, Number(c.maskX) || 0)),
        maskY: Math.max(-50, Math.min(50, Number(c.maskY) || 0)),
        maskSecondaryType: ['none','rectangle','roundRect','ellipse'].includes(c.maskSecondaryType) ? c.maskSecondaryType : 'none',
        maskSecondarySize: Math.max(10, Math.min(100, Number(c.maskSecondarySize) || 60)),
        maskSecondaryX: Math.max(-50, Math.min(50, Number(c.maskSecondaryX) || 0)),
        maskSecondaryY: Math.max(-50, Math.min(50, Number(c.maskSecondaryY) || 0)),
        maskOperation: ['add','subtract','intersect','xor'].includes(c.maskOperation) ? c.maskOperation : 'add',
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
      window.dispatchEvent(new Event('fluxivora:session-opened'));
      notice('Montage geopend. Voeg de bronbestanden opnieuw toe om ontbrekende clips te koppelen.');
    } catch (error) { notice('Montage openen mislukt: ' + error.message); }
    finally { $('video-session-file').value = ''; }
  }
  function show(mode = 'video') {
    const motionGraphics = mode === 'motionfx';
    $('welcome-screen').classList.add('hidden'); $('editor-screen').classList.add('hidden'); $('video-screen').classList.remove('hidden');
    document.body.classList.add('video-mode');
    document.body.classList.toggle('motionfx-mode', motionGraphics);
    document.querySelectorAll('.rail-button[data-workspace]').forEach(b => b.classList.toggle('active', b.dataset.workspace === mode));
    $('video-workspace-title').textContent = motionGraphics ? 'Motion Graphics' : 'Motion Studio';
    $('video-workspace-subtitle').textContent = motionGraphics
      ? 'Animatie, compositing en bewegende vormgeving · lokaal'
      : 'Professionele videomontage · offline-first';
    $('video-workspace-glyph').textContent = motionGraphics ? '✧' : '▶';
    $('footer-workspace').textContent = motionGraphics ? 'Motion Graphics' : 'Motion Studio';
    refresh(); renderPreview(); renderMotionLayers();
  }
  function splitSelectedAtPlayhead() {
    const c = selected();
    if (!c) return;
    const relative = state.playhead - c.start;
    if (relative < 0.05 || relative > clipLength(c) - 0.05) {
      notice('Zet de playhead binnen een clip om deze te splitsen.');
      return;
    }
    pushHistory();
    const original = { ...metaClip(c), keyframes: (c.keyframes || []).map(frame => ({...frame})), file: c.file, url: c.url, missing: c.missing };
    const splitSource = c.in + relative * c.speed;
    const rightFrames = original.keyframes.filter(frame => frame.time > relative).map(frame => ({...frame, time: frame.time - relative}));
    c.out = splitSource;
    c.keyframes = original.keyframes.filter(frame => frame.time <= relative);
    const right = {
      ...original, id: uid(), name: original.name + ' (deel 2)', trackId: c.trackId,
      start: state.playhead, in: splitSource, out: original.out, keyframes: rightFrames,
      file: original.file || null, url: original.url || null, mediaEl: null, audioEl: null,
      audioSource: null, audioGain: null, missing: original.missing
    };
    if (right.type !== 'title' && right.url) createMedia(right);
    state.clips.push(right);
    state.selected = right.id; state.playhead = right.start;
    refresh(); renderPreview();
    if (!arguments[0]?.silent) notice('Clip gesplitst op de playhead.');
    return right;
  }
  function removeSelected(ripple = false) {
    const c = selected(); if (!c) return;
    pushHistory();
    const start = c.start, end = c.start + clipLength(c), trackId = c.trackId;
    if (c.mediaEl) c.mediaEl.pause();
    if (c.audioEl) c.audioEl.pause();
    if (ripple) {
      const duration = clipLength(c);
      state.clips.filter(item => item.id !== c.id && item.trackId === trackId && item.start >= end - 0.02).forEach(item => { item.start = Math.max(start, item.start - duration); });
    }
    state.clips = state.clips.filter(item => item.id !== c.id);
    state.selected = null;
    refresh(); renderPreview();
    notice(ripple ? 'Clip verwijderd; volgende clips op deze track zijn naar links geschoven.' : 'Clip uit de montage verwijderd.');
  }
  function snapTime(value, excludingId) {
    if (!state.snap) return Math.max(0, value);
    const candidates = [state.playhead];
    state.clips.filter(c => c.id !== excludingId).forEach(c => { candidates.push(c.start, c.start + clipLength(c)); });
    const nearest = candidates.reduce((best, point) => Math.abs(point - value) < Math.abs(best - value) ? point : best, value);
    return Math.abs(nearest - value) <= 0.16 ? Math.max(0, nearest) : Math.max(0, value);
  }
  function addCrossfade() {
    const c = selected();
    if (!c || !['video', 'audio'].includes(c.type)) { notice('Selecteer eerst een video- of audioclip om een crossfade toe te voegen.'); return; }
    const previous = state.clips.filter(item => item.type === c.type && item.trackId === c.trackId && item.id !== c.id && item.start < c.start && item.start + clipLength(item) >= c.start - 0.15).sort((a, b) => b.start - a.start)[0];
    if (!previous) { notice('Plaats eerst twee aangrenzende clips van hetzelfde type op dezelfde track.'); return; }
    const duration = Math.max(0.15, Math.min(1, clipLength(c) / 2, clipLength(previous) / 2));
    pushHistory();
    c.start = Math.max(previous.start, c.start - duration);
    c.fadeIn = duration;
    previous.fadeOut = duration;
    refresh(); renderPreview();
    notice('Crossfade van ' + duration.toFixed(1) + ' seconden toegevoegd.');
  }
  function addKeyframe() {
    const c = selected();
    if (!c || c.type === 'audio') { notice('Selecteer een video- of titelclip om animatiepunten toe te voegen.'); return; }
    pushHistory();
    const time = Math.max(0, Math.min(clipLength(c), state.playhead - c.start));
    const frame = {
      time, opacity: Number(c.opacity == null ? 1 : c.opacity), scale: Number(c.scale || 1),
      x: Number(c.x || 0), y: Number(c.y || 0), volume: Number(c.volume == null ? 1 : c.volume)
    };
    if (!Array.isArray(c.keyframes)) c.keyframes = [];
    const existing = c.keyframes.findIndex(item => Math.abs(item.time - time) < 0.04);
    if (existing >= 0) {
      const previous = c.keyframes[existing];
      frame.id = previous.id || uid('keyframe');
      frame.outHandle = previous.outHandle ? {...previous.outHandle} : null;
      frame.inHandle = previous.inHandle ? {...previous.inHandle} : null;
      c.keyframes[existing] = frame;
    } else {
      frame.id = uid('keyframe');
      frame.outHandle = null;
      frame.inHandle = null;
      c.keyframes.push(frame);
    }
    frame.ease = ['linear','easeIn','easeOut','easeInOut','bezier','hold'].includes(c.keyframeEase) ? c.keyframeEase : 'easeInOut';
    c.keyframes.sort((a, b) => a.time - b.time);
    refresh(); renderPreview();
    notice('Keyframe opgeslagen (' + frame.ease + ') op ' + tc(time) + ' binnen de clip.');
  }
  function clearKeyframes() {
    const c = selected();
    if (!c || !c.keyframes || !c.keyframes.length) return;
    pushHistory(); c.keyframes = []; refresh(); renderPreview(); notice('Keyframes verwijderd.');
  }
  function wireProperties() {
    $('video-clip-name').addEventListener('change', () => applyProperty('video-clip-name', 'name', v => String(v).slice(0, 512)));
    $('video-clip-start').addEventListener('change', () => {
      const c = selected(); if (!c) return;
      const v = snapTime(Math.max(0, Number($('video-clip-start').value) || 0), c.id);
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
    binding('video-x', 'x', v => Math.max(-100, Math.min(100, Number(v) || 0)));
    binding('video-y', 'y', v => Math.max(-100, Math.min(100, Number(v) || 0)));
    binding('video-filter', 'filter', String);
    binding('video-fit', 'fit', String);
    binding('video-fade-in', 'fadeIn', v => Math.max(0, Math.min(10, Number(v) || 0)));
    binding('video-fade-out', 'fadeOut', v => Math.max(0, Math.min(10, Number(v) || 0)));
    binding('video-title-text', 'text', v => String(v).slice(0, 1000));
    binding('video-title-size', 'fontSize', v => Math.max(18, Math.min(180, Number(v) || 72)));
    binding('video-title-color', 'color', String);
    binding('video-shape-stroke-color', 'strokeColor', v => /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff');
    binding('video-shape-stroke-width', 'strokeWidth', v => Math.max(0, Math.min(30, Number(v) || 0)));
    binding('video-mask-type', 'maskType', v => ['none','rectangle','roundRect','ellipse'].includes(v) ? v : 'none');
    binding('video-mask-size', 'maskSize', v => Math.max(10, Math.min(100, Number(v) || 90)));
    binding('video-mask-x', 'maskX', v => Math.max(-50, Math.min(50, Number(v) || 0)));
    binding('video-mask-y', 'maskY', v => Math.max(-50, Math.min(50, Number(v) || 0)));
    binding('video-mask-secondary', 'maskSecondaryType', v => ['none','rectangle','roundRect','ellipse'].includes(v) ? v : 'none');
    binding('video-mask-secondary-size', 'maskSecondarySize', v => Math.max(10, Math.min(100, Number(v) || 60)));
    binding('video-mask-secondary-x', 'maskSecondaryX', v => Math.max(-50, Math.min(50, Number(v) || 0)));
    binding('video-mask-secondary-y', 'maskSecondaryY', v => Math.max(-50, Math.min(50, Number(v) || 0)));
    binding('video-mask-operation', 'maskOperation', v => ['add','subtract','intersect','xor'].includes(v) ? v : 'add');
  }
  function wire() {
    $('video-import').addEventListener('click', () => $('video-files').click());
    $('video-import-audio').addEventListener('click', () => $('video-audio-files').click());
    $('video-files').addEventListener('change', e => importFiles(e.target.files, 'video'));
    $('video-audio-files').addEventListener('change', e => importFiles(e.target.files, 'audio'));
    $('video-save-session').addEventListener('click', saveSession);
    $('video-open-session').addEventListener('click', () => $('video-session-file').click());
    $('video-session-file').addEventListener('change', e => openSession(e.target.files?.[0]));
    $('video-export').addEventListener('click', exportOfflineMp4);
    $('video-export-webm').addEventListener('click', exportRealtimeWebm);
    $('video-export-cancel').addEventListener('click', cancelOfflineMp4);
    $('motionfx-save-composition').addEventListener('click', saveMotionComposition);
    $('motionfx-export-compositions').addEventListener('click', exportMotionCompositions);
    $('motionfx-import-compositions').addEventListener('click', () => $('motionfx-import-file').click());
    $('motionfx-import-file').addEventListener('change', async event => {
      await importMotionCompositions(event.target.files?.[0]);
      event.target.value = '';
    });
    $('motionfx-composition-list').addEventListener('click', handleMotionCompositionAction);
    $('video-add-title').addEventListener('click', addTitle);
    $('video-add-shape').addEventListener('click', () => addShape('rectangle'));
    $('video-add-ellipse').addEventListener('click', () => addShape('ellipse'));
    $('video-add-marker').addEventListener('click', addMarker);
    $('video-split-clip').addEventListener('click', splitSelectedAtPlayhead);
    $('video-ripple-delete').addEventListener('click', () => removeSelected(true));
    $('video-add-crossfade').addEventListener('click', addCrossfade);
    $('video-add-keyframe').addEventListener('click', addKeyframe);
    $('video-clear-keyframes').addEventListener('click', clearKeyframes);
    $('video-add-track-video').addEventListener('click', () => addTrack('video'));
    $('video-add-track-audio').addEventListener('click', () => addTrack('audio'));
    $('video-add-track-title').addEventListener('click', () => addTrack('title'));
    $('video-play').addEventListener('click', () => state.playing ? stopPlayback() : startPlayback());
    $('video-stop').addEventListener('click', () => { stopPlayback(); seekTo(0); });
    $('video-seek').addEventListener('input', e => seekTo(Number(e.target.value)));
    $('video-zoom').addEventListener('input', e => { state.zoom = Number(e.target.value); renderTracks(); });
    $('video-fit-timeline').addEventListener('click', fitTimeline);
    $('video-snap').addEventListener('click', () => { state.snap = !state.snap; updateTransport(); renderTracks(); });
    $('video-project-name').addEventListener('change', () => { state.name = $('video-project-name').value.trim().slice(0, 100) || 'Mijn videoproject'; $('video-project-name').value = state.name; });
    $('video-undo').addEventListener('click', undo); $('video-redo').addEventListener('click', redo);
    wireProperties();
    window.addEventListener('keydown', e => {
      if (state.offlineExportActive) {
        if (e.key === 'Escape') { e.preventDefault(); cancelOfflineMp4(); }
        return;
      }
      const target = e.target;
      const typing = target && ['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (e.code === 'Space' && !typing && !$('video-screen').classList.contains('hidden')) { e.preventDefault(); state.playing ? stopPlayback() : startPlayback(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !$('video-screen').classList.contains('hidden')) { e.preventDefault(); splitSelectedAtPlayhead(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !$('video-screen').classList.contains('hidden')) { e.preventDefault(); saveSession(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && !$('video-screen').classList.contains('hidden')) { e.preventDefault(); $('video-session-file').click(); }
      else if (!typing && !$('video-screen').classList.contains('hidden') && e.key.toLowerCase() === 'm') { e.preventDefault(); addMarker(); }
      else if (!typing && !$('video-screen').classList.contains('hidden') && e.key.toLowerCase() === 'i') {
        const c = selected();
        if (c && !c.missing && activeAt(c) && c.type !== 'title') {
          e.preventDefault(); const source = currentSourceTime(c);
          if (source < c.out - 0.05) { pushHistory(); c.start = state.playhead; c.in = Math.max(0, Math.min(c.out - 0.1, source)); refresh(); renderPreview(); }
        }
      }
      else if (!typing && !$('video-screen').classList.contains('hidden') && e.key.toLowerCase() === 'o') {
        const c = selected();
        if (c && !c.missing && activeAt(c) && c.type !== 'title') {
          e.preventDefault(); const source = currentSourceTime(c);
          if (source > c.in + 0.05) { pushHistory(); c.out = Math.min(c.duration, source); refresh(); renderPreview(); }
        }
      }
      else if (!typing && !$('video-screen').classList.contains('hidden') && e.key === 'ArrowLeft') { e.preventDefault(); seekTo(state.playhead - 0.04); }
      else if (!typing && !$('video-screen').classList.contains('hidden') && e.key === 'ArrowRight') { e.preventDefault(); seekTo(state.playhead + 0.04); }
      else if (e.key === 'Delete' && !typing && !$('video-screen').classList.contains('hidden')) { removeSelected(e.altKey); }
    });
    document.querySelectorAll('.rail-button[data-workspace]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.workspace === 'video' || b.dataset.workspace === 'motionfx') show(b.dataset.workspace);
      else { $('video-screen').classList.add('hidden'); document.body.classList.remove('video-mode'); document.body.classList.remove('motionfx-mode'); stopPlayback(); }
    }));
    $('motionfx-layer-list')?.addEventListener('click', handleMotionLayerAction);
    window.addEventListener('beforeunload', () => { state.clips.forEach(c => disposeMedia(c, true)); state.assets.forEach(a => { if (a.url) URL.revokeObjectURL(a.url); }); });
  }
  window.FluxivoraMotionStudio = { state, selected, track, createClip, createMedia, pushHistory, refresh, renderPreview, seekTo, stopPlayback, splitSelectedAtPlayhead, notice, uid };
  wire();
  refresh();
})();