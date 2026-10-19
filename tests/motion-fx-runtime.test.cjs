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
  assert.ok(Math.abs(middle.values.opacity - 0.6) < 1e-9);
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


test('Motion FX composition evaluation respects disabled layers and exact timing boundaries', () => {
  const evaluated = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'disabled-parent', type: 'group', enabled: false,
      transform: { x: 20, y: 30, opacity: 0.8 },
      timing: { inFrame: 0, outFrame: 10 } },
    { id: 'child', parentId: 'disabled-parent', type: 'shape', enabled: true,
      transform: { x: 5, y: 7, opacity: 0.5 },
      timing: { inFrame: 0, outFrame: 10 } },
    { id: 'boundary-layer', type: 'shape', enabled: true,
      transform: {}, timing: { inFrame: 5, outFrame: 8 } }
  ] }, 8);
  const parent = evaluated.find(layer => layer.id === 'disabled-parent');
  const child = evaluated.find(layer => layer.id === 'child');
  const boundary = evaluated.find(layer => layer.id === 'boundary-layer');
  assert.equal(parent.visible, false);
  assert.equal(child.visible, false);
  assert.equal(boundary.visible, false, 'outFrame is exclusive');
});

test('Motion FX composition evaluation keeps a layer inactive before its inFrame', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'later', type: 'shape', enabled: true,
      transform: { x: 12 }, timing: { inFrame: 4, outFrame: 12 } }
  ] }, 3);
  assert.equal(layer.visible, false);
  assert.equal(layer.localTransform.x, 12);
});


test('Motion FX composition evaluates transform keyframes and clamps opacity', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'animated', type: 'shape', enabled: true,
      transform: { x: 2, y: 4, rotation: 0, scaleX: 1, scaleY: 1, opacity: 0.5 },
      keyframes: [
        { frame: 0, property: 'x', value: 0, interpolation: 'linear' },
        { frame: 10, property: 'x', value: 100, interpolation: 'linear' },
        { frame: 0, property: 'opacity', value: 2, interpolation: 'linear' },
        { frame: 10, property: 'opacity', value: 2, interpolation: 'linear' }
      ],
      timing: { inFrame: 0, outFrame: 20 } }
  ] }, 5);
  assert.equal(layer.localTransform.x, 50);
  assert.equal(layer.localTransform.y, 4);
  assert.equal(layer.localTransform.opacity, 1);
  assert.equal(layer.opacity, 1);
});


test('Motion FX composition preserves layer order and parent-first evaluation', () => {
  const evaluated = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'child-first', parentId: 'parent-later', type: 'shape', enabled: true,
      transform: { x: 3, y: 0 }, timing: { inFrame: 0, outFrame: 10 } },
    { id: 'unrelated', type: 'shape', enabled: true,
      transform: { x: 7, y: 0 }, timing: { inFrame: 0, outFrame: 10 } },
    { id: 'parent-later', type: 'group', enabled: true,
      transform: { x: 10, y: 0 }, timing: { inFrame: 0, outFrame: 10 } }
  ] }, 2);
  assert.deepEqual(evaluated.map(layer => layer.id), ['parent-later', 'child-first', 'unrelated']);
  assert.equal(evaluated.find(layer => layer.id === 'child-first').worldTransform.e, 13);
});

test('Motion FX composition tolerates missing optional keyframes and transforms', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'minimal', type: 'shape', enabled: true,
      timing: { inFrame: 0, outFrame: 3 } }
  ] }, 1);
  assert.equal(layer.visible, true);
  assert.equal(layer.localTransform.x, 0);
  assert.equal(layer.localTransform.scaleX, 1);
  assert.equal(layer.localTransform.opacity, 1);
  assert.equal(layer.opacity, 1);
});


test('Motion FX composition clamps negative and over-range opacity after inheritance', () => {
  const evaluated = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'parent', type: 'group', enabled: true,
      transform: { opacity: 0.7 }, timing: { inFrame: 0, outFrame: 10 } },
    { id: 'child-high', parentId: 'parent', type: 'shape', enabled: true,
      transform: { opacity: 2 }, timing: { inFrame: 0, outFrame: 10 } },
    { id: 'child-low', parentId: 'parent', type: 'shape', enabled: true,
      transform: { opacity: -1 }, timing: { inFrame: 0, outFrame: 10 } }
  ] }, 3);
  assert.equal(evaluated.find(layer => layer.id === 'child-high').opacity, 0.7);
  assert.equal(evaluated.find(layer => layer.id === 'child-low').opacity, 0);
});

