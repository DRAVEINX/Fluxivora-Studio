(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FluxivoraTimecode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FPS = 25;
  const MAX_FRAMES = 24 * 60 * 60 * FPS - 1;

  function framesToTimecode(frameCount) {
    const frames = Number(frameCount);
    if (!Number.isSafeInteger(frames) || frames < 0 || frames > MAX_FRAMES) {
      throw new RangeError('Framepositie moet binnen 00:00:00:00 en 23:59:59:24 liggen.');
    }
    const ff = frames % FPS;
    const totalSeconds = Math.floor(frames / FPS);
    const ss = totalSeconds % 60;
    const mm = Math.floor(totalSeconds / 60) % 60;
    const hh = Math.floor(totalSeconds / 3600);
    return [hh, mm, ss, ff].map((value, index) => String(value).padStart(index === 3 ? 2 : 2, '0')).join(':');
  }

  function timecodeToFrames(value) {
    if (typeof value !== 'string') throw new TypeError('Tijdcode moet tekst zijn in UU:MM:SS:FF-formaat.');
    const match = /^(\d{2}):(\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new TypeError('Gebruik tijdcode in UU:MM:SS:FF-formaat.');
    const [, h, m, s, f] = match.map(Number);
    if (h > 23 || m > 59 || s > 59 || f >= FPS) throw new RangeError('De tijdcode valt buiten het geldige 25-fps-bereik.');
    return (((h * 60 + m) * 60 + s) * FPS) + f;
  }

  return Object.freeze({ FPS, MAX_FRAMES, framesToTimecode, timecodeToFrames });
});
