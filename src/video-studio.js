(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { clips: [], selected: null, active: null, playing: false, time: 0, name: 'Mijn videoproject' };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clip = () => state.clips.find(item => item.id === state.selected);
  const length = item => Math.max(0, item.out - item.in);
  const total = () => state.clips.reduce((sum, item) => sum + length(item), 0);
  const tc = value => {
    const n = Math.max(0, Number(value) || 0);
    const p = x => String(x).padStart(2, '0');
    return p(Math.floor(n / 60)) + ':' + p(Math.floor(n % 60)) + ':' + p(Math.floor(n % 1 * 25));
  };
  function notice(message) {
    const item = document.createElement('div');
    item.className = 'toast'; item.textContent = message;
    $('toast-stack').append(item); window.setTimeout(() => item.remove(), 3500);
  }
  function refresh() {
    let start = 0;
    state.clips.forEach(item => { item.start = start; start += length(item); });
    const chosen = clip();
    $('video-count').textContent = state.clips.length + ' clips';
    $('video-duration').textContent = tc(total());
    $('video-current').textContent = tc(state.time);
    $('video-seek').max = String(Math.max(.01, total()));
    $('video-seek').value = String(Math.min(total(), state.time));
    $('video-export').disabled = !state.clips.length || state.clips.some(item => item.missing);
    $('video-selected').textContent = chosen ? chosen.name : 'Selecteer een clip';
    $('video-in').disabled = $('video-out').disabled = !chosen || chosen.missing;
    $('video-in').value = chosen ? chosen.in.toFixed(2) : '';
    $('video-out').value = chosen ? chosen.out.toFixed(2) : '';
    $('video-left').disabled = !chosen || state.clips.indexOf(chosen) <= 0;
    $('video-right').disabled = !chosen || state.clips.indexOf(chosen) >= state.clips.length - 1;
    $('video-remove').disabled = !chosen;
    $('video-play').textContent = state.playing ? 'Ⅱ' : '▶';
    $('video-media').replaceChildren();
    $('video-timeline').replaceChildren();
    state.clips.forEach(item => {
      const make = timeline => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'video-clip' + (item.id === state.selected ? ' selected' : '');
        const title = document.createElement('strong'); title.textContent = item.name;
        const range = document.createElement('small'); range.textContent = tc(item.in) + ' – ' + tc(item.out);
        button.append(title, range);
        button.addEventListener('click', () => select(item.id));
        if (timeline) {
          button.draggable = !item.missing;
          button.style.width = Math.max(100, Math.min(420, length(item) * 35)) + 'px';
          button.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', item.id));
          button.addEventListener('dragover', e => e.preventDefault());
          button.addEventListener('drop', e => { e.preventDefault(); reorder(e.dataTransfer.getData('text/plain'), item.id); });
        } else button.style.width = '100%';
        return button;
      };
      $('video-media').append(make(false)); $('video-timeline').append(make(true));
    });
  }
  function select(id, at = null, autoplay = false) {
    const item = state.clips.find(c => c.id === id); if (!item) return;
    state.selected = id; state.time = item.start + Math.max(0, (at ?? item.in) - item.in);
    const video = $('video-preview');
    if (!item.url) { video.pause(); video.removeAttribute('src'); video.load(); $('video-empty').classList.remove('hidden'); refresh(); return; }
    $('video-empty').classList.add('hidden');
    const ready = () => {
      video.currentTime = at ?? item.in;
      if (autoplay) { state.playing = true; video.play().catch(() => { state.playing = false; refresh(); }); }
      refresh();
    };
    if (state.active !== id) {
      video.pause(); state.active = id;
      video.addEventListener('loadedmetadata', ready, { once: true }); video.src = item.url; video.load();
    } else ready();
    refresh();
  }
  function reorder(fromId, toId) {
    if (!fromId || fromId === toId) return;
    const from = state.clips.findIndex(c => c.id === fromId), to = state.clips.findIndex(c => c.id === toId);
    if (from < 0 || to < 0) return;
    const [item] = state.clips.splice(from, 1); state.clips.splice(to, 0, item);
    refresh(); if (state.selected) select(state.selected);
  }
  function importFiles(fileList) {
    for (const file of [...fileList]) {
      if (!file.type.startsWith('video/')) { notice('Kies een videobestand.'); continue; }
      const missing = state.clips.find(c => c.missing && c.name === file.name);
      const url = URL.createObjectURL(file);
      if (missing) {
        missing.url = url; missing.file = file; missing.missing = false;
        const probe = document.createElement('video');
        probe.onloadedmetadata = () => { missing.duration = probe.duration || 0; missing.out = Math.min(missing.out || missing.duration, missing.duration); refresh(); probe.removeAttribute('src'); probe.load(); };
        probe.src = url; continue;
      }
      const item = { id: uid(), name: file.name, file, url, duration: 0, in: 0, out: 0, start: 0, missing: false };
      state.clips.push(item);
      const probe = document.createElement('video'); probe.preload = 'metadata';
      probe.onloadedmetadata = () => { item.duration = probe.duration || 0; item.out = item.duration; refresh(); if (!state.selected) select(item.id); probe.removeAttribute('src'); probe.load(); };
      probe.onerror = () => { item.missing = true; item.url = null; URL.revokeObjectURL(url); refresh(); notice('Video kon niet worden gelezen: ' + file.name); };
      probe.src = url;
    }
    $('video-files').value = ''; refresh();
  }
  function trim(edge) {
    const item = clip(); if (!item || item.missing) return;
    const value = Number($(edge === 'in' ? 'video-in' : 'video-out').value);
    if (!Number.isFinite(value)) return;
    if (edge === 'in') item.in = Math.max(0, Math.min(item.out - .1, value));
    else item.out = Math.max(item.in + .1, Math.min(item.duration, value));
    select(item.id, item.in); refresh();
  }
  function saveSession() {
    const data = { format: 'fluxivora-video-project', name: state.name, clips: state.clips.map(c => ({ name: c.name, duration: c.duration, in: c.in, out: c.out })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = state.name + '.fluxivora-video.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    notice('Montage-instellingen opgeslagen. Bewaar de originele videobestanden ook.');
  }
  async function openSession(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== 'fluxivora-video-project' || !Array.isArray(data.clips) || data.clips.length > 500) throw new Error('Ongeldig montagebestand');
      state.clips.forEach(c => { if (c.url) URL.revokeObjectURL(c.url); });
      state.clips = data.clips.map(c => ({ id: uid(), name: String(c.name || 'Video').slice(0, 512), duration: Number(c.duration) || 0, in: Math.max(0, Number(c.in) || 0), out: Math.max(0, Number(c.out) || 0), url: null, missing: true }));
      state.selected = state.clips[0]?.id || null; state.name = String(data.name || 'Mijn videoproject').slice(0, 100);
      $('video-project-name').value = state.name; $('video-preview').removeAttribute('src'); $('video-preview').load(); $('video-empty').classList.remove('hidden'); refresh();
      notice('Montage geopend. Voeg de bronbestanden opnieuw toe om ze te koppelen.');
    } catch (error) { notice('Montage openen mislukt: ' + error.message); }
    finally { $('video-session-file').value = ''; }
  }
  function stop() { state.playing = false; $('video-preview').pause(); if (state.recorder && state.recorder.state === 'recording') state.recorder.stop(); refresh(); }
  function playNext() {
    const index = state.clips.findIndex(c => c.id === state.selected);
    const next = state.clips.slice(index + 1).find(c => c.url && length(c) > 0);
    if (next) select(next.id, next.in, true); else { stop(); state.time = total(); refresh(); }
  }
  function exportVideo() {
    const video = $('video-preview'), Recorder = window.MediaRecorder;
    if (!Recorder || !HTMLCanvasElement.prototype.captureStream) { notice('WebM-export wordt niet ondersteund door deze versie.'); return; }
    if (!state.clips.length || state.clips.some(c => c.missing || !c.url)) { notice('Koppel alle bronbestanden voordat je exporteert.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d'), stream = canvas.captureStream(30);
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => Recorder.isTypeSupported(t));
    if (!type) { stream.getTracks().forEach(t => t.stop()); notice('Geen WebM-codec beschikbaar.'); return; }
    const chunks = [], recorder = new Recorder(stream, { mimeType: type });
    state.recorder = recorder;
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      cancelAnimationFrame(state.frame); state.frame = 0; state.recorder = null;
      stream.getTracks().forEach(t => t.stop());
      if (!chunks.length) return;
      const url = URL.createObjectURL(new Blob(chunks, { type })), link = document.createElement('a');
      link.href = url; link.download = state.name + '.webm'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      notice('Video-export klaar. Deze eerste versie exporteert nog zonder audio.');
    };
    const draw = () => {
      if (recorder.state !== 'recording') return;
      ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, 1280, 720);
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1280 / video.videoWidth, 720 / video.videoHeight), w = video.videoWidth * scale, h = video.videoHeight * scale;
        ctx.drawImage(video, (1280 - w) / 2, (720 - h) / 2, w, h);
      }
      state.frame = requestAnimationFrame(draw);
    };
    recorder.start(250); draw();
    const first = state.clips.find(c => c.url && !c.missing);
    if (first) select(first.id, first.in, true);
    notice('Realtime WebM-export gestart; deze versie exporteert zonder audio.');
  }
  function show() {
    $('welcome-screen').classList.add('hidden'); $('editor-screen').classList.add('hidden'); $('video-screen').classList.remove('hidden');
    document.body.classList.add('video-mode');
    document.querySelectorAll('.rail-button[data-workspace]').forEach(b => b.classList.toggle('active', b.dataset.workspace === 'video'));
    $('footer-workspace').textContent = 'Motion Studio'; refresh();
  }
  function wire() {
    $('video-import').onclick = () => $('video-files').click(); $('video-files').onchange = e => importFiles(e.target.files);
    $('video-save-session').onclick = saveSession; $('video-open-session').onclick = () => $('video-session-file').click();
    $('video-session-file').onchange = e => openSession(e.target.files?.[0]); $('video-export').onclick = exportVideo;
    $('video-play').onclick = () => { const c = clip(); if (!c || c.missing) return notice('Importeer eerst een video.'); if (state.playing) stop(); else select(c.id, Math.max(c.in, $('video-preview').currentTime), true); };
    $('video-stop').onclick = () => { stop(); const c = clip(); if (c && c.url) select(c.id, c.in); };
    $('video-seek').oninput = e => { const t = Number(e.target.value); const c = state.clips.find(c => t >= c.start && t < c.start + length(c)); if (c) select(c.id, c.in + t - c.start, state.playing); };
    $('video-preview').ontimeupdate = () => { const c = clip(); if (!c || c.missing) return; state.time = c.start + Math.max(0, $('video-preview').currentTime - c.in); $('video-current').textContent = tc(state.time); if (state.playing && $('video-preview').currentTime >= c.out - .04) playNext(); };
    $('video-in').onchange = () => trim('in'); $('video-out').onchange = () => trim('out');
    $('video-left').onclick = () => { const i = state.clips.findIndex(c => c.id === state.selected); if (i > 0) reorder(state.clips[i].id, state.clips[i - 1].id); };
    $('video-right').onclick = () => { const i = state.clips.findIndex(c => c.id === state.selected); if (i >= 0 && i < state.clips.length - 1) reorder(state.clips[i].id, state.clips[i + 1].id); };
    $('video-remove').onclick = () => { const i = state.clips.findIndex(c => c.id === state.selected), item = state.clips[i]; if (!item) return; if (item.url) URL.revokeObjectURL(item.url); state.clips.splice(i, 1); state.selected = state.clips[Math.min(i, state.clips.length - 1)]?.id || null; if (state.selected) select(state.selected); else { stop(); $('video-empty').classList.remove('hidden'); refresh(); } };
    $('video-project-name').onchange = () => { state.name = $('video-project-name').value.trim().slice(0, 100) || 'Mijn videoproject'; };
    document.querySelectorAll('.rail-button[data-workspace]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.workspace === 'video') show(); else { $('video-screen').classList.add('hidden'); document.body.classList.remove('video-mode'); }
    }));
    window.addEventListener('beforeunload', () => state.clips.forEach(c => { if (c.url) URL.revokeObjectURL(c.url); }));
  }
  wire();
})();