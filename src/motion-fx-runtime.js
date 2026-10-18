'use strict';

(function exposeMotionFxRuntime(root, factory) {
  const runtime = factory();
  if (typeof module === 'object' && module.exports) module.exports = runtime;
  if (root) root.FluxivoraMotionFxRuntime = runtime;
})(typeof window !== 'undefined' ? window : globalThis, function createMotionFxRuntime() {
  const EASING = Object.freeze({
    linear: value => value,
    easeIn: value => value * value,
    easeOut: value => 1 - Math.pow(1 - value, 2),
    easeInOut: value => value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2,
    hold: () => 0
  });

  function finite(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function interpolateProperty(keyframes, property, time, fallback = 0, options = {}) {
    if (!Array.isArray(keyframes)) return finite(fallback);
    const frames = keyframes
      .filter(frame => frame && Number.isFinite(frame.time) && Number.isFinite(frame[property]))
      .map(frame => ({ ...frame }))
      .sort((a, b) => a.time - b.time);
    if (!frames.length) return finite(fallback);
    const at = Math.max(0, finite(time));
    if (at <= frames[0].time) return frames[0][property];
    if (at >= frames[frames.length - 1].time) return frames[frames.length - 1][property];

    for (let index = 1; index < frames.length; index += 1) {
      const right = frames[index];
      if (at > right.time) continue;
      const left = frames[index - 1];
      const span = Math.max(0.0001, right.time - left.time);
      const progress = Math.max(0, Math.min(1, (at - left.time) / span));
      if (right.ease === 'bezier' && typeof options.bezierValue === 'function') {
        const result = options.bezierValue(left, right, property, progress);
        if (Number.isFinite(result)) return result;
      }
      const eased = (EASING[right.ease] || EASING.linear)(progress);
      return left[property] + (right[property] - left[property]) * eased;
    }
    return finite(fallback);
  }

  function evaluateLayerAtTime(layer, time, options = {}) {
    if (!layer || typeof layer !== 'object') throw new TypeError('Een geldige Motion FX-laag is vereist.');
    const duration = Math.max(0, finite(layer.duration, finite(layer.out, 0) - finite(layer.in, 0)));
    const start = Math.max(0, finite(layer.start));
    const localTime = finite(time) - start;
    const active = localTime >= 0 && localTime < duration;
    const values = {};
    for (const property of ['x', 'y', 'scale', 'opacity', 'rotation', 'volume']) {
      const base = property === 'opacity' ? 1 : property === 'scale' ? 1 : finite(layer[property]);
      values[property] = interpolateProperty(layer.keyframes, property, localTime, base, options);
    }
    return { id: String(layer.id || ''), active, values };
  }

  return Object.freeze({ interpolateProperty, evaluateLayerAtTime });
});
