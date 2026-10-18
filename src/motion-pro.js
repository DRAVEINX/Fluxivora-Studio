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

  let lutRenderer = null;
  let lutTextureRef = null;
  let lutUnsupportedNotified = false;

  function compileGlShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader) || 'WebGL2 shader compilation failed';
      gl.deleteShader(shader);
      throw new Error(error);
    }
    return shader;
  }

  function ensureLutRenderer() {
    if (lutRenderer) return lutRenderer;
    const output = document.createElement('canvas');
    const gl = output.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) return null;
    try {
      const vertex = compileGlShader(gl, gl.VERTEX_SHADER, `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`);
      const fragment = compileGlShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uImage;
uniform sampler3D uLut;
uniform vec3 uDomainMin;
uniform vec3 uDomainMax;
uniform float uSize;
out vec4 outColor;
void main() {
  vec4 source = texture(uImage, vUv);
  vec3 normalized = clamp((source.rgb - uDomainMin) / (uDomainMax - uDomainMin), 0.0, 1.0);
  vec3 coordinate = (normalized * (uSize - 1.0) + 0.5) / uSize;
  vec3 mapped = texture(uLut, coordinate).rgb;
  outColor = vec4(mapped, source.a);
}`);
      const program = gl.createProgram();
      gl.attachShader(program, vertex); gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'WebGL2 LUT link failed');
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      const imageTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, imageTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);
      const cubeTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, cubeTexture);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program, 'uLut'), 1);
      lutRenderer = {
        output, gl, program, imageTexture, cubeTexture,
        domainMin: gl.getUniformLocation(program, 'uDomainMin'),
        domainMax: gl.getUniformLocation(program, 'uDomainMax'),
        size: gl.getUniformLocation(program, 'uSize')
      };
      return lutRenderer;
    } catch (error) {
      try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {}
      return null;
    }
  }

  function uploadLut(renderer, lut) {
    if (lutTextureRef === lut) return;
    const gl = renderer.gl;
    const rgba = new Uint8Array(lut.size * lut.size * lut.size * 4);
    for (let i = 0, j = 0; i < lut.data.length; i += 3, j += 4) {
      rgba[j] = Math.round(Math.max(0, Math.min(1, lut.data[i])) * 255);
      rgba[j + 1] = Math.round(Math.max(0, Math.min(1, lut.data[i + 1])) * 255);
      rgba[j + 2] = Math.round(Math.max(0, Math.min(1, lut.data[i + 2])) * 255);
      rgba[j + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, renderer.cubeTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, lut.size, lut.size, lut.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.uniform3fv(renderer.domainMin, lut.domainMin);
    gl.uniform3fv(renderer.domainMax, lut.domainMax);
    gl.uniform1f(renderer.size, lut.size);
    lutTextureRef = lut;
  }

  function applyProgramLut(canvas) {
    const lut = state.programLut;
    if (!lut || !canvas || !canvas.width || !canvas.height) return;
    const renderer = ensureLutRenderer();
    if (!renderer) {
      if (!lutUnsupportedNotified) {
        api.notice('Deze computer ondersteunt de benodigde WebGL2-LUT-verwerking niet. De LUT blijft in het project bewaard maar wordt niet toegepast.');
        lutUnsupportedNotified = true;
      }
      return;
    }
    const { gl, output } = renderer;
    if (output.width !== canvas.width || output.height !== canvas.height) {
      output.width = canvas.width;
      output.height = canvas.height;
    }
    gl.viewport(0, 0, output.width, output.height);
    gl.useProgram(renderer.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.getParameter(gl.ARRAY_BUFFER_BINDING));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, renderer.imageTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    uploadLut(renderer, lut);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(output, 0, 0, canvas.width, canvas.height);
  }

  async function parseCubeLut(file) {
    if (!file || file.size > 12 * 1024 * 1024) throw new Error('Een .cube-bestand moet kleiner zijn dan 12 MB.');
    const text = await file.text();
    let name = file.name.replace(/\.cube$/i, '').slice(0, 128) || 'Output LUT';
    let size = 0;
    let domainMin = [0, 0, 0], domainMax = [1, 1, 1];
    const values = [];
    for (const original of text.split(/\r?\n/)) {
      const line = original.replace(/#.*$/, '').trim();
      if (!line) continue;
      const title = line.match(/^TITLE\s+(.*)$/i);
      if (title) { name = title[1].trim().replace(/^["']|["']$/g, '').slice(0, 128) || name; continue; }
      const sizeMatch = line.match(/^LUT_3D_SIZE\s+(\d+)$/i);
      if (sizeMatch) { size = Number(sizeMatch[1]); continue; }
      if (/^LUT_1D_SIZE\b/i.test(line)) throw new Error('Dit bestand bevat een 1D-LUT; Motion Studio verwacht een 3D .cube-LUT.');
      const minMatch = line.match(/^DOMAIN_MIN\s+(.+)$/i);
      if (minMatch) { domainMin = parseTriple(minMatch[1], 'DOMAIN_MIN'); continue; }
      const maxMatch = line.match(/^DOMAIN_MAX\s+(.+)$/i);
      if (maxMatch) { domainMax = parseTriple(maxMatch[1], 'DOMAIN_MAX'); continue; }
      if (/^(LUT_3D_INPUT_RANGE|LUT_1D_INPUT_RANGE)\b/i.test(line)) continue;
      const parts = line.split(/[\s,]+/).map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) values.push(...parts);
      else if (/^[+-]?(?:\d|\.)/.test(line)) throw new Error('Ongeldige .cube-regel: ' + line.slice(0, 80));
    }
    if (!Number.isInteger(size) || size < 2 || size > 64) throw new Error('De 3D-LUT-grootte moet tussen 2 en 64 liggen.');
    if (domainMin.some((value, i) => !Number.isFinite(value) || !Number.isFinite(domainMax[i]) || domainMax[i] <= value)) throw new Error('Het .cube-bestand bevat een ongeldig inputbereik.');
    if (values.length !== size * size * size * 3) throw new Error('De .cube-data bevat niet het verwachte aantal kleurwaarden.');
    if (values.some(value => !Number.isFinite(value) || value < -16 || value > 16)) throw new Error('De .cube-data bevat ongeldige kleurwaarden.');
    return { name, size, domainMin, domainMax, data: values };
  }

  function parseTriple(value, label) {
    const triple = value.trim().split(/[\s,]+/).map(Number);
    if (triple.length !== 3 || triple.some(v => !Number.isFinite(v))) throw new Error('Ongeldige ' + label + ' in .cube-bestand.');
    return triple;
  }

  function renderLutControls() {
    const lut = state.programLut;
    $('video-lut-status').textContent = lut ? 'ACTIEF' : 'Geen LUT';
    $('video-lut-name').textContent = lut ? lut.name + ' · ' + lut.size + '³ 3D-LUT' : 'Geen output-LUT actief.';
    $('video-lut-clear').disabled = !lut;
  }

  async function importProgramLut(file) {
    if (!file) return;
    try {
      const lut = await parseCubeLut(file);
      if (!ensureLutRenderer()) throw new Error('WebGL2 is niet beschikbaar op dit systeem; de LUT is niet geladen.');
      api.pushHistory();
      state.programLut = lut;
      lutTextureRef = null;
      renderLutControls();
      api.refresh();
      api.renderPreview();
      api.notice('3D-LUT geladen: ' + lut.name);
    } catch (error) {
      api.notice('LUT importeren mislukt: ' + error.message);
    } finally {
      $('video-lut-file').value = '';
    }
  }

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
    if (existingFile) { clip.assetId = existingFile.id; applyProxyPreview(); return; }
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
    if (asset) clip.assetId = asset.id;
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
      type, name: asset.name, assetId: asset.id, file: asset.file, url: clipUrl,
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

  let selectedProxyAssetId = null;
  let useProxyPreview = false;
  let proxyDirectoryToken = null;
  let proxyBatchRunning = false;
  let proxyCancelRequested = false;
  let activeProxyRequestId = null;
  let proxyStatusOverride = null;
  const PROXY_READ_CHUNK_SIZE = 2 * 1024 * 1024;

  const multicamAngleSelection = new Set();
  const multicamSyncSuggestions = new Map();

  function groupForId(id) {
    return state.multicamGroups.find(group => group.id === id) || null;
  }

  function updateMulticamSelectionControls() {
    const selectedVideos = [...multicamAngleSelection].filter(id => state.assets.some(asset => asset.id === id && asset.type === 'video'));
    $('video-multicam-selection-count').textContent = selectedVideos.length + (selectedVideos.length === 1 ? ' hoek gekozen' : ' hoeken gekozen');
    $('video-multicam-create').disabled = selectedVideos.length < 2;
  }

  function renderMulticamInspector(preferDropdownSelection = false) {
    const clip = api.selected();
    const groupSelect = $('video-multicam-group');
    const angleSelect = $('video-multicam-angle');
    const previousGroup = groupSelect.value;
    const chosenGroup = (preferDropdownSelection ? previousGroup : (clip?.multicamGroupId || previousGroup)) || (state.multicamGroups[0]?.id || '');
    groupSelect.replaceChildren();
    const none = document.createElement('option');
    none.value = ''; none.textContent = 'Geen multicamgroep';
    groupSelect.append(none);
    state.multicamGroups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.id; option.textContent = group.name;
      groupSelect.append(option);
    });
    groupSelect.value = state.multicamGroups.some(group => group.id === chosenGroup) ? chosenGroup : '';
    const group = groupForId(groupSelect.value);
    angleSelect.replaceChildren();
    const ids = group ? group.angleAssetIds : [];
    ids.forEach(assetId => {
      const asset = state.assets.find(item => item.id === assetId);
      const option = document.createElement('option');
      option.value = assetId;
      option.textContent = asset ? asset.name + (asset.url && !asset.missing ? '' : ' · bron koppelen') : 'Ontbrekende bron';
      angleSelect.append(option);
    });
    if (!ids.length) {
      const option = document.createElement('option');
      option.value = ''; option.textContent = 'Geen hoek beschikbaar';
      angleSelect.append(option);
    }
    angleSelect.value = ids.includes(clip?.activeAngleAssetId) ? clip.activeAngleAssetId : (ids[0] || '');
    angleSelect.disabled = !group || ids.length < 2 || !clip || clip.type !== 'video';
    $('video-multicam-attach').disabled = !clip || clip.type !== 'video' || !group;
    $('video-multicam-cut').disabled = !clip || clip.type !== 'video' || !group || ids.length < 2 || !angleSelect.value;
  }

  async function analyzeMulticamGroup(group) {
    if (!window.FluxivoraMulticamSync || typeof window.FluxivoraMulticamSync.createRmsEnvelope !== 'function') {
      api.notice('De golfvormmodule is niet beschikbaar. Herlaad Fluxivora Studio en probeer opnieuw.');
      return;
    }
    const assets = group.angleAssetIds.map(id => state.assets.find(asset => asset.id === id));
    if (assets.length < 2 || assets.some(asset => !asset || !asset.file || asset.missing)) {
      api.notice('Koppel eerst alle videobronnen opnieuw. Synchronisatieanalyse gebruikt momenteel alleen lokaal beschikbare bestanden.');
      return;
    }
    if (assets.some(asset => Number(asset.file.size) > 300 * 1024 * 1024)) {
      api.notice('Een bestand is groter dan 300 MB. Gebruik voorlopig kortere mediabestanden om geheugenproblemen te voorkomen.');
      return;
    }
    const button = $('video-multicam-sync-' + group.id);
    const status = $('video-multicam-sync-status-' + group.id);
    if (button) { button.disabled = true; button.textContent = 'Audio analyseren…'; }
    if (status) status.textContent = 'Lokale analyse voorbereiden…';
    let audioContext;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Deze browser ondersteunt geen lokale audioanalyse.');
      audioContext = new AudioContextClass();
      const decoded = [];
      for (let index = 0; index < assets.length; index++) {
        if (status) status.textContent = 'Bron ' + (index + 1) + ' van ' + assets.length + ' analyseren…';
        let envelope, duration;
        if (typeof window.fluxivora?.analyzeMulticamAudioForFile === 'function') {
          // Electron's bundled FFmpeg handles video containers that Web Audio may not decode.
          const result = await window.fluxivora.analyzeMulticamAudioForFile(assets[index].file);
          if (!result || typeof result.pcmBase64 !== 'string' || result.pcmBase64.length > 540000) {
            throw new Error('De audioanalyse gaf geen geldige, begrensde PCM-data terug.');
          }
          const binary = atob(result.pcmBase64);
          const bytes = new Uint8Array(binary.length);
          for (let byteIndex = 0; byteIndex < binary.length; byteIndex++) bytes[byteIndex] = binary.charCodeAt(byteIndex);
          if (bytes.byteLength < 1600 || bytes.byteLength % 2 !== 0) throw new Error('Deze video bevat geen bruikbare audiotrack.');
          const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
          const normalized = new Float32Array(pcm.length);
          for (let sampleIndex = 0; sampleIndex < pcm.length; sampleIndex++) normalized[sampleIndex] = pcm[sampleIndex] / 32768;
          envelope = window.FluxivoraMulticamSync.createRmsEnvelope([normalized], { frameSize: 100, maxSamples: 12000 });
          duration = pcm.length / Number(result.sampleRate || 1000);
        } else {
          const buffer = await assets[index].file.arrayBuffer();
          const audio = await audioContext.decodeAudioData(buffer.slice(0));
          const channels = [];
          for (let channel = 0; channel < audio.numberOfChannels; channel++) channels.push(audio.getChannelData(channel));
          const frameSize = Math.max(64, Math.min(65536, Math.round(audio.sampleRate / 10)));
          envelope = window.FluxivoraMulticamSync.createRmsEnvelope(channels, { frameSize, maxSamples: 12000 });
          duration = audio.duration;
        }
        const envelopeRate = envelope.length / duration;
        decoded.push({ asset: assets[index], envelope, sampleRate: envelopeRate, duration });
      }
      const reference = decoded[0];
      const suggestions = [];
      const comparisonRate = 10;
      const comparisonSeconds = 180;
      const toComparisonEnvelope = source => {
        const count = Math.min(Math.floor(source.duration * comparisonRate), comparisonSeconds * comparisonRate);
        if (count < 8) throw new Error('Een bron moet minstens 0,8 seconde audio bevatten.');
        const output = [];
        for (let index = 0; index < count; index++) {
          const position = Math.min(source.envelope.length - 1, index * source.sampleRate / comparisonRate);
          const left = Math.floor(position);
          const right = Math.min(source.envelope.length - 1, left + 1);
          const fraction = position - left;
          output.push(source.envelope[left] * (1 - fraction) + source.envelope[right] * fraction);
        }
        return output;
      };
      const refEnvelope = toComparisonEnvelope(reference);
      for (const candidate of decoded.slice(1)) {
        const candEnvelope = toComparisonEnvelope(candidate);
        const maxLagSamples = 150;
        const result = window.FluxivoraMulticamSync.estimateWaveformOffset(refEnvelope, candEnvelope, {
          sampleRate: comparisonRate, maxLagSamples, minConfidence: 0.25, minOverlapRatio: 0.5
        });
        suggestions.push({ assetId: candidate.asset.id, assetName: candidate.asset.name, ...result });
      }
      const sourceSignatures = Object.fromEntries(decoded.map(item => [item.asset.id, {
        name: String(item.asset.file && item.asset.file.name || ''),
        size: Number(item.asset.file && item.asset.file.size || 0),
        lastModified: Number(item.asset.file && item.asset.file.lastModified || 0)
      }]));
      multicamSyncSuggestions.set(group.id, { referenceAssetId: reference.asset.id, sourceSignatures, suggestions, createdAt: Date.now() });
      renderMulticamGroups();
      const accepted = suggestions.filter(item => item.accepted).length;
      api.notice('Analyse voltooid: ' + accepted + ' van ' + suggestions.length + ' offsets hebben voldoende vertrouwen. Controleer de voorstellen vóór toepassing.');
    } catch (error) {
      if (status) status.textContent = 'Analyse mislukt: ' + (error && error.message ? error.message : 'onbekende fout');
      api.notice('Audioanalyse kon niet worden uitgevoerd. Controleer of de bestanden een ondersteund audiokanaal bevatten.');
    } finally {
      if (audioContext && typeof audioContext.close === 'function') {
        try { await audioContext.close(); } catch (_) {}
      }
      const currentButton = $('video-multicam-sync-' + group.id);
      if (currentButton) { currentButton.disabled = false; currentButton.textContent = 'Analyseer audio-sync'; }
    }
  }

  function applyMulticamSyncSuggestions(group) {
    const preview = multicamSyncSuggestions.get(group.id);
    if (!preview || !Array.isArray(preview.suggestions)) {
      api.notice('Voer eerst een audioanalyse uit.');
      return;
    }
    const currentAngleIds = new Set(group.angleAssetIds || []);
    const sourceStillMatches = assetId => {
      const expected = preview.sourceSignatures && preview.sourceSignatures[assetId];
      const asset = state.assets.find(item => item.id === assetId && item.type === 'video' && item.file && !item.missing);
      return Boolean(expected && asset &&
        String(asset.file.name || '') === expected.name &&
        Number(asset.file.size || 0) === expected.size &&
        Number(asset.file.lastModified || 0) === expected.lastModified);
    };
    if (!currentAngleIds.has(preview.referenceAssetId) || !sourceStillMatches(preview.referenceAssetId)) {
      multicamSyncSuggestions.delete(group.id);
      api.notice('De bron van deze analyse is gewijzigd of niet meer beschikbaar. Voer de analyse opnieuw uit.');
      renderMulticamGroups();
      return;
    }
    const accepted = preview.suggestions.filter(item =>
      item.accepted &&
      Number.isFinite(item.offsetSeconds) &&
      item.assetId !== preview.referenceAssetId &&
      currentAngleIds.has(item.assetId) &&
      sourceStillMatches(item.assetId)
    );
    if (!accepted.length) {
      api.notice('Er zijn geen actuele, betrouwbare offsets om toe te passen. Stel de synchronisatie handmatig in of voer de analyse opnieuw uit.');
      return;
    }
    api.pushHistory();
    if (!group.offsets) group.offsets = {};
    accepted.forEach(item => { group.offsets[item.assetId] = clamp(item.offsetSeconds, -86400, 86400); });
    api.refresh();
    renderMulticamGroups();
    api.notice(accepted.length + ' actuele offset(s) toegepast. Niet meer gekoppelde hoeken zijn overgeslagen.');
  }

  function renderMulticamGroups() {
    const host = $('video-multicam-groups');
    if (!host) return;
    host.replaceChildren();
    state.multicamGroups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'video-multicam-group-card';
      const heading = document.createElement('div');
      heading.className = 'video-multicam-group-card-heading';
      const title = document.createElement('strong');
      title.textContent = group.name;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = '×'; remove.title = 'Multicamgroep verwijderen';
      remove.addEventListener('click', () => {
        api.pushHistory();
        state.multicamGroups = state.multicamGroups.filter(item => item.id !== group.id);
        state.clips.forEach(clip => {
          if (clip.multicamGroupId === group.id) {
            clip.multicamGroupId = null;
            clip.activeAngleAssetId = null;
            clip.activeAngleIn = null;
          }
        });
        applyProxyPreview();
        api.refresh(); api.renderPreview();
        api.notice('Multicamgroep verwijderd; clips en bronbestanden blijven behouden.');
      });
      heading.append(title, remove);
      card.append(heading);
      const hint = document.createElement('small');
      hint.textContent = 'Bron-offset bij tijdlijn 00:00 (s)';
      card.append(hint);
      const syncButton = document.createElement('button');
      syncButton.type = 'button';
      syncButton.id = 'video-multicam-sync-' + group.id;
      syncButton.className = 'button subtle compact';
      syncButton.textContent = 'Analyseer audio-sync';
      syncButton.addEventListener('click', () => analyzeMulticamGroup(group));
      card.append(syncButton);
      const syncStatus = document.createElement('small');
      syncStatus.id = 'video-multicam-sync-status-' + group.id;
      syncStatus.textContent = 'Analyseert lokaal waar mogelijk; voorgestelde offsets worden niet automatisch toegepast.';
      card.append(syncStatus);
      const syncPreview = multicamSyncSuggestions.get(group.id);
      if (syncPreview) {
        const summary = document.createElement('div');
        summary.className = 'video-multicam-sync-results';
        const referenceAsset = state.assets.find(item => item.id === syncPreview.referenceAssetId);
        const summaryHeading = document.createElement('strong');
        summaryHeading.textContent = 'Referentie: ' + (referenceAsset ? referenceAsset.name : 'onbekende bron');
        summary.append(summaryHeading);
        syncPreview.suggestions.forEach(item => {
          const line = document.createElement('p');
          const seconds = Number(item.offsetSeconds);
          line.textContent = item.assetName + ': ' + (item.accepted && Number.isFinite(seconds) ? (seconds >= 0 ? '+' : '') + seconds.toFixed(3) + ' s · vertrouwen ' + Math.round(item.confidence * 100) + '%' : 'geen betrouwbaar voorstel (' + item.reason + ')');
          summary.append(line);
        });
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'button primary compact';
        apply.textContent = 'Betrouwbare offsets toepassen';
        apply.addEventListener('click', () => applyMulticamSyncSuggestions(group));
        summary.append(apply);
        card.append(summary);
      }
      group.angleAssetIds.forEach(assetId => {
        const asset = state.assets.find(item => item.id === assetId);
        const row = document.createElement('label');
        row.className = 'video-multicam-offset-row';
        const name = document.createElement('span');
        name.textContent = asset ? asset.name : 'Ontbrekende bron';
        name.title = name.textContent;
        const input = document.createElement('input');
        input.type = 'number'; input.min = '-86400'; input.max = '86400'; input.step = '0.04';
        input.value = String(Number(group.offsets?.[assetId]) || 0);
        input.setAttribute('aria-label', 'Bron-offset ' + name.textContent);
        input.addEventListener('change', () => {
          const value = Number(input.value);
          if (!Number.isFinite(value)) { input.value = String(Number(group.offsets?.[assetId]) || 0); return; }
          api.pushHistory();
          if (!group.offsets) group.offsets = {};
          group.offsets[assetId] = clamp(value, -86400, 86400);
          api.refresh();
        });
        row.append(name, input);
        card.append(row);
      });
      host.append(card);
    });
    renderMulticamInspector();
    updateMulticamSelectionControls();
  }

  function createMulticamGroup() {
    const angleAssetIds = [...multicamAngleSelection].filter(id => state.assets.some(asset => asset.id === id && asset.type === 'video'));
    if (angleAssetIds.length < 2) { api.notice('Kies minstens twee videobronnen als multicam-hoeken.'); return; }
    if (angleAssetIds.length > 32) { api.notice('Een multicamgroep ondersteunt maximaal 32 hoeken. Verminder de selectie.'); return; }
    if (state.multicamGroups.length >= 200) { api.notice('Er zijn maximaal 200 multicamgroepen toegestaan per project.'); return; }
    api.pushHistory();
    const group = {
      id: api.uid('multicam'), name: (() => { let n = 1; while (state.multicamGroups.some(item => item.name === 'Multicam ' + n)) n++; return 'Multicam ' + n; })(),
      angleAssetIds: angleAssetIds.slice(0, 32),
      offsets: Object.fromEntries(angleAssetIds.slice(0, 32).map(id => [id, 0])),
      syncMode: 'manual-offset'
    };
    state.multicamGroups.push(group);
    multicamAngleSelection.clear();
    api.refresh();
    renderMulticamGroups();
    $('video-multicam-group').value = group.id;
    renderMulticamInspector(true);
    api.notice('Multicamgroep gemaakt. Stel per hoek de bron-offset in om de synchronisatie te bepalen.');
  }

  function attachMulticamGroup() {
    const clip = api.selected();
    const group = groupForId($('video-multicam-group').value);
    if (!clip || clip.type !== 'video' || !group) { api.notice('Selecteer een videoclip en multicamgroep.'); return; }
    api.pushHistory();
    clip.multicamGroupId = group.id;
    if (!group.angleAssetIds.includes(clip.activeAngleAssetId)) {
      clip.activeAngleAssetId = null;
      clip.activeAngleIn = null;
    }
    api.refresh();
    api.notice('Multicamgroep gekoppeld. Kies een hoek en maak een cut op de playhead.');
  }

  function clipLengthForMulticam(clip) {
    return Math.max(0, Number(clip.out || 0) - Number(clip.in || 0)) / Math.max(0.1, Math.min(4, Number(clip.speed) || 1));
  }

  function cutToMulticamAngle() {
    const clip = api.selected();
    const group = groupForId($('video-multicam-group').value);
    const asset = state.assets.find(item => item.id === $('video-multicam-angle').value);
    if (!clip || clip.type !== 'video' || !group || !asset || !group.angleAssetIds.includes(asset.id)) {
      api.notice('Selecteer een videoclip, multicamgroep en camerahoek.');
      return;
    }
    if (!asset.url || asset.missing) { relinkAsset(asset.id); return; }
    const elapsed = state.playhead - clip.start;
    const clipLength = clipLengthForMulticam(clip);
    if (elapsed < 0.05 || elapsed > clipLength - 0.05) {
      api.notice('Zet de playhead binnen de geselecteerde videoclip om een hoekwissel te maken.');
      return;
    }
    const speed = Math.max(0.1, Math.min(4, Number(clip.speed) || 1));
    const offset = Number(group.offsets?.[asset.id]) || 0;
    const angleIn = offset + state.playhead * speed;
    const remainingSource = (clipLength - elapsed) * speed;
    if (angleIn < 0 || angleIn + remainingSource > Number(asset.duration) + 0.02) {
      api.notice('De gekozen hoek bevat niet genoeg bronmateriaal. Pas de sync-offset aan of koppel een langere bron.');
      return;
    }
    clip.multicamGroupId = group.id;
    const right = api.splitSelectedAtPlayhead({ silent: true });
    if (!right) return;
    right.multicamGroupId = group.id;
    right.activeAngleAssetId = asset.id;
    right.activeAngleIn = angleIn;
    applyProxyPreview();
    api.refresh(); api.renderPreview();
    api.notice('Multicam-cut naar ' + asset.name + '. De bestaande audio blijft behouden.');
  }

  function findAssetForClip(clip) {
    return state.assets.find(asset => clip.assetId && asset.id === clip.assetId) ||
      state.assets.find(asset => asset.file && clip.file && asset.file === clip.file) ||
      state.assets.find(asset => asset.type === clip.type && asset.name.toLocaleLowerCase() === String(clip.name || '').toLocaleLowerCase()) || null;
  }

  function updateProxyControls() {
    const assetsWithProxy = state.assets.filter(asset => asset.type === 'video' && asset.proxyUrl && !asset.proxyMissing);
    const checkbox = $('video-proxy-preview');
    checkbox.disabled = assetsWithProxy.length === 0;
    checkbox.checked = useProxyPreview;
    const missingCount = state.assets.filter(asset => asset.type === 'video' && asset.file && !asset.missing && !(asset.proxyUrl && !asset.proxyMissing)).length;
    $('video-proxy-batch').disabled = proxyBatchRunning || missingCount === 0;
    $('video-proxy-batch').textContent = missingCount ? 'Genereer ontbrekende proxies (' + missingCount + ')' : 'Alle proxies gekoppeld';
    if (proxyStatusOverride) $('video-proxy-status').textContent = proxyStatusOverride;
    else $('video-proxy-status').textContent = assetsWithProxy.length
      ? assetsWithProxy.length + (assetsWithProxy.length === 1 ? ' proxy gekoppeld' : ' proxies gekoppeld') + (useProxyPreview ? ' · voorbeeld gebruikt proxy-media' : ' · voorbeeld gebruikt originelen')
      : (state.assets.some(asset => asset.proxyName) ? 'Koppel proxybestanden opnieuw na het openen van dit project.' : 'Koppel een proxy of genereer lichtere previewbestanden voor je videobronnen.');
  }

  function applyProxyPreview() {
    let linked = 0;
    let switched = false;
    for (const clip of state.clips) {
      if (clip.type !== 'video' || !clip.mediaEl || clip.missing) continue;
      const asset = findAssetForClip(clip);
      const angleAsset = clip.activeAngleAssetId ? state.assets.find(item => item.id === clip.activeAngleAssetId && item.url && !item.missing) : null;
      const sourceAsset = angleAsset || asset;
      const proxy = useProxyPreview && sourceAsset && sourceAsset.proxyUrl && !sourceAsset.proxyMissing ? sourceAsset.proxyUrl : null;
      if (proxy) linked++;
      const target = proxy || (angleAsset ? angleAsset.url : clip.url);
      if (!target || clip.mediaEl.dataset.fluxivoraActiveSource === target) continue;
      const media = clip.mediaEl;
      const currentTime = Number(media.currentTime) || 0;
      const wasPlaying = !media.paused;
      switched = true;
      media.pause();
      media.src = target;
      media.dataset.fluxivoraActiveSource = target;
      media.load();
      media.addEventListener('loadedmetadata', () => {
        const elapsed = Math.max(0, state.playhead - clip.start) * Math.max(0.1, Math.min(4, Number(clip.speed) || 1));
        const desiredTime = angleAsset && Number.isFinite(Number(clip.activeAngleIn)) ? Number(clip.activeAngleIn) + elapsed : currentTime;
        try { media.currentTime = Math.max(0, Math.min(Number.isFinite(media.duration) ? media.duration : desiredTime, desiredTime)); } catch (_) {}
        if (wasPlaying && state.playing) media.play().catch(() => {});
        api.renderPreview();
      }, { once: true });
    }
    updateProxyControls();
    if (switched) api.renderPreview();
    return linked;
  }

  function relinkKnownProxyFiles(files) {
    const candidates = [...(files || [])].filter(file => file && file.type && file.type.startsWith('video/'));
    if (!candidates.length) {
      api.notice('Selecteer een of meer videobestanden om als proxy te koppelen.');
      return;
    }
    const normalize = value => String(value || '').trim().toLocaleLowerCase();
    const assetsByProxyName = new Map();
    const candidateCounts = new Map();
    for (const file of candidates) {
      const key = normalize(file.name);
      candidateCounts.set(key, (candidateCounts.get(key) || 0) + 1);
    }
    state.assets.filter(asset => asset.type === 'video' && asset.proxyName).forEach(asset => {
      const key = normalize(asset.proxyName);
      if (!assetsByProxyName.has(key)) assetsByProxyName.set(key, []);
      assetsByProxyName.get(key).push(asset);
    });
    let linked = 0;
    let unmatched = 0;
    let ambiguous = 0;
    const claimedAssetIds = new Set();
    for (const file of candidates) {
      const key = normalize(file.name);
      const matches = assetsByProxyName.get(key) || [];
      // Never guess which file is correct when the user selected duplicate names.
      if (candidateCounts.get(key) > 1) {
        ambiguous++;
        continue;
      }
      if (matches.length === 1 && !claimedAssetIds.has(matches[0].id)) {
        linkProxyFile(file, matches[0].id, { silent: true });
        claimedAssetIds.add(matches[0].id);
        linked++;
      } else if (matches.length > 1 || (matches.length === 1 && claimedAssetIds.has(matches[0].id))) {
        ambiguous++;
      } else {
        unmatched++;
      }
    }
    if (linked) {
      api.notice(linked + (linked === 1 ? ' proxy opnieuw gekoppeld' : ' proxies opnieuw gekoppeld') +
        (unmatched ? ' · ' + unmatched + ' niet herkend' : '') +
        (ambiguous ? ' · ' + ambiguous + ' dubbelzinnige bestandsnamen overgeslagen' : '') + '.');
    } else {
      api.notice('Geen proxy automatisch gekoppeld. Bestandsnamen moeten exact overeenkomen met de opgeslagen proxynaam.' +
        (ambiguous ? ' ' + ambiguous + ' naamconflicten gevonden.' : ''));
    }
  }

  async function linkProxyFile(file, assetId = selectedProxyAssetId, options = {}) {
    const asset = state.assets.find(item => item.id === assetId);
    if (!asset || asset.type !== 'video' || !file || !file.type.startsWith('video/')) {
      api.notice('Kies een videobestand als proxy.');
      return;
    }
    if (asset.proxyUrl) URL.revokeObjectURL(asset.proxyUrl);
    asset.proxyFile = file;
    asset.proxyUrl = URL.createObjectURL(file);
    asset.proxyName = file.name;
    asset.proxyMissing = false;
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      asset.proxyDuration = Number.isFinite(probe.duration) ? probe.duration : 0;
      if (asset.duration && asset.proxyDuration && Math.abs(asset.duration - asset.proxyDuration) > Math.max(1, asset.duration * 0.03)) {
        api.notice('Let op: de proxyduur verschilt van de originele bron. Controleer de synchronisatie.');
      }
      probe.removeAttribute('src'); probe.load();
    };
    probe.onerror = () => {
      if (asset.proxyUrl) URL.revokeObjectURL(asset.proxyUrl);
      asset.proxyUrl = null;
      asset.proxyFile = null;
      asset.proxyName = null;
      asset.proxyMissing = false;
      if (useProxyPreview && !state.assets.some(item => item.type === 'video' && item.proxyUrl && !item.proxyMissing)) {
        useProxyPreview = false;
        $('video-proxy-preview').checked = false;
        applyProxyPreview();
      }
      renderMediaBin();
      api.notice('De proxy kon niet worden gelezen: ' + file.name);
    };
    probe.src = asset.proxyUrl;
    selectedProxyAssetId = null;
    renderMediaBin();
    if (useProxyPreview) applyProxyPreview();
    if (!options.silent) api.notice('Proxy gekoppeld: ' + file.name);
    $('video-proxy-file').value = '';
  }

  function setProxyJobStatus(text, progress = null) {
    proxyStatusOverride = text || null;
    $('video-proxy-status').textContent = proxyStatusOverride || '';
    $('video-proxy-progress').hidden = progress == null;
    if (progress != null) $('video-proxy-progress').value = Math.max(0, Math.min(100, Number(progress) || 0));
    $('video-proxy-cancel').classList.toggle('hidden', !proxyBatchRunning);
    $('video-proxy-batch').disabled = proxyBatchRunning;
    if (!proxyBatchRunning) $('video-proxy-cancel').classList.add('hidden');
  }

  async function ensureProxyDirectory() {
    if (proxyDirectoryToken) return proxyDirectoryToken;
    if (!window.fluxivora?.chooseVideoProxyDirectory) {
      throw new Error('Automatische proxygeneratie is alleen beschikbaar in de geïnstalleerde Fluxivora-desktopapp.');
    }
    const chosen = await window.fluxivora.chooseVideoProxyDirectory();
    if (!chosen?.token) return null;
    proxyDirectoryToken = chosen.token;
    return proxyDirectoryToken;
  }

  function decodeBase64Chunk(base64Data) {
    if (typeof base64Data !== 'string' || !base64Data.length) throw new Error('De gegenereerde proxy bevat een lege gegevenschunk.');
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function readGeneratedProxy(result) {
    if (!window.fluxivora?.readVideoProxyChunk || !result?.readToken ||
        !Number.isSafeInteger(result.size) || result.size < 1024 || result.size > 350 * 1024 * 1024) {
      throw new Error('De gegenereerde proxy heeft een ongeldige grootte of leessessie.');
    }
    const chunks = [];
    let offset = 0;
    let calls = 0;
    try {
      while (offset < result.size) {
        if (proxyCancelRequested) throw new Error('Proxy-generatie is geannuleerd.');
        if (++calls > Math.ceil(result.size / PROXY_READ_CHUNK_SIZE) + 2) {
          throw new Error('De proxy is niet volledig gelezen; het chunkbudget is overschreden.');
        }
        const part = await window.fluxivora.readVideoProxyChunk({ readToken: result.readToken, offset });
        if (!part || part.totalBytes !== result.size || !Number.isInteger(part.bytesRead) ||
            part.bytesRead < 1 || part.bytesRead > result.size - offset) {
          throw new Error('De proxy-leesstream is ongeldig of onvolledig.');
        }
        const bytes = decodeBase64Chunk(part.base64Data);
        if (bytes.byteLength !== part.bytesRead) throw new Error('De proxy-chunkgrootte komt niet overeen.');
        chunks.push(bytes);
        offset += part.bytesRead;
        if (proxyBatchRunning) {
          const fraction = offset / result.size;
          setProxyJobStatus('Proxy laden voor preview: ' + Math.round(fraction * 100) + '%', fraction * 100);
        }
      }
      if (offset !== result.size) throw new Error('De proxy is niet volledig gelezen.');
      return new File(chunks, result.name || 'Fluxivora-proxy.mp4', { type: 'video/mp4', lastModified: Date.now() });
    } finally {
      try { await window.fluxivora.releaseVideoProxyRead({ readToken: result.readToken }); } catch (_) {}
    }
  }

  async function generateProxyForAsset(asset, index, total, directoryToken, preset) {
    if (!asset || asset.type !== 'video' || asset.missing || !asset.file) {
      throw new Error('Deze videobron ontbreekt of is niet meer aan een lokaal bestand gekoppeld.');
    }
    if (!window.fluxivora?.createVideoProxyForFile) {
      throw new Error('Automatische proxygeneratie is alleen beschikbaar in de geïnstalleerde Fluxivora-desktopapp.');
    }
    const requestId = api.uid('proxyjob');
    activeProxyRequestId = requestId;
    setProxyJobStatus((index + 1) + '/' + total + ' · Proxy maken: ' + asset.name, 0);
    try {
      const result = await window.fluxivora.createVideoProxyForFile(asset.file, {
        requestId,
        preset,
        sourceName: asset.name,
        durationSeconds: Number(asset.duration) || 0,
        directoryToken
      });
      if (!result) return false;
      if (proxyCancelRequested) {
        try { await window.fluxivora.releaseVideoProxyRead({ readToken: result.readToken }); } catch (_) {}
        return false;
      }
      setProxyJobStatus((index + 1) + '/' + total + ' · Proxy lezen: ' + result.name, 100);
      const proxyFile = await readGeneratedProxy(result);
      if (proxyCancelRequested) return false;
      await linkProxyFile(proxyFile, asset.id);
      api.notice('Proxy gemaakt en gekoppeld: ' + result.name);
      return true;
    } finally {
      if (activeProxyRequestId === requestId) activeProxyRequestId = null;
    }
  }

  async function runProxyGeneration(requestedAssets = null) {
    if (proxyBatchRunning) return;
    const allCandidates = state.assets.filter(asset =>
      asset.type === 'video' && asset.file && !asset.missing && !(asset.proxyUrl && !asset.proxyMissing)
    );
    const wanted = requestedAssets
      ? requestedAssets.filter(asset => asset && asset.type === 'video' && asset.file && !asset.missing)
      : allCandidates;
    const candidates = [...new Map(wanted.map(asset => [asset.id, asset])).values()];
    if (!candidates.length) {
      api.notice('Er zijn geen gekoppelde videobronnen die een proxy nodig hebben.');
      return;
    }
    let directoryToken;
    try {
      directoryToken = await ensureProxyDirectory();
    } catch (error) {
      api.notice('Proxygeneratie niet gestart: ' + error.message);
      return;
    }
    if (!directoryToken) return;
    proxyBatchRunning = true;
    proxyCancelRequested = false;
    $('video-proxy-cancel').classList.remove('hidden');
    $('video-proxy-batch').disabled = true;
    const preset = $('video-proxy-preset').value === '720p' ? '720p' : '540p';
    let succeeded = 0;
    let wasCancelled = false;
    const failures = [];
    try {
      for (let index = 0; index < candidates.length; index++) {
        if (proxyCancelRequested) break;
        const asset = candidates[index];
        try {
          const ok = await generateProxyForAsset(asset, index, candidates.length, directoryToken, preset);
          if (ok) succeeded++;
          else if (proxyCancelRequested) break;
        } catch (error) {
          if (proxyCancelRequested || /geannuleerd/i.test(error.message || '')) break;
          failures.push(asset.name + ': ' + (error?.message || 'onbekende fout'));
          setProxyJobStatus((index + 1) + '/' + candidates.length + ' · Mislukt: ' + asset.name, 0);
        }
      }
    } finally {
      wasCancelled = proxyCancelRequested;
      proxyBatchRunning = false;
      activeProxyRequestId = null;
      $('video-proxy-cancel').classList.add('hidden');
      $('video-proxy-progress').hidden = true;
      proxyCancelRequested = false;
      proxyStatusOverride = null;
      renderMediaBin();
    }
    const message = (succeeded ? succeeded + (succeeded === 1 ? ' proxy gemaakt' : ' proxies gemaakt') : 'Geen proxy voltooid') +
      (wasCancelled ? ' · geannuleerd' : '') +
      (failures.length ? ' · ' + failures.length + ' mislukt' : '') + '.';
    if (failures.length) {
      const first = failures.slice(0, 2).join(' | ');
      api.notice(message + ' ' + first);
    } else {
      api.notice(message);
    }
  }

  async function cancelProxyGeneration() {
    if (!proxyBatchRunning) return;
    proxyCancelRequested = true;
    setProxyJobStatus('Annuleren… huidige proxy wordt gestopt.', null);
    if (activeProxyRequestId && window.fluxivora?.cancelVideoProxy) {
      try { await window.fluxivora.cancelVideoProxy({ requestId: activeProxyRequestId }); } catch (_) {}
    }
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
      meta.textContent = (asset.type === 'audio' ? 'AUDIO' : 'VIDEO') + ' · ' + formatDuration(asset.duration) + (asset.missing || !asset.url ? ' · BRON ONTBREEKT' : '') + (asset.proxyUrl && !asset.proxyMissing ? ' · PROXY' : asset.proxyName ? ' · PROXY ONTBREEKT' : '');
      details.append(title, meta);
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.className = 'video-media-open';
      choose.textContent = asset.missing || !asset.url ? 'Bron koppelen' : 'Open in bronmonitor';
      choose.addEventListener('click', () => asset.missing || !asset.url ? relinkAsset(asset.id) : selectSource(asset.id));
      card.append(icon, details, choose);
      if (asset.type === 'video') {
        const angleLabel = document.createElement('label');
        angleLabel.className = 'video-media-angle-select';
        const angleCheck = document.createElement('input');
        angleCheck.type = 'checkbox';
        angleCheck.checked = multicamAngleSelection.has(asset.id);
        angleCheck.setAttribute('aria-label', 'Selecteer ' + asset.name + ' als multicam-hoek');
        angleCheck.addEventListener('change', () => {
          if (angleCheck.checked) multicamAngleSelection.add(asset.id);
          else multicamAngleSelection.delete(asset.id);
          updateMulticamSelectionControls();
        });
        const angleText = document.createElement('span');
        angleText.textContent = 'Multicam-hoek';
        angleLabel.append(angleCheck, angleText);
        card.append(angleLabel);
        const proxy = document.createElement('button');
        proxy.type = 'button';
        proxy.className = 'video-media-proxy';
        proxy.textContent = asset.proxyUrl && !asset.proxyMissing ? 'Proxy gekoppeld · aanpassen' : asset.proxyName ? 'Proxy opnieuw koppelen' : 'Koppel proxybestand';
        proxy.title = asset.proxyName || 'Koppel een vooraf gegenereerd, lager-resolutie videobestand aan deze originele bron';
        proxy.addEventListener('click', () => {
          selectedProxyAssetId = asset.id;
          $('video-proxy-file').click();
        });
        card.append(proxy);
        const generate = document.createElement('button');
        generate.type = 'button';
        generate.className = 'video-media-proxy-generate';
        generate.textContent = asset.proxyUrl && !asset.proxyMissing ? 'Proxy opnieuw genereren' : 'Genereer proxy';
        generate.disabled = proxyBatchRunning || asset.missing || !asset.file;
        generate.title = 'Maak een lagere-resolutie H.264-proxy met de lokale FFmpeg-encoder';
        generate.addEventListener('click', () => runProxyGeneration([asset]));
        card.append(generate);
      }
      bin.append(card);
    });
    updateProxyControls();
    updateMulticamSelectionControls();
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
    const matches = state.clips.filter(clip => clip.missing && clip.type === asset.type && (clip.assetId ? clip.assetId === asset.id : clip.name.toLowerCase() === asset.name.toLowerCase()));
    asset.file = file;
    asset.url = URL.createObjectURL(file);
    asset.duration = asset.duration || 0;
    asset.missing = false;
    if (matches.length) {
      api.pushHistory();
      matches.forEach(clip => {
        clip.url = URL.createObjectURL(file);
        clip.file = file;
        clip.assetId = asset.id;
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

  let lastCurvePaint = 0;
  let draggedCurveFrame = null;
  const curveLimits = {
    opacity: [0, 1], scale: [0.1, 3], x: [-100, 100], y: [-100, 100], volume: [0, 2]
  };
  const curveNames = { opacity: 'Dekking', scale: 'Schaal', x: 'X-positie', y: 'Y-positie', volume: 'Volume' };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const curveEase = {
    linear: value => value,
    easeIn: value => value * value,
    easeOut: value => 1 - Math.pow(1 - value, 2),
    easeInOut: value => value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2,
    hold: () => 0
  };

  function curveDuration(clip) {
    return Math.max(0.04, Math.max(0, Number(clip.out || 0) - Number(clip.in || 0)) / Math.max(0.1, Math.min(4, Number(clip.speed) || 1)));
  }

  function curveValueAt(frames, property, time, fallback) {
    if (!frames.length) return fallback;
    if (time <= frames[0].time) return Number(frames[0][property]) || 0;
    if (time >= frames[frames.length - 1].time) return Number(frames[frames.length - 1][property]) || 0;
    for (let i = 1; i < frames.length; i++) {
      const left = frames[i - 1], right = frames[i];
      if (time <= right.time) {
        const span = Math.max(0.0001, right.time - left.time);
        const amount = clamp((time - left.time) / span, 0, 1);
        if (right.ease === 'bezier' && window.FluxivoraKeyframeCurves) {
          return window.FluxivoraKeyframeCurves.bezierValue(left, right, property, amount);
        }
        const ease = curveEase[right.ease] || curveEase.linear;
        const t = ease(amount);
        return (Number(left[property]) || 0) + ((Number(right[property]) || 0) - (Number(left[property]) || 0)) * t;
      }
    }
    return fallback;
  }

  function renderCurveEditor(force) {
    const canvas = $('video-curve-canvas');
    if (!canvas) return;
    const now = performance.now();
    if (!force && now - lastCurvePaint < 90) return;
    lastCurvePaint = now;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width, height = canvas.height;
    const pad = { left: 34, right: 12, top: 12, bottom: 22 };
    const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#090c15'; ctx.fillRect(0, 0, width, height);
    const clip = api.selected();
    const property = $('video-curve-property').value;
    const limits = curveLimits[property] || [0, 1];
    const toX = time => pad.left + clamp(time / durationForCurve, 0, 1) * plotW;
    const toY = value => pad.top + (1 - (clamp(value, limits[0], limits[1]) - limits[0]) / (limits[1] - limits[0])) * plotH;
    ctx.strokeStyle = '#252d43'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + i * plotH / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = pad.left + i * plotW / 4;
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, height - pad.bottom); ctx.stroke();
    }
    ctx.font = '10px Segoe UI, sans-serif'; ctx.fillStyle = '#7d88a6'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [limits[1], (limits[0] + limits[1]) / 2, limits[0]].forEach((value, i) => {
      const ys = [pad.top, pad.top + plotH / 2, pad.top + plotH];
      ctx.fillText(Number(value.toFixed(2)).toString(), pad.left - 6, ys[i]);
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('0s', pad.left, height - 5);
    ctx.textAlign = 'right'; ctx.fillText(durationForCurve.toFixed(1) + 's', width - pad.right, height - 5);
    if (!clip || clip.type === 'audio' || clip.type === 'title' && property === 'volume') {
      ctx.fillStyle = '#7a849f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Selecteer een video- of titelclip met keyframes.', width / 2, height / 2);
      return;
    }
    const baseValue = Number(clip[property]) || 0;
    const frames = Array.isArray(clip.keyframes) ? clip.keyframes.filter(frame => Number.isFinite(frame.time) && Number.isFinite(frame[property])).slice().sort((a,b)=>a.time-b.time) : [];
    if (!frames.length) {
      ctx.strokeStyle = '#7166c7'; ctx.lineWidth = 2; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(pad.left, toY(baseValue)); ctx.lineTo(width - pad.right, toY(baseValue)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#7a849f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Nog geen keyframes voor deze curve.', width / 2, Math.min(height - pad.bottom - 12, toY(baseValue) + 17));
    } else {
      ctx.beginPath(); ctx.strokeStyle = '#9b8cff'; ctx.lineWidth = 2;
      for (let i = 0; i <= plotW; i += 2) {
        const time = i / plotW * durationForCurve;
        const value = curveValueAt(frames, property, time, baseValue);
        const x = pad.left + i, y = toY(value);
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (window.FluxivoraKeyframeCurves) {
        for (let i = 1; i < frames.length; i++) {
          const left = frames[i - 1], right = frames[i];
          if (right.ease !== 'bezier') continue;
          const controls = window.FluxivoraKeyframeCurves.controlPoints(left, right, property);
          const x0 = toX(left.time), y0 = toY(left[property]);
          const x1 = toX(controls.x1), y1 = toY(controls.y1);
          const x2 = toX(controls.x2), y2 = toY(controls.y2);
          const x3 = toX(right.time), y3 = toY(right[property]);
          ctx.strokeStyle = '#6c7197'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.moveTo(x3, y3); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = '#6de1cd'; ctx.strokeStyle = '#183f48'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x1, y1, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#f6b7d5'; ctx.strokeStyle = '#543247';
          ctx.beginPath(); ctx.arc(x2, y2, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      frames.forEach(frame => {
        const x = toX(frame.time), y = toY(frame[property]);
        ctx.beginPath(); ctx.fillStyle = '#d6d0ff'; ctx.strokeStyle = '#6c5fd2'; ctx.lineWidth = 2;
        ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    }
    const playheadX = toX(Math.max(0, state.playhead - clip.start));
    ctx.strokeStyle = 'rgba(106,225,205,.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(playheadX, pad.top); ctx.lineTo(playheadX, height - pad.bottom); ctx.stroke();
  }
  let durationForCurve = 1;

  function curvePointerPosition(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * canvas.width, y: (event.clientY - rect.top) / rect.height * canvas.height };
  }

  function wireCurveEditor() {
    const canvas = $('video-curve-canvas');
    canvas.addEventListener('pointerdown', event => {
      const clip = api.selected();
      if (!clip || clip.type === 'audio') return;
      const position = curvePointerPosition(event, canvas);
      const property = $('video-curve-property').value;
      durationForCurve = curveDuration(clip);
      const plot = { left: 34, right: 12, top: 12, bottom: 22 };
      const plotW = canvas.width - plot.left - plot.right, plotH = canvas.height - plot.top - plot.bottom;
      const limits = curveLimits[property];
      const frames = Array.isArray(clip.keyframes) ? clip.keyframes.slice().sort((a,b)=>a.time-b.time) : [];
      let nearestHandle = null, handleDistance = 13;
      if (window.FluxivoraKeyframeCurves) {
        for (let i = 1; i < frames.length; i++) {
          const left = frames[i - 1], right = frames[i];
          if (right.ease !== 'bezier') continue;
          const controls = window.FluxivoraKeyframeCurves.controlPoints(left, right, property);
          const points = [
            { frame: left, other: right, side: 'out', x: plot.left + clamp(controls.x1 / durationForCurve, 0, 1) * plotW, y: plot.top + (1 - (clamp(controls.y1, limits[0], limits[1]) - limits[0]) / (limits[1] - limits[0])) * plotH },
            { frame: right, other: left, side: 'in', x: plot.left + clamp(controls.x2 / durationForCurve, 0, 1) * plotW, y: plot.top + (1 - (clamp(controls.y2, limits[0], limits[1]) - limits[0]) / (limits[1] - limits[0])) * plotH }
          ];
          points.forEach(point => {
            const distance = Math.hypot(point.x - position.x, point.y - position.y);
            if (distance < handleDistance) { nearestHandle = point; handleDistance = distance; }
          });
        }
      }
      if (nearestHandle) {
        event.preventDefault();
        api.pushHistory();
        draggedCurveFrame = {
          kind: 'handle', clip, frame: nearestHandle.frame, other: nearestHandle.other,
          side: nearestHandle.side, property, limits, plot, plotW, plotH, duration: durationForCurve
        };
        canvas.setPointerCapture?.(event.pointerId);
        return;
      }
      let nearest = null, distance = 14;
      frames.forEach(frame => {
        if (!Number.isFinite(frame.time) || !Number.isFinite(frame[property])) return;
        const x = plot.left + clamp(frame.time / durationForCurve, 0, 1) * plotW;
        const y = plot.top + (1 - (clamp(frame[property], limits[0], limits[1]) - limits[0]) / (limits[1] - limits[0])) * plotH;
        const d = Math.hypot(x - position.x, y - position.y);
        if (d < distance) { nearest = frame; distance = d; }
      });
      if (!nearest) return;
      event.preventDefault();
      api.pushHistory();
      draggedCurveFrame = { kind: 'point', clip, frame: nearest, property, limits, plot, plotW, plotH, duration: durationForCurve };
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!draggedCurveFrame) return;
      const drag = draggedCurveFrame;
      const point = curvePointerPosition(event, canvas);
      const x = clamp((point.x - drag.plot.left) / drag.plotW, 0, 1);
      const y = clamp((point.y - drag.plot.top) / drag.plotH, 0, 1);
      const value = drag.limits[0] + (1 - y) * (drag.limits[1] - drag.limits[0]);
      if (drag.kind === 'point') {
        drag.frame.time = x * drag.duration;
        drag.frame[drag.property] = value;
        drag.clip.keyframes.sort((a,b)=>a.time-b.time);
      } else {
        const frame = drag.frame, other = drag.other;
        if (drag.side === 'out') {
          const span = Math.max(0.0001, other.time - frame.time);
          const fraction = clamp((x * drag.duration - frame.time) / span, 0.02, 0.48);
          frame.outHandle = frame.outHandle && typeof frame.outHandle === 'object' ? frame.outHandle : {};
          frame.outHandle.time = fraction;
          frame.outHandle[drag.property] = value - frame[drag.property];
        } else {
          const span = Math.max(0.0001, frame.time - other.time);
          const fraction = clamp((frame.time - x * drag.duration) / span, 0.02, 0.48);
          frame.inHandle = frame.inHandle && typeof frame.inHandle === 'object' ? frame.inHandle : {};
          frame.inHandle.time = fraction;
          frame.inHandle[drag.property] = value - frame[drag.property];
        }
      }
      event.preventDefault();
      api.renderPreview();
      renderCurveEditor(true);
    });
    const finish = () => {
      if (!draggedCurveFrame) return;
      draggedCurveFrame = null;
      api.refresh();
      renderCurveEditor(true);
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    $('video-curve-property').addEventListener('change', () => renderCurveEditor(true));
    $('video-add-keyframe').addEventListener('click', () => window.setTimeout(() => renderCurveEditor(true), 0));
    $('video-clear-keyframes').addEventListener('click', () => window.setTimeout(() => renderCurveEditor(true), 0));
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
    durationForCurve = clip ? curveDuration(clip) : 1;
    renderEffectStack();
    renderCurveEditor(true);
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

  wireCurveEditor();
  api.applyProgramLut = applyProgramLut;
  api.hasProxyPreview = () => useProxyPreview;
  $('video-lut-load').addEventListener('click', () => $('video-lut-file').click());
  $('video-lut-file').addEventListener('change', event => importProgramLut(event.target.files?.[0]));
  $('video-lut-clear').addEventListener('click', () => {
    if (!state.programLut) return;
    api.pushHistory();
    state.programLut = null;
    lutTextureRef = null;
    renderLutControls();
    api.refresh();
    api.renderPreview();
    api.notice('Output-LUT verwijderd.');
  });

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
  $('video-multicam-create').addEventListener('click', createMulticamGroup);
  $('video-multicam-group').addEventListener('change', () => renderMulticamInspector(true));
  $('video-multicam-attach').addEventListener('click', attachMulticamGroup);
  $('video-multicam-cut').addEventListener('click', cutToMulticamAngle);
  $('video-proxy-file').addEventListener('change', event => {
    linkProxyFile(event.target.files?.[0]);
    event.target.value = '';
  });
  $('video-proxy-relink-all').addEventListener('click', () => $('video-proxy-relink-files').click());
  $('video-proxy-relink-files').addEventListener('change', event => {
    relinkKnownProxyFiles(event.target.files);
    event.target.value = '';
  });
  $('video-proxy-batch').addEventListener('click', () => runProxyGeneration());
  $('video-proxy-cancel').addEventListener('click', cancelProxyGeneration);
  window.fluxivora?.onVideoProxyProgress?.(payload => {
    if (!proxyBatchRunning || payload?.requestId !== activeProxyRequestId) return;
    const pct = Math.max(0, Math.min(100, Number(payload.progress) || 0));
    const time = Number(payload.outTimeSeconds) || 0;
    setProxyJobStatus('Proxy maken… ' + Math.round(pct) + '%' + (time ? ' · ' + formatDuration(time) : ''), pct);
  });
  $('video-proxy-preview').addEventListener('change', event => {
    useProxyPreview = event.target.checked;
    if (useProxyPreview && !state.assets.some(asset => asset.type === 'video' && asset.proxyUrl && !asset.proxyMissing)) {
      useProxyPreview = false;
      event.target.checked = false;
      api.notice('Koppel eerst een proxybestand aan een videobron.');
      return;
    }
    applyProxyPreview();
    renderMediaBin();
    if (useProxyPreview) api.notice('Proxy preview staat aan. Schakel deze uit voor export met originele media.');
    else api.notice('Originele videobronnen worden gebruikt in de preview.');
  });
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
    useProxyPreview = false;
    selectedProxyAssetId = null;
    $('video-proxy-preview').checked = false;
    $('video-source-player').pause();
    $('video-source-audio').pause();
    $('video-source-player').removeAttribute('src');
    $('video-source-audio').removeAttribute('src');
    $('video-source-player').load();
    $('video-source-audio').load();
    sourceId = null;
    multicamAngleSelection.clear();
    setMonitorMode('program');
    renderMediaBin();
    renderMulticamGroups();
  });
  window.addEventListener('fluxivora:asset-file-imported', event => registerImportedFile(event.detail));
  window.addEventListener('fluxivora:motion-refresh', () => {
    applyProxyPreview();
    renderMediaBin();
    renderMulticamGroups();
    renderLutControls();
    renderGrades();
    const selected = api.selected();
    $('video-source-insert').disabled = !(activeSource() && !activeSource().missing && activeSource().file);
    if (selected && activeSource()?.name === selected.name && selected.file && activeSource()?.missing) registerImportedClip(selected.id);
  });
  window.addEventListener('fluxivora:preview-rendered', () => { paintScopes(); renderCurveEditor(false); });
  if (!Array.isArray(state.assets)) state.assets = [];
  window.addEventListener('beforeunload', () => state.assets.forEach(asset => { if (asset.proxyUrl) URL.revokeObjectURL(asset.proxyUrl); }));
  // Older beta.4 sessions have no independent bin metadata; infer it from available clips.
  state.clips.filter(clip => clip.type !== 'title' && clip.file).forEach(clip => registerImportedClip(clip.id));
  renderMediaBin();
  renderMulticamGroups();
  renderLutControls();
  renderGrades();
  paintScopes();
})();