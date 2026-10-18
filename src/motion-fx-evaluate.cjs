'use strict';

const MAX_FRAME = 60 * 60 * 60;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function interpolateKeyframes(keyframes, frame, fallback = 0) {
  if (!Array.isArray(keyframes) || keyframes.length === 0) return fallback;
  const valid = keyframes
    .filter(item => item && Number.isFinite(item.frame) && Number.isFinite(item.value))
    .map(item => ({ ...item, frame: clamp(item.frame, 0, MAX_FRAME) }))
    .sort((a, b) => a.frame - b.frame);
  if (!valid.length) return fallback;
  if (frame <= valid[0].frame) return valid[0].value;
  if (frame >= valid[valid.length - 1].frame) return valid[valid.length - 1].value;

  let left = valid[0];
  let right = valid[1];
  for (let index = 1; index < valid.length; index += 1) {
    if (frame <= valid[index].frame) {
      left = valid[index - 1];
      right = valid[index];
      break;
    }
  }
  const span = right.frame - left.frame;
  if (span <= 0 || left.interpolation === 'hold') return left.value;
  let t = clamp((frame - left.frame) / span, 0, 1);
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
    const fallback = Number.isFinite(base[property]) ? base[property] : (property === 'scaleX' || property === 'scaleY' || property === 'opacity' ? 1 : 0);
    transform[property] = evaluateLayerProperty(layer, property, frame, fallback);
  }
  transform.opacity = clamp(transform.opacity, 0, 1);
  return transform;
}

function isLayerActive(layer, frame) {
  if (!layer || layer.enabled === false || !layer.timing) return false;
  return Number.isFinite(frame) && frame >= layer.timing.inFrame && frame < layer.timing.outFrame;
}

function sortLayersForEvaluation(layers) {
  if (!Array.isArray(layers)) return [];
  const byId = new Map(layers.filter(layer => layer && typeof layer.id === 'string').map(layer => [layer.id, layer]));
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

module.exports = { interpolateKeyframes, evaluateLayerProperty, evaluateLayerTransform, isLayerActive, sortLayersForEvaluation };
