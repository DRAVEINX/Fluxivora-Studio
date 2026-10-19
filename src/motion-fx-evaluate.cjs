'use strict';

const MAX_FRAME = 60 * 60 * 60;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function interpolateKeyframes(keyframes, frame, fallback = 0) {
  if (!Array.isArray(keyframes) || keyframes.length === 0) return fallback;
  const valid = keyframes
    .map((item, index) => ({ item, index }))
    .filter(entry => entry.item && Number.isFinite(entry.item.frame) && Number.isFinite(entry.item.value))
    .map(({ item, index }) => ({ ...item, frame: clamp(item.frame, 0, MAX_FRAME), _inputOrder: index }))
    .sort((a, b) => a.frame - b.frame || a._inputOrder - b._inputOrder);
  if (!valid.length) return fallback;
  // Match the runtime: when frame clamping collapses keyframes onto one
  // frame, the last keyframe in input order is authoritative.
  const unique = [];
  for (const item of valid) {
    delete item._inputOrder;
    if (unique.length && unique[unique.length - 1].frame === item.frame) unique[unique.length - 1] = item;
    else unique.push(item);
  }
  const at = clamp(Number.isFinite(frame) ? frame : 0, 0, MAX_FRAME);
  if (at <= unique[0].frame) return unique[0].value;
  if (at >= unique[unique.length - 1].frame) return unique[unique.length - 1].value;

  let left = unique[0];
  let right = unique[1];
  for (let index = 1; index < unique.length; index += 1) {
    if (at <= unique[index].frame) {
      left = unique[index - 1];
      right = unique[index];
      break;
    }
  }
  const span = right.frame - left.frame;
  if (span <= 0 || left.interpolation === 'hold') return left.value;
  let t = clamp((at - left.frame) / span, 0, 1);
  if (left.interpolation === 'ease') t = t * t * (3 - 2 * t);
  if (left.interpolation === 'bezier') {
    // Predictable symmetric cubic ease-in-out until custom curve handles are supplied.
    t = t * t * (3 - 2 * t);
  }
  return left.value + (right.value - left.value) * t;
}

function evaluateLayerProperty(layer, property, frame, fallback) {
  if (!layer || typeof layer !== 'object') return fallback;
  const frames = Array.isArray(layer.keyframes)
    ? layer.keyframes.filter(keyframe => keyframe && keyframe.property === property)
    : [];
  const source = fallback === undefined ? 0 : fallback;
  return interpolateKeyframes(frames, frame, source);
}

function evaluateLayerTransform(layer, frame) {
  const base = layer && layer.transform && typeof layer.transform === 'object' ? layer.transform : {};
  const properties = ['x', 'y', 'anchorX', 'anchorY', 'rotation', 'scaleX', 'scaleY', 'opacity'];
  const transform = {};
  for (const property of properties) {
    const fallback = Number.isFinite(base[property]) ? base[property] : (property === 'anchorX' || property === 'anchorY' ? 0.5 : property === 'scaleX' || property === 'scaleY' || property === 'opacity' ? 1 : 0);
    transform[property] = evaluateLayerProperty(layer, property, frame, fallback);
  }
  transform.opacity = clamp(transform.opacity, 0, 1);
  return transform;
}

function isLayerActive(layer, frame) {
  if (!layer || layer.enabled === false || !layer.timing || !Number.isFinite(frame) ||
      !Number.isFinite(layer.timing.inFrame) || !Number.isFinite(layer.timing.outFrame)) return false;
  // Match composition evaluation: direct callers use the same bounded playhead
  // and reject malformed timing instead of relying on JavaScript coercion.
  const at = clamp(frame, 0, MAX_FRAME);
  return at >= layer.timing.inFrame && at < layer.timing.outFrame;
}

function sortLayersForEvaluation(layers) {
  if (!Array.isArray(layers)) return [];
  const identified = layers.filter(layer => layer && typeof layer.id === 'string');
  const byId = new Map();
  for (const layer of identified) {
    if (byId.has(layer.id)) throw new TypeError(`Dubbele Motion FX-laag-ID: ${layer.id}`);
    byId.set(layer.id, layer);
  }
  const visited = new Set();
  const visiting = new Set();
  const result = [];
  function visit(layer) {
    if (visited.has(layer.id)) return;
    if (visiting.has(layer.id)) throw new TypeError('Circulaire ouder-kindrelatie gedetecteerd.');
    visiting.add(layer.id);
    if (layer.parentId && byId.has(layer.parentId)) visit(byId.get(layer.parentId));
    visiting.delete(layer.id);
    visited.add(layer.id);
    result.push(layer);
  }
  for (const layer of layers) if (layer && typeof layer.id === 'string') visit(layer);
  return result;
}


function transformMatrix(transform) {
  const radians = (transform.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // Avoid negative zero in serialized/debuggable matrices (e.g. rotation 0°). 
  const cleanZero = value => Object.is(value, -0) ? 0 : value;
  const scaleX = Number.isFinite(transform.scaleX) ? transform.scaleX : 1;
  const scaleY = Number.isFinite(transform.scaleY) ? transform.scaleY : 1;
  return {
    a: cleanZero(cos * scaleX), b: cleanZero(sin * scaleX),
    c: cleanZero(-sin * scaleY), d: cleanZero(cos * scaleY),
    e: Number.isFinite(transform.x) ? transform.x : 0,
    f: Number.isFinite(transform.y) ? transform.y : 0
  };
}

function multiplyMatrices(parent, local) {
  return {
    a: parent.a * local.a + parent.c * local.b,
    b: parent.b * local.a + parent.d * local.b,
    c: parent.a * local.c + parent.c * local.d,
    d: parent.b * local.c + parent.d * local.d,
    e: parent.a * local.e + parent.c * local.f + parent.e,
    f: parent.b * local.e + parent.d * local.f + parent.f
  };
}

function evaluateCompositionAtFrame(composition, frame) {
  if (!composition || !Array.isArray(composition.layers) || !Number.isFinite(frame)) {
    throw new TypeError('Compositie en een geldig frame zijn vereist.');
  }
  // Keep layer timing and keyframe sampling on the same bounded playhead.
  const at = clamp(frame, 0, MAX_FRAME);
  const ordered = sortLayersForEvaluation(composition.layers);
  const byId = new Map();
  const evaluated = [];
  for (const layer of ordered) {
    const transform = evaluateLayerTransform(layer, at);
    const localMatrix = transformMatrix(transform);
    const parent = layer.parentId ? byId.get(layer.parentId) : null;
    const worldMatrix = parent ? multiplyMatrices(parent.worldMatrix, localMatrix) : localMatrix;
    const parentVisible = !parent || parent.visible;
    const visible = isLayerActive(layer, at) && parentVisible;
    const worldOpacity = clamp(transform.opacity * (parent ? parent.worldOpacity : 1), 0, 1);
    const result = {
      id: layer.id,
      type: layer.type,
      name: layer.name,
      visible,
      localTransform: transform,
      worldTransform: worldMatrix,
      opacity: worldOpacity
    };
    byId.set(layer.id, { worldMatrix, worldOpacity, visible });
    evaluated.push(result);
  }
  return evaluated;
}

module.exports = { interpolateKeyframes, evaluateLayerProperty, evaluateLayerTransform, isLayerActive, sortLayersForEvaluation, evaluateCompositionAtFrame };