test('Motion FX composition handles unknown parent identifiers as root layers', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'orphan', parentId: 'missing-parent', type: 'shape', enabled: true,
      transform: { x: 9, y: 4, opacity: 0.8 },
      timing: { inFrame: 0, outFrame: 5 } }
  ] }, 2);
  assert.equal(layer.visible, true);
  assert.equal(layer.worldTransform.e, 9);
  assert.equal(layer.worldTransform.f, 4);
  assert.equal(layer.opacity, 0.8);
});


test('Motion FX composition handles reversed timing as inactive', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'reversed', type: 'shape', enabled: true,
      transform: { x: 1 }, timing: { inFrame: 9, outFrame: 4 } }
  ] }, 6);
  assert.equal(layer.visible, false);
});

test('Motion FX composition ignores malformed keyframes and preserves base values', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'malformed-keys', type: 'shape', enabled: true,
      transform: { x: 11, opacity: 0.4 },
      keyframes: [
        null,
        { frame: 'bad', property: 'x', value: 99 },
        { frame: 2, property: 'x', value: Infinity },
        { frame: 3, property: 'y', value: 42 }
      ],
      timing: { inFrame: 0, outFrame: 8 } }
  ] }, 4);
  assert.equal(layer.localTransform.x, 11);
  assert.equal(layer.localTransform.opacity, 0.4);
  assert.equal(layer.visible, true);
});


test('Motion FX composition applies keyframe values at exact frame boundaries', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'boundary-keys', type: 'shape', enabled: true,
      transform: { x: 4 },
      keyframes: [
        { frame: 2, property: 'x', value: 20, interpolation: 'linear' },
        { frame: 6, property: 'x', value: 60, interpolation: 'linear' }
      ],
      timing: { inFrame: 0, outFrame: 10 } }
  ] }, 2);
  assert.equal(layer.localTransform.x, 20);
});

test('Motion FX composition holds values on hold keyframe segments', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'held', type: 'shape', enabled: true,
      transform: { x: 0 },
      keyframes: [
        { frame: 0, property: 'x', value: 10, interpolation: 'hold' },
        { frame: 10, property: 'x', value: 90, interpolation: 'linear' }
      ],
      timing: { inFrame: 0, outFrame: 20 } }
  ] }, 5);
  assert.equal(layer.localTransform.x, 10);
});


test('Motion FX composition applies smooth ease interpolation to keyframes', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'eased', type: 'shape', enabled: true,
      transform: { x: 0 },
      keyframes: [
        { frame: 0, property: 'x', value: 0, interpolation: 'ease' },
        { frame: 10, property: 'x', value: 100, interpolation: 'linear' }
      ],
      timing: { inFrame: 0, outFrame: 20 } }
  ] }, 2.5);
  assert.ok(Math.abs(layer.localTransform.x - 15.625) < 1e-9);
});

test('Motion FX composition builds rotation and scale into the world matrix', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'scaled-rotated', type: 'shape', enabled: true,
      transform: { x: 3, y: 4, rotation: 90, scaleX: 2, scaleY: 3 },
      timing: { inFrame: 0, outFrame: 5 } }
  ] }, 1);
  assert.ok(Math.abs(layer.worldTransform.a) < 1e-9);
  assert.ok(Math.abs(layer.worldTransform.b - 2) < 1e-9);
  assert.ok(Math.abs(layer.worldTransform.c + 3) < 1e-9);
  assert.ok(Math.abs(layer.worldTransform.d) < 1e-9);
  assert.equal(layer.worldTransform.e, 3);
  assert.equal(layer.worldTransform.f, 4);
});


test('Motion FX property interpolation supports ease-in and ease-out curves', () => {
  const keyframes = [
    { time: 0, x: 0, ease: 'linear' },
    { time: 10, x: 100, ease: 'easeIn' },
    { time: 20, x: 200, ease: 'easeOut' }
  ];
  assert.equal(runtime.interpolateProperty(keyframes, 'x', 5, -1), 25);
  assert.equal(runtime.interpolateProperty(keyframes, 'x', 15, -1), 175);
});

