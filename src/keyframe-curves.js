(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FluxivoraKeyframeCurves = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const PROPERTIES = Object.freeze({
    opacity: Object.freeze([0, 1]),
    scale: Object.freeze([0.1, 3]),
    rotation: Object.freeze([-3600, 3600]),
    x: Object.freeze([-100, 100]),
    y: Object.freeze([-100, 100]),
    volume: Object.freeze([0, 2])
  });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

  function normaliseHandle(handle, keyframe) {
    if (!handle || typeof handle !== 'object' || Array.isArray(handle)) return null;
    const result = {};
    if (Number.isFinite(Number(handle.time))) result.time = clamp(handle.time, 0.02, 0.48);
    for (const [property, bounds] of Object.entries(PROPERTIES)) {
      if (Number.isFinite(Number(handle[property]))) {
        const base = finite(keyframe && keyframe[property], bounds[0]);
        result[property] = clamp(Number(handle[property]), bounds[0] - base, bounds[1] - base);
      }
    }
    return Object.keys(result).length ? result : null;
  }

  function controlPoints(left, right, property) {
    if (!left || !right || !PROPERTIES[property]) throw new TypeError('Ongeldige keyframe-curve.');
    const bounds = PROPERTIES[property];
    const leftValue = clamp(finite(left[property], bounds[0]), bounds[0], bounds[1]);
    const rightValue = clamp(finite(right[property], bounds[0]), bounds[0], bounds[1]);
    const span = Math.max(0.0001, finite(right.time, 0) - finite(left.time, 0));
    const outHandle = left.outHandle && typeof left.outHandle === 'object' ? left.outHandle : {};
    const inHandle = right.inHandle && typeof right.inHandle === 'object' ? right.inHandle : {};
    const outTime = clamp(finite(outHandle.time, 1 / 3), 0.02, 0.48);
    const inTime = clamp(finite(inHandle.time, 1 / 3), 0.02, 0.48);
    const outDelta = clamp(
      finite(outHandle[property], (rightValue - leftValue) / 3),
      bounds[0] - leftValue, bounds[1] - leftValue
    );
    const inDelta = clamp(
      finite(inHandle[property], -(rightValue - leftValue) / 3),
      bounds[0] - rightValue, bounds[1] - rightValue
    );
    return {
      span, bounds, leftValue, rightValue, outTime, inTime,
      x1: finite(left.time, 0) + span * outTime,
      y1: clamp(leftValue + outDelta, bounds[0], bounds[1]),
      x2: finite(right.time, 0) - span * inTime,
      y2: clamp(rightValue + inDelta, bounds[0], bounds[1]),
      outDelta, inDelta
    };
  }

  function cubic(p0, p1, p2, p3, t) {
    const oneMinus = 1 - t;
    return oneMinus * oneMinus * oneMinus * p0 +
      3 * oneMinus * oneMinus * t * p1 +
      3 * oneMinus * t * t * p2 +
      t * t * t * p3;
  }

  function bezierValue(left, right, property, amount) {
    const controls = controlPoints(left, right, property);
    const alpha = clamp(finite(amount, 0), 0, 1);
    if (alpha <= 0) return controls.leftValue;
    if (alpha >= 1) return controls.rightValue;
    // Keep time handles inside their segment so X(t) is monotonic and can
    // be inverted safely without Newton iterations or unstable slopes.
    const x1 = clamp(controls.outTime, 0.02, 0.48);
    const x2 = clamp(1 - controls.inTime, 0.52, 0.98);
    let low = 0, high = 1, t = alpha;
    for (let i = 0; i < 22; i++) {
      t = (low + high) / 2;
      const x = cubic(0, x1, x2, 1, t);
      if (x < alpha) low = t; else high = t;
    }
    return clamp(
      cubic(controls.leftValue, controls.y1, controls.y2, controls.rightValue, t),
      controls.bounds[0], controls.bounds[1]
    );
  }

  return Object.freeze({ PROPERTIES, clamp, normaliseHandle, controlPoints, bezierValue });
});
