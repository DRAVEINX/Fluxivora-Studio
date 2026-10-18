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

test('evaluateert de volledige laagtransformatie op een gekozen frame', () => {
  const layer = {
    transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, opacity: 0.8 },
    keyframes: [
      { frame: 0, property: 'x', value: 0, interpolation: 'linear' },
      { frame: 20, property: 'x', value: 200, interpolation: 'linear' },
      { frame: 0, property: 'opacity', value: 0, interpolation: 'linear' },
      { frame: 20, property: 'opacity', value: 1.5, interpolation: 'linear' }
    ]
  };
  assert.deepEqual(Eval.evaluateLayerTransform(layer, 10), {
    x: 100, y: 50, anchorX: 0.5, anchorY: 0.5, rotation: 0, scaleX: 1, scaleY: 1, opacity: 0.75
  });
});

test('compositie-evaluatie combineert oudertransformaties en opacity', () => {
  const composition = { layers: [
    { id: 'child', name: 'Kind', type: 'shape', parentId: 'parent', enabled: true,
      transform: { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 0.5 },
      timing: { inFrame: 0, outFrame: 20 }, keyframes: [] },
    { id: 'parent', name: 'Ouder', type: 'null', parentId: null, enabled: true,
      transform: { x: 100, y: 20, rotation: 0, scaleX: 2, scaleY: 2, opacity: 0.8 },
      timing: { inFrame: 0, outFrame: 20 }, keyframes: [] }
  ] };
  const result = Eval.evaluateCompositionAtFrame(composition, 5);
  assert.deepEqual(result.map(layer => layer.id), ['parent', 'child']);
  assert.deepEqual(result[1].worldTransform, { a: 2, b: 0, c: 0, d: 2, e: 120, f: 20 });
  assert.equal(result[1].opacity, 0.4);
  assert.equal(result[1].visible, true);
});

test('inactieve ouder verbergt afhankelijke lagen en ontbrekende compositie wordt geweigerd', () => {
  const composition = { layers: [
    { id: 'parent', parentId: null, enabled: false, transform: {}, timing: { inFrame: 0, outFrame: 10 }, keyframes: [] },
    { id: 'child', parentId: 'parent', enabled: true, transform: {}, timing: { inFrame: 0, outFrame: 10 }, keyframes: [] }
  ] };
  const result = Eval.evaluateCompositionAtFrame(composition, 2);
  assert.equal(result[0].visible, false);
  assert.equal(result[1].visible, false);
  assert.throws(() => Eval.evaluateCompositionAtFrame(null, 0), /Compositie/);
});
