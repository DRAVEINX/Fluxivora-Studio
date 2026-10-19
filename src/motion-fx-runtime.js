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


  const MAX_FRAME = 216000;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function interpolateKeyframes(keyframes, frame, fallback = 0) {
    if (!Array.isArray(keyframes)) return finite(fallback);
    const sorted = keyframes
      .map((item, index) => ({ item, index }))
      .filter(entry => entry.item && Number.isFinite(entry.item.frame) && Number.isFinite(entry.item.value))
      .map(({ item, index }) => ({ ...item, frame: clamp(item.frame, 0, MAX_FRAME), _inputOrder: index }))
      .sort((a, b) => a.frame - b.frame || a._inputOrder - b._inputOrder);
    // If multiple keyframes target the same frame, the last one wins.
    // This avoids zero-length interpolation segments and makes edits predictable.
    const valid = [];
    for (const item of sorted) {
      delete item._inputOrder;
      if (valid.length && valid[valid.length - 1].frame === item.frame) valid[valid.length - 1] = item;
      else valid.push(item);
    }
    if (!valid.length) return finite(fallback);
    // Keep the public interpolator deterministic even when callers pass an
    // invalid or out-of-range playhead value.
    const at = clamp(finite(frame), 0, MAX_FRAME);
    if (at <= valid[0].frame) return valid[0].value;
    if (at >= valid[valid.length - 1].frame) return valid[valid.length - 1].value;
    for (let index = 1; index < valid.length; index += 1) {
      const right = valid[index];
      if (at > right.frame) continue;
      const left = valid[index - 1];
      const span = right.frame - left.frame;
      if (span <= 0 || left.interpolation === 'hold') return left.value;
      let progress = clamp((at - left.frame) / span, 0, 1);
      if (left.interpolation === 'bezier') {
        // Use the editor's real handle-based curve where its property ranges
        // match runtime values; retain smooth easing for unsupported properties.
        let curves = typeof globalThis !== 'undefined' ? globalThis.FluxivoraKeyframeCurves : null;
        if (!curves && typeof require === 'function') {
          try { curves = require('./keyframe-curves.js'); } catch (_) { curves = null; }
        }
        const supported = curves && curves.PROPERTIES && Object.prototype.hasOwnProperty.call(curves.PROPERTIES, left.property);
        if (supported && typeof curves.bezierValue === 'function') {
          const leftCurve = { ...left, time: left.frame, [left.property]: left.value };
          const rightCurve = { ...right, time: right.frame, [right.property]: right.value };
          const curved = curves.bezierValue(leftCurve, rightCurve, left.property, progress);
          if (Number.isFinite(curved)) return curved;
        }
        progress = progress * progress * (3 - 2 * progress);
      } else if (left.interpolation === 'ease') {
        progress = progress * progress * (3 - 2 * progress);
      }
      return left.value + (right.value - left.value) * progress;
    }
    return finite(fallback);
  }

  function evaluateCompositionAtFrame(composition, frame) {
    if (!composition || !Array.isArray(composition.layers) || !Number.isFinite(frame)) {
      throw new TypeError('Compositie en een geldig frame zijn vereist.');
    }
    // Use one bounded playhead value for both keyframe evaluation and layer timing.
    const at = clamp(frame, 0, MAX_FRAME);
    const identifiedLayers = composition.layers.filter(layer => layer && typeof layer.id === 'string');
    const seenIds = new Set();
    for (const layer of identifiedLayers) {
      if (seenIds.has(layer.id)) throw new TypeError(`Dubbele Motion FX-laag-ID: ${layer.id}`);
      seenIds.add(layer.id);
    }
    const byId = new Map();
    for (const layer of identifiedLayers) {
      if (byId.has(layer.id)) throw new TypeError(`Dubbele Motion FX-laag-ID: ${layer.id}`);
      byId.set(layer.id, layer);
    }
    const ordered = [];
    const visited = new Set();
    const visiting = new Set();
    function visit(layer) {
      if (visited.has(layer.id)) return;
      if (visiting.has(layer.id)) throw new TypeError('Circulaire ouder-kindrelatie gedetecteerd.');
      visiting.add(layer.id);
      if (layer.parentId && byId.has(layer.parentId)) visit(byId.get(layer.parentId));
      visiting.delete(layer.id);
      visited.add(layer.id);
      ordered.push(layer);
    }
    for (const layer of composition.layers) if (layer && typeof layer.id === 'string') visit(layer);

    function matrix(transform) {
      const radians = finite(transform.rotation) * Math.PI / 180;
      const cos = Math.cos(radians), sin = Math.sin(radians);
      const sx = finite(transform.scaleX, 1), sy = finite(transform.scaleY, 1);
      const clean = value => Object.is(value, -0) ? 0 : value;
      return { a: clean(cos * sx), b: clean(sin * sx), c: clean(-sin * sy), d: clean(cos * sy),
        e: finite(transform.x), f: finite(transform.y) };
    }
    function multiply(parent, local) {
      return {
        a: parent.a * local.a + parent.c * local.b,
        b: parent.b * local.a + parent.d * local.b,
        c: parent.a * local.c + parent.c * local.d,
        d: parent.b * local.c + parent.d * local.d,
        e: parent.a * local.e + parent.c * local.f + parent.e,
        f: parent.b * local.e + parent.d * local.f + parent.f
      };
    }

    const evaluatedById = new Map();
    return ordered.map(layer => {
      const base = layer.transform && typeof layer.transform === 'object' ? layer.transform : {};
      const transform = {};
      for (const property of ['x', 'y', 'anchorX', 'anchorY', 'rotation', 'scaleX', 'scaleY', 'opacity']) {
        const defaultValue = property === 'anchorX' || property === 'anchorY' ? 0.5
          : property === 'scaleX' || property === 'scaleY' || property === 'opacity' ? 1 : 0;
        transform[property] = interpolateKeyframes(
          (Array.isArray(layer.keyframes) ? layer.keyframes : []).filter(key => key && key.property === property),
          at, finite(base[property], defaultValue));
      }
      transform.opacity = clamp(transform.opacity, 0, 1);
      const localMatrix = matrix(transform);
      const parent = layer.parentId ? evaluatedById.get(layer.parentId) : null;
      const worldTransform = parent ? multiply(parent.worldTransform, localMatrix) : localMatrix;
      const timing = layer.timing || {};
      const active = layer.enabled !== false && Number.isFinite(timing.inFrame) &&
        Number.isFinite(timing.outFrame) && timing.outFrame > timing.inFrame &&
        at >= timing.inFrame && at < timing.outFrame;
      const visible = active && (!parent || parent.visible);
      const opacity = clamp(transform.opacity * (parent ? parent.opacity : 1), 0, 1);
      const result = { id: layer.id, type: layer.type, name: layer.name, visible,
        localTransform: transform, worldTransform, opacity };
      evaluatedById.set(layer.id, result);
      return result;
    });
  }

  return Object.freeze({ interpolateProperty, evaluateLayerAtTime, interpolateKeyframes, evaluateCompositionAtFrame });
});
