'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('../src/motion-fx-runtime.js');

test('Motion FX interpolation sorts keyframes and interpolates linear values', () => {
  const frames = [
    { time: 2, x: 20, ease: 'linear' },
    { time: 0, x: 0, ease: 'linear' }
  ];
  assert.equal(runtime.interpolateProperty(frames, 'x', 1, 99), 10);
});

test('Motion FX interpolation clamps to endpoint values and handles empty input', () => {
  const frames = [{ time: 1, opacity: 0.25 }, { time: 3, opacity: 0.75 }];
  assert.equal(runtime.interpolateProperty(frames, 'opacity', -5, 1), 0.25);
  assert.equal(runtime.interpolateProperty(frames, 'opacity', 8, 1), 0.75);
  assert.equal(runtime.interpolateProperty([], 'opacity', 1, 0.6), 0.6);
  assert.equal(runtime.interpolateProperty(null, 'opacity', 1, 0.6), 0.6);
});

test('Motion FX interpolation supports ease curves and hold segments', () => {
  assert.equal(runtime.interpolateProperty([
    { time: 0, x: 0, ease: 'linear' }, { time: 2, x: 8, ease: 'easeIn' }
  ], 'x', 1), 2);
  assert.equal(runtime.interpolateProperty([
    { time: 0, x: 0, ease: 'linear' }, { time: 2, x: 8, ease: 'hold' }
  ], 'x', 1), 0);
});

test('Motion FX interpolation delegates Bézier segments and accepts only finite results', () => {
  const frames = [
    { time: 0, x: 0, ease: 'linear' },
    { time: 2, x: 10, ease: 'bezier' }
  ];
  let args;
  const bezierValue = (...values) => { args = values; return 7; };
  assert.equal(runtime.interpolateProperty(frames, 'x', 1, 0, { bezierValue }), 7);
  assert.equal(args[2], 'x');
  assert.equal(args[3], 0.5);
  assert.equal(runtime.interpolateProperty(frames, 'x', 1, 0, { bezierValue: () => NaN }), 5);
});

test('Motion FX interpolation ignores malformed frames and uses finite fallback values', () => {
  const frames = [
    null,
    { time: 'bad', x: 10 },
    { time: 1, x: Infinity },
    { time: 2, y: 20 }
  ];
  assert.equal(runtime.interpolateProperty(frames, 'x', 1, 12), 12);
  assert.equal(runtime.interpolateProperty(undefined, 'x', 1, '4'), 4);
});


test('Motion FX layer evaluation returns animated values and active state', () => {
  const layer = {
    id: 'layer-a', start: 2, duration: 4, x: 10, y: 5,
    keyframes: [
      { time: 0, x: 0, opacity: 0.2, ease: 'linear' },
      { time: 2, x: 20, opacity: 1, ease: 'linear' }
    ]
  };
  const before = runtime.evaluateLayerAtTime(layer, 1);
  assert.equal(before.active, false);
  assert.equal(before.values.x, 0);
  const middle = runtime.evaluateLayerAtTime(layer, 3);
  assert.equal(middle.active, true);
  assert.equal(middle.values.x, 10);
  assert.equal(middle.values.opacity, 0.6);
  assert.equal(middle.values.scale, 1);
  assert.equal(runtime.evaluateLayerAtTime(layer, 6).active, false);
});

test('Motion FX composition evaluation applies parent transforms and inherited visibility', () => {
  const evaluated = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'child', parentId: 'parent', type: 'shape', enabled: true,
      transform: { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 0.5 },
      timing: { inFrame: 0, outFrame: 20 } },
    { id: 'parent', type: 'group', enabled: true,
      transform: { x: 100, y: 20, rotation: 90, scaleX: 1, scaleY: 1, opacity: 0.5 },
      timing: { inFrame: 0, outFrame: 20 } }
  ] }, 5);
  const child = evaluated.find(layer => layer.id === 'child');
  assert.equal(child.visible, true);
  assert.ok(Math.abs(child.worldTransform.e - 100) < 1e-9);
  assert.ok(Math.abs(child.worldTransform.f - 30) < 1e-9);
  assert.equal(child.opacity, 0.25);
});

test('Motion FX composition evaluation rejects circular parent relationships', () => {
  assert.throws(() => runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'a', parentId: 'b', transform: {}, timing: { inFrame: 0, outFrame: 2 } },
    { id: 'b', parentId: 'a', transform: {}, timing: { inFrame: 0, outFrame: 2 } }
  ] }, 1), /Circulaire ouder-kindrelatie/);
});
