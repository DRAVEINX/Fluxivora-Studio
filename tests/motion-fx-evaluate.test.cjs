'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Eval = require('../src/motion-fx-evaluate.cjs');

test('lineaire keyframes interpoleren tussen de twee omliggende frames', () => {
  const frames = [
    { frame: 0, value: 10, interpolation: 'linear' },
    { frame: 20, value: 30, interpolation: 'linear' }
  ];
  assert.equal(Eval.interpolateKeyframes(frames, 10), 20);
  assert.equal(Eval.interpolateKeyframes(frames, -2), 10);
  assert.equal(Eval.interpolateKeyframes(frames, 99), 30);
});

test('hold-interpolatie houdt de vorige waarde vast tot het volgende keyframe', () => {
  const frames = [
    { frame: 0, value: 4, interpolation: 'hold' },
    { frame: 10, value: 9, interpolation: 'linear' }
  ];
  assert.equal(Eval.interpolateKeyframes(frames, 8), 4);
  assert.equal(Eval.interpolateKeyframes(frames, 10), 9);
});

test('ease en bezier gebruiken voorspelbare vloeiende interpolatie', () => {
  const frames = [
    { frame: 0, value: 0, interpolation: 'ease' },
    { frame: 10, value: 100, interpolation: 'linear' }
  ];
  assert.equal(Eval.interpolateKeyframes(frames, 5), 50);
  assert.ok(Eval.interpolateKeyframes(frames, 2) < 20);
  assert.equal(Eval.interpolateKeyframes([
    { frame: 0, value: 0, interpolation: 'bezier' },
    { frame: 10, value: 100 }
  ], 5), 50);
});

test('laagproperty gebruikt keyframes per property en een fallback zonder keyframes', () => {
  const layer = { keyframes: [
    { frame: 0, property: 'opacity', value: 0, interpolation: 'linear' },
    { frame: 10, property: 'opacity', value: 1, interpolation: 'linear' },
    { frame: 0, property: 'rotation', value: 20, interpolation: 'hold' }
  ] };
  assert.equal(Eval.evaluateLayerProperty(layer, 'opacity', 5, 1), 0.5);
  assert.equal(Eval.evaluateLayerProperty(layer, 'scale', 5, 1.5), 1.5);
});

test('laagactiviteit volgt enabled en het halfopen in/out-framebereik', () => {
  const layer = { enabled: true, timing: { inFrame: 10, outFrame: 20 } };
  assert.equal(Eval.isLayerActive(layer, 9), false);
  assert.equal(Eval.isLayerActive(layer, 10), true);
  assert.equal(Eval.isLayerActive(layer, 19), true);
  assert.equal(Eval.isLayerActive(layer, 20), false);
  assert.equal(Eval.isLayerActive({ ...layer, enabled: false }, 15), false);
});

test('lagen worden ouder-eerst geordend en cycli worden geweigerd', () => {
  const layers = [
    { id: 'child', parentId: 'parent' },
    { id: 'parent', parentId: null },
    { id: 'other', parentId: null }
  ];
  assert.deepEqual(Eval.sortLayersForEvaluation(layers).map(layer => layer.id), ['parent', 'child', 'other']);
  assert.throws(() => Eval.sortLayersForEvaluation([
    { id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }
  ]), /Circulaire/);
});
