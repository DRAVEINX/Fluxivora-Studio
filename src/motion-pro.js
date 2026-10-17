(() => {
  'use strict';
  const api = window.FluxivoraMotionStudio;
  if (!api) return;
  const $ = id => document.getElementById(id);
  const state = api.state;
  let sourceId = null;
  let sourceIn = 0;
  let sourceOut = 0;
  let lastScopePaint = 0;
  const gradeHistory = new Set();
  const effectLabels = {
    grayscale: 'Zwart-wit', sepia: 'Sepia', blur: 'Blur',
    soften: 'Zachte focus', boost: 'Contrast + kleur', desaturate: 'Gedempt kleur'
  };

  function activeSource() {
    return state.assets.find(asset => asset.id === sourceId) || null;
  }

  function findClipForAsset(asset) {
    return state.clips.find(clip => clip.type === asset.type && clip.name.toLowerCase() === asset.name.toLowerCase());
  }

  function registerImportedClip(clipId) {
    const clip = state.clips.find(item => item.id === clipId);
    if (!clip || clip.type === 'title' || !clip.file) return;
    const existingFile = state.assets.find(asset => asset.file === clip.file);
    if (existingFile) return;
    const waiting = state.assets.find(asset => asset.missing && asset.type === clip.type && asset.name.toLowerCase() === clip.name.toLowerCase());
    let asset = waiting;
    if (waiting) {
      waiting.file = clip.file;
      waiting.url = URL.createObjectURL(clip.file);
      waiting.duration = clip.duration;
      waiting.missing = false;
    } else {
      asset = {
        id: api.uid('asset'), name: clip.name, type: clip.type, duration: clip.duration,
        url: URL.createObjectURL(clip.file), file: clip.file, missing: false
      };
      state.assets.push(asset);
    }
    renderMediaBin();
    if (!sourceId && asset) selectSource(asset.id);
  }

  function registerImportedFile(detail) {
    const file = detail && detail.file;
    if (!file || !['video', 'audio'].includes(detail.type)) return;
    if (state.assets.some(asset => asset.file === file)) return;
    const waiting = state.assets.find(asset => asset.missing && asset.type === detail.type && asset.name.toLowerCase() === String(detail.name || file.name).toLowerCase());
    let asset = waiting;
    if (waiting) {
      waiting.file = file;
      waiting.url = URL.createObjectURL(file);
      waiting.duration = Number(detail.duration) || waiting.duration || 0;
      waiting.missing = false;
    } else {
      asset = {
        id: api.uid('asset'), name: String(detail.name || file.name).slice(0, 512),
        type: detail.type, duration: Number(detail.duration) || 0,
        url: URL.createObjectURL(file), file, missing: false
      };
      state.assets.push(asset);
    }
    renderMediaBin();
    if (!sourceId) selectSource(asset.id);
  }

  function activeSourcePlayer() {
    const asset = activeSource();
    if (!asset) return null;
    return asset.type === 'audio' ? $('video-source-audio') : $('video-source-player');
  }

  function updateSourceTransport() {
    const asset = activeSource();
    const player = activeSourcePlayer();
    const duration = Math.max(0.01, Number(player?.duration) || Number(asset?.duration) || 0.01);
    const time = Math.max(0, Number(player?.currentTime) || 0);
    $('video-source-seek').max = String(duration);
    if (document.activeElement !== $('video-source-seek')) $('video-source-seek').value = String(Math.min(time, duration));
    $('video-source-time').textContent = formatTime(time);
    $('video-source-play').textContent = player && !player.paused ? 'Ⅱ Pauzeren' : '▶ Bron afspelen';
    $('video-source-play').disabled = !asset || asset.missing || !asset.url;
  }

  function formatTime(value) {
    const seconds = Math.max(0, Number(value) || 0);
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + (seconds % 60).toFixed(2).padStart(5, '0');
  }

  function toggleSourcePlayback() {
    const player = activeSourcePlayer();
    const asset = activeSource();
    if (!player || !asset || asset.missing || !asset.url) return;
    if (!player.paused) player.pause();
    else {
      if (player.currentTime >= (Number(player.duration) || asset.duration || 0)) player.currentTime = 0;
      const playPromise = player.play();
      if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => api.notice('Deze bron kan niet worden afgespeeld met de beschikbare codec.'));
    }
    updateSourceTransport();
  }

  function selectSource(id) {
    sourceId = id;
    const asset = activeSource();
    const video = $('video-source-player');
    const audio = $('video-source-audio');
    video.pause();
    audio.pause();
    video.hidden = true;
    audio.hidden = true;
    if (!asset || asset.missing || !asset.url) {
      video.removeAttribute('src');
      audio.removeAttribute('src');
      $('video-source-empty').classList.remove('hidden');
      $('video-source-insert').disabled = true;
      $('video-source-mark-in').disabled = true;
      $('video-source-mark-out').disabled = true;
      renderMediaBin();
      return;
    }
    sourceIn = 0;
    sourceOut = Math.max(0.04, Number(asset.duration) || 0.04);
    $('video-source-in').value = sourceIn.toFixed(2);
    $('video-source-out').value = sourceOut.toFixed(2);
    $('video-source-seek').value = '0';
    $('video-source-seek').max = String(Math.max(0.01, sourceOut));
    $('video-source-time').textContent = '00:00.00';
    $('video-source-empty').classList.add('hidden');
    if (asset.type === 'video') {
      audio.removeAttribute('src');
      video.src = asset.url;
      video.hidden = false;
      video.load();
    } else {
      video.removeAttribute('src');
      audio.src = asset.url;
      audio.hidden = false;
      audio.load();
    }
    $('video-source-insert').disabled = false;
    $('video-source-mark-in').disabled = false;
    $('video-source-mark-out').disabled = false;
    setMonitorMode('source');
    renderMediaBin();
  }

  function setMonitorMode(mode) {
    const isSource = mode === 'source';
    const monitor = $('video-monitor');
    monitor.classList.toggle('source-mode', isSource);
    $('video-view-source').classList.toggle('active', isSource);
    $('video-view-program').classList.toggle('active', !isSource);
    $('video-monitor-kicker').textContent = isSource ? 'SOURCE MONITOR' : 'PROGRAM MONITOR';
    $('video-monitor-title').textContent = isSource ? 'Bronmonitor' : 'Programmamonitor';
    $('video-source-controls').classList.toggle('hidden', !isSource);
    if (isSource) {
      $('video-source-player').hidden = !activeSource() || activeSource().type !== 'video' || activeSource().missing;
      $('video-source-audio').hidden = !activeSource() || activeSource().type !== 'audio' || activeSource().missing;
      $('video-source-empty').classList.toggle('hidden', !!(activeSource() && !activeSource().missing && activeSource().url));
    } else {
      $('video-source-player').pause();
      $('video-source-audio').pause();
      $('video-source-player').hidden = true;
      $('video-source-audio').hidden = true;
    }
  }

  function setSourcePoint(which, value) {
    const asset = activeSource();
    if (!asset) return;
    if (which === 'in') {
      sourceIn = Math.max(0, Math.min(sourceOut - 0.04, Number(value) || 0));
      $('video-source-in').value = sourceIn.toFixed(2);
    } else {
      sourceOut = Math.max(sourceIn + 0.04, Math.min(Number(asset.duration) || 86400, Number(value) || Number(asset.duration) || 86400));
      $('video-source-out').value = sourceOut.toFixed(2);
    }
    $('video-source-insert').disabled = !(asset.file && sourceOut > sourceIn && !asset.missing);
  }

  function setMark(which) {
    const asset = activeSource();
    if (!asset) return;
    const player = asset.type === 'audio' ? $('video-source-audio') : $('video-source-player');
    if (which === 'in' && player.currentTime < sourceOut - 0.04) setSourcePoint('in', player.currentTime);
    if (which === 'out' && player.currentTime > sourceIn + 0.04) setSourcePoint('out', player.currentTime);
  }

  function insertSource() {
    const asset = activeSource();
    if (!asset || asset.missing || !asset.file || sourceOut <= sourceIn) {
      api.notice('Koppel eerst het bronbestand en kies een geldig in- en uitpunt.');
      return;
    }
    api.pushHistory();
    const type = asset.type;
    let target = api.track(state.activeTrack);
    if (!target || target.kind !== type) target = state.tracks.find(track => track.kind === type) || null;
    if (!target) {
      api.notice('Maak eerst een passende track voor deze bron.');
      return;
    }
    const clipUrl = URL.createObjectURL(asset.file);
    const clip = api.createClip({
      type, name: asset.name, file: asset.file, url: clipUrl,
      duration: asset.duration, trackId: target.id, start: state.playhead
    });
    clip.in = Math.max(0, Math.min(asset.duration, sourceIn));
    clip.out = Math.max(clip.in + 0.04, Math.min(asset.duration, sourceOut));
    clip.start = Math.max(0, state.playhead);
    clip.missing = false;
    api.refresh();
    api.renderPreview();
    api.notice('Bron ingevoegd op de playhead.');
  }

  function renderMediaBin() {
    const bin = $('video-media');
    if (!bin) return;
    const query = ($('video-bin-search').value || '').trim().toLocaleLowerCase();
    const filter = $('video-bin-filter').value;
    const assets = state.assets.filter(asset => {
      if (filter !== 'all' && asset.type !== filter) return false;
      return !query || asset.name.toLocaleLowerCase().includes(query);
    }).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    bin.replaceChildren();
    $('video-media-empty').classList.toggle('hidden', assets.length > 0);
    if (!assets.length) $('video-media-empty').textContent = query ? 'Geen media gevonden voor deze zoekopdracht.' : 'Importeer video of audio om bronnen hier te bekijken.';
    $('video-count').textContent = state.assets.length + (state.assets.length === 1 ? ' bron' : ' bronnen');
    assets.forEach(asset => {
      const card = document.createElement('article');
      card.className = 'video-media-card' + (asset.id === sourceId ? ' selected' : '') + (asset.missing || !asset.url ? ' missing' : '');
      card.dataset.assetId = asset.id;
      const icon = document.createElement('span');
      icon.className = 'video-media-icon ' + asset.type;
      icon.textContent = asset.type === 'audio' ? '♫' : '▶';
      const details = document.createElement('div');
      details.className = 'video-media-details';
      const title = document.createElement('strong');
      title.textContent = asset.name;
      title.title = asset.name;
      const meta = document.createElement('small');
      meta.textContent = (asset.type === 'audio' ? 'AUDIO' : 'VIDEO') + ' · ' + formatDuration(asset.duration) + (asset.missing || !asset.url ? ' · BRON ONTBREEKT' : '');
      details.append(title, meta);
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.className = 'video-media-open';
      choose.textContent = asset.missing || !asset.url ? 'Bron koppelen' : 'Open in bronmonitor';
      choose.addEventListener('click', () => asset.missing || !asset.url ? relinkAsset(asset.id) : selectSource(asset.id));
      card.append(icon, details, choose);
      bin.append(card);
    });
  }

  function formatDuration(value) {
    const seconds = Math.max(0, Number(value) || 0);
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
  }

  async function relinkAsset(assetId) {
    const asset = state.assets.find(item => item.id === assetId);
    if (!asset) return;
    const input = $('video-relink-files');
    input.accept = asset.type === 'audio' ? 'audio/*' : 'video/*';
    input.dataset.assetId = asset.id;
    input.click();
  }

  function applyRelink(file) {
    const asset = state.assets.find(item => item.id === $('video-relink-files').dataset.assetId);
    if (!asset || !file || (asset.type === 'audio' ? !file.type.startsWith('audio/') : !file.type.startsWith('video/'))) {
      api.notice('Kies een passend bronbestand.');
      return;
    }
    const matches = state.clips.filter(clip => clip.missing && clip.type === asset.type && clip.name.toLowerCase() === asset.name.toLowerCase());
    asset.file = file;
    asset.url = URL.createObjectURL(file);
    asset.duration = asset.duration || 0;
    asset.missing = false;
    if (matches.length) {
      api.pushHistory();
      matches.forEach(clip => {
        clip.url = URL.createObjectURL(file);
        clip.file = file;
        clip.duration = asset.duration || clip.duration;
        clip.in = Math.max(0, Math.min(clip.in, clip.duration));
        clip.out = Math.max(clip.in + 0.04, Math.min(clip.out || clip.duration, clip.duration));
        clip.missing = false;
        api.createMedia(clip);
      });
    }
    if (asset.type === 'video') {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        if (Number.isFinite(probe.duration)) {
          asset.duration = probe.duration;
          matches.forEach(clip => { clip.duration = probe.duration; clip.out = Math.max(clip.in + .04, Math.min(clip.out || probe.duration, probe.duration)); });
          api.refresh();
        }
        probe.removeAttribute('src'); probe.load();
      };
      probe.src = asset.url;
    } else {
      const probe = document.createElement('audio');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        if (Number.isFinite(probe.duration)) {
          asset.duration = probe.duration;
          matches.forEach(clip => { clip.duration = probe.duration; clip.out = Math.max(clip.in + .04, Math.min(clip.out || probe.duration, probe.duration)); });
          api.refresh();
        }
        probe.removeAttribute('src'); probe.load();
      };
      probe.src = asset.url;
    }
    renderMediaBin();
    api.refresh();
    api.renderPreview();
    api.notice('Bronbestand gekoppeld aan bibliotheek en bijpassende clips.');
  }

  function renderEffectStack() {
    const container = $('video-effect-stack');
    const clip = api.selected();
    container.replaceChildren();
    if (!clip || clip.type !== 'video') {
      const empty = document.createElement('p');
      empty.className = 'video-effect-empty';
      empty.textContent = 'Selecteer een videoclip om effecten te stapelen.';
      container.append(empty);
      return;
    }
    clip.effects = Array.isArray(clip.effects) ? clip.effects : [];
    if (!clip.effects.length) {
      const empty = document.createElement('p');
      empty.className = 'video-effect-empty';
      empty.textContent = 'Nog geen losse effecten.';
      container.append(empty);
      return;
    }
    clip.effects.forEach((effect, index) => {
      const row = document.createElement('div');
      row.className = 'video-effect-row' + (effect.enabled === false ? ' disabled' : '');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'video-effect-toggle';
      toggle.textContent = effect.enabled === false ? 'Uit' : 'Aan';
      toggle.setAttribute('aria-pressed', String(effect.enabled !== false));
      toggle.addEventListener('click', () => {
        api.pushHistory();
        effect.enabled = effect.enabled === false;
        api.refresh(); api.renderPreview();
      });
      const name = document.createElement('strong');
      name.textContent = effectLabels[effect.type] || effect.type;
      const moveUp = document.createElement('button');
      moveUp.type = 'button'; moveUp.textContent = '↑'; moveUp.title = 'Effect omhoog';
      moveUp.disabled = index === 0;
      moveUp.addEventListener('click', () => {
        api.pushHistory();
        [clip.effects[index - 1], clip.effects[index]] = [clip.effects[index], clip.effects[index - 1]];
        api.refresh(); api.renderPreview();
      });
      const moveDown = document.createElement('button');
      moveDown.type = 'button'; moveDown.textContent = '↓'; moveDown.title = 'Effect omlaag';
      moveDown.disabled = index === clip.effects.length - 1;
      moveDown.addEventListener('click', () => {
        api.pushHistory();
        [clip.effects[index + 1], clip.effects[index]] = [clip.effects[index], clip.effects[index + 1]];
        api.refresh(); api.renderPreview();
      });
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = '×'; remove.title = 'Effect verwijderen';
      remove.addEventListener('click', () => {
        api.pushHistory();
        clip.effects = clip.effects.filter(item => item.id !== effect.id);
        api.refresh(); api.renderPreview();
      });
      row.append(toggle, name, moveUp, moveDown, remove);
      container.append(row);
    });
  }

  function renderGrades() {
    const clip = api.selected();
    const grade = clip?.colorAdjustments || { exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0 };
    for (const [key, id] of Object.entries({
      exposure: 'video-grade-exposure', contrast: 'video-grade-contrast',
      saturation: 'video-grade-saturation', temperature: 'video-grade-temperature', tint: 'video-grade-tint'
    })) {
      if (document.activeElement !== $(id)) $(id).value = String(grade[key] == null ? (key === 'contrast' || key === 'saturation' ? 1 : 0) : grade[key]);
    }
    $('video-keyframe-easing').value = clip?.keyframeEase || 'easeInOut';
    renderEffectStack();
  }

  function applyGrade(id, key, value) {
    const clip = api.selected();
    if (!clip || clip.type !== 'video') return;
    if (!gradeHistory.has(id)) {
      api.pushHistory();
      gradeHistory.add(id);
    }
    if (!clip.colorAdjustments) clip.colorAdjustments = { exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0 };
    clip.colorAdjustments[key] = Number(value);
    api.renderPreview();
  }

  function paintScopes() {
    const now = performance.now();
    if (now - lastScopePaint < 220) return;
    lastScopePaint = now;
    const source = $('video-canvas');
    if (!source || !source.width || !source.height) return;
    const scratch = document.createElement('canvas');
    scratch.width = 160; scratch.height = 90;
    const sx = scratch.getContext('2d', { willReadFrequently: true });
    if (!sx) return;
    try {
      sx.drawImage(source, 0, 0, scratch.width, scratch.height);
      const image = sx.getImageData(0, 0, scratch.width, scratch.height);
      const bins = 64;
      const hist = [new Array(bins).fill(0), new Array(bins).fill(0), new Array(bins).fill(0)];
      const columns = Array.from({length: scratch.width}, () => ({min: 255, max: 0, sum: 0, n: 0}));
      for (let y = 0; y < scratch.height; y++) {
        for (let x = 0; x < scratch.width; x++) {
          const i = (y * scratch.width + x) * 4;
          const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
          hist[0][Math.min(bins - 1, Math.floor(r / 256 * bins))]++;
          hist[1][Math.min(bins - 1, Math.floor(g / 256 * bins))]++;
          hist[2][Math.min(bins - 1, Math.floor(b / 256 * bins))]++;
          const luma = Math.round(.2126 * r + .7152 * g + .0722 * b);
          const col = columns[x]; col.min = Math.min(col.min, luma); col.max = Math.max(col.max, luma); col.sum += luma; col.n++;
        }
      }
      const histogram = $('video-scope-histogram');
      const hc = histogram.getContext('2d');
      hc.clearRect(0, 0, histogram.width, histogram.height);
      hc.fillStyle = '#0a0d15'; hc.fillRect(0, 0, histogram.width, histogram.height);
      const maxCount = Math.max(1, ...hist.flat());
      const styles = ['#ff7b91', '#74d9a7', '#7daaff'];
      hist.forEach((series, channel) => {
        hc.beginPath(); hc.strokeStyle = styles[channel]; hc.lineWidth = 1.25;
        series.forEach((count, i) => {
          const x = i / (bins - 1) * (histogram.width - 4) + 2;
          const y = histogram.height - 3 - count / maxCount * (histogram.height - 8);
          if (i === 0) hc.moveTo(x, y); else hc.lineTo(x, y);
        });
        hc.stroke();
      });
      const waveform = $('video-scope-waveform');
      const wc = waveform.getContext('2d');
      wc.clearRect(0, 0, waveform.width, waveform.height);
      wc.fillStyle = '#0a0d15'; wc.fillRect(0, 0, waveform.width, waveform.height);
      wc.strokeStyle = '#303851'; wc.lineWidth = 1;
      for (let i = 1; i < 4; i++) { const y = i * waveform.height / 4; wc.beginPath(); wc.moveTo(0, y); wc.lineTo(waveform.width, y); wc.stroke(); }
      columns.forEach((col, x) => {
        const px = x / (columns.length - 1) * (waveform.width - 2) + 1;
        const y1 = waveform.height - 2 - (col.max / 255) * (waveform.height - 4);
        const y2 = waveform.height - 2 - (col.min / 255) * (waveform.height - 4);
        wc.strokeStyle = 'rgba(105,225,205,.85)';
        wc.beginPath(); wc.moveTo(px, y1); wc.lineTo(px, Math.max(y1 + 1, y2)); wc.stroke();
      });
    } catch (_) {
      // Canvas security and unsupported decoder conditions do not block editing.
    }
  }

  $('video-view-program').addEventListener('click', () => setMonitorMode('program'));
  $('video-view-source').addEventListener('click', () => setMonitorMode('source'));
  $('video-source-mark-in').addEventListener('click', () => setMark('in'));
  $('video-source-mark-out').addEventListener('click', () => setMark('out'));
  $('video-source-in').addEventListener('change', event => setSourcePoint('in', event.target.value));
  $('video-source-out').addEventListener('change', event => setSourcePoint('out', event.target.value));
  $('video-source-insert').addEventListener('click', insertSource);
  $('video-source-play').addEventListener('click', toggleSourcePlayback);
  $('video-source-seek').addEventListener('input', event => {
    const player = activeSourcePlayer();
    if (!player) return;
    const next = Math.max(0, Number(event.target.value) || 0);
    try { player.currentTime = next; } catch (_) {}
    updateSourceTransport();
  });
  ['video-source-player','video-source-audio'].forEach(id => {
    const player = $(id);
    ['timeupdate','loadedmetadata','durationchange','play','pause','ended','seeking','seeked'].forEach(type => player.addEventListener(type, updateSourceTransport));
  });
  $('video-bin-search').addEventListener('input', renderMediaBin);
  $('video-bin-filter').addEventListener('change', renderMediaBin);
  $('video-relink-files').addEventListener('change', event => {
    applyRelink(event.target.files?.[0]);
    event.target.value = '';
  });
  $('video-effect-add').addEventListener('click', () => {
    const clip = api.selected();
    if (!clip || clip.type !== 'video') { api.notice('Selecteer eerst een videoclip.'); return; }
    clip.effects = Array.isArray(clip.effects) ? clip.effects : [];
    if (clip.effects.length >= 30) { api.notice('De effectstack bevat maximaal 30 effecten.'); return; }
    api.pushHistory();
    clip.effects.push({ id: api.uid('effect'), type: $('video-effect-type').value, enabled: true });
    api.refresh(); api.renderPreview();
  });
  for (const [key, id] of Object.entries({
    exposure: 'video-grade-exposure', contrast: 'video-grade-contrast',
    saturation: 'video-grade-saturation', temperature: 'video-grade-temperature', tint: 'video-grade-tint'
  })) {
    $(id).addEventListener('input', event => applyGrade(id, key, event.target.value));
    $(id).addEventListener('change', () => gradeHistory.delete(id));
  }
  $('video-keyframe-easing').addEventListener('change', event => {
    const clip = api.selected();
    if (!clip || clip.type === 'audio') return;
    api.pushHistory();
    clip.keyframeEase = event.target.value;
    api.refresh();
  });
  window.addEventListener('fluxivora:asset-imported', event => registerImportedClip(event.detail?.clipId));
  window.addEventListener('fluxivora:session-opened', () => {
    $('video-source-player').pause();
    $('video-source-audio').pause();
    $('video-source-player').removeAttribute('src');
    $('video-source-audio').removeAttribute('src');
    $('video-source-player').load();
    $('video-source-audio').load();
    sourceId = null;
    setMonitorMode('program');
    renderMediaBin();
  });
  window.addEventListener('fluxivora:asset-file-imported', event => registerImportedFile(event.detail));
  window.addEventListener('fluxivora:motion-refresh', () => {
    renderMediaBin();
    renderGrades();
    const selected = api.selected();
    $('video-source-insert').disabled = !(activeSource() && !activeSource().missing && activeSource().file);
    if (selected && activeSource()?.name === selected.name && selected.file && activeSource()?.missing) registerImportedClip(selected.id);
  });
  window.addEventListener('fluxivora:preview-rendered', paintScopes);
  if (!Array.isArray(state.assets)) state.assets = [];
  // Older beta.4 sessions have no independent bin metadata; infer it from available clips.
  state.clips.filter(clip => clip.type !== 'title' && clip.file).forEach(clip => registerImportedClip(clip.id));
  renderMediaBin();
  renderGrades();
  paintScopes();
})();