test('Motion FX property interpolation uses a supplied Bézier evaluator when available', () => {
  const keyframes = [
    { time: 0, x: 0, ease: 'linear' },
    { time: 10, x: 100, ease: 'bezier' }
  ];
  const value = runtime.interpolateProperty(keyframes, 'x', 5, 0, {
    bezierValue: (left, right, property, progress) => {
      assert.equal(left.time, 0);
      assert.equal(right.time, 10);
      assert.equal(property, 'x');
      assert.equal(progress, 0.5);
      return 42;
    }
  });
  assert.equal(value, 42);
});


test('Motion FX composition animates rotation and scale keyframes independently', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'animated-transform', type: 'shape', enabled: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      keyframes: [
        { frame: 0, property: 'rotation', value: 0, interpolation: 'linear' },
        { frame: 10, property: 'rotation', value: 180, interpolation: 'linear' },
        { frame: 0, property: 'scaleX', value: 1, interpolation: 'linear' },
        { frame: 10, property: 'scaleX', value: 3, interpolation: 'linear' },
        { frame: 0, property: 'scaleY', value: 2, interpolation: 'linear' },
        { frame: 10, property: 'scaleY', value: 4, interpolation: 'linear' }
      ],
      timing: { inFrame: 0, outFrame: 20 } }
  ] }, 5);
  assert.equal(layer.localTransform.rotation, 90);
  assert.equal(layer.localTransform.scaleX, 2);
  assert.equal(layer.localTransform.scaleY, 3);
  assert.ok(Math.abs(layer.worldTransform.a) < 1e-9);
  assert.ok(Math.abs(layer.worldTransform.b - 2) < 1e-9);
  assert.ok(Math.abs(layer.worldTransform.c + 3) < 1e-9);
});

test('Motion FX composition preserves input order for duplicate-free independent layers', () => {
  const evaluated = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'one', type: 'shape', transform: { x: 1 }, timing: { inFrame: 0, outFrame: 5 } },
    { id: 'two', type: 'shape', transform: { x: 2 }, timing: { inFrame: 0, outFrame: 5 } },
    { id: 'three', type: 'shape', transform: { x: 3 }, timing: { inFrame: 0, outFrame: 5 } }
  ] }, 2);
  assert.deepEqual(evaluated.map(layer => layer.id), ['one', 'two', 'three']);
  assert.deepEqual(evaluated.map(layer => layer.worldTransform.e), [1, 2, 3]);
});


test('Motion FX interpolation ignores invalid time and property values', () => {
  const frames = [
    { time: 0, x: 0, ease: 'linear' },
    { time: 'bad', x: 100, ease: 'linear' },
    { time: 5, x: Infinity, ease: 'linear' },
    null,
    { time: 10, x: 100, ease: 'linear' }
  ];
  assert.equal(runtime.interpolateProperty(frames, 'x', 5, 7), 50);
  assert.equal(runtime.interpolateProperty(frames, 'y', 5, 7), 7);
});

test('Motion FX interpolation clamps negative playback time and preserves endpoint values', () => {
  const frames = [
    { time: 2, opacity: 0.25, ease: 'linear' },
    { time: 4, opacity: 0.75, ease: 'linear' }
  ];
  assert.equal(runtime.interpolateProperty(frames, 'opacity', -100, 1), 0.25);
  assert.equal(runtime.interpolateProperty(frames, 'opacity', 100, 1), 0.75);
});


test('Motion FX composition rejects duplicate layer identifiers before evaluation', () => {
  assert.throws(() => runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'duplicate', type: 'shape', transform: {}, timing: { inFrame: 0, outFrame: 5 } },
    { id: 'duplicate', type: 'group', transform: { x: 10 }, timing: { inFrame: 0, outFrame: 5 } }
  ] }, 2), /Dubbele Motion FX-laag-ID: duplicate/);
});


test('Motion FX composition evaluates handle-based Bézier keyframes using editor curves', () => {
  const [layer] = runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'bezier-opacity', type: 'shape', enabled: true,
      transform: { opacity: 0 },
      keyframes: [
        { frame: 0, property: 'opacity', value: 0, interpolation: 'bezier', outHandle: { time: 0.1, opacity: 0 } },
        { frame: 10, property: 'opacity', value: 1, interpolation: 'linear', inHandle: { time: 0.1, opacity: 0 } }
      ],
      timing: { inFrame: 0, outFrame: 20 } }
  ] }, 2);
  assert.ok(layer.localTransform.opacity < 0.2, 'flat Bézier handles should produce a slower initial rise');
  assert.equal(layer.opacity, layer.localTransform.opacity);
});
