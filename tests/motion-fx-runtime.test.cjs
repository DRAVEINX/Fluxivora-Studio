'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Runtime = require('../src/motion-fx-runtime.js');

test('browser runtime interpoleert lineair tussen legacy-keyframes in seconden', () => {
  assert.equal(Runtime.interpolateProperty([
    { time: 0, x: 0, ease: 'linear' },
    { time: 2, x: 100, ease: 'linear' }
  ], 'x', 1, 7), 50);
});

test('browser runtime houdt de vorige waarde vast bij hold-easing', () => {
  assert.equal(Runtime.interpolateProperty([
    { time: 0, opacity: 0.2, ease: 'linear' },
    { time: 1, opacity: 1, ease: 'hold' }
  ], 'opacity', 0.75, 1), 0.2);
  assert.equal(Runtime.interpolateProperty([
    { time: 0, opacity: 0.2, ease: 'linear' },
    { time: 1, opacity: 1, ease: 'hold' }
  ], 'opacity', 1, 1), 1);
});

test('browser runtime gebruikt de Bézier-adapter en valt veilig terug als die ongeldig is', () => {
  const frames = [
    { time: 0, x: 0, ease: 'linear' },
    { time: 1, x: 100, ease: 'bezier' }
  ];
  assert.equal(Runtime.interpolateProperty(frames, 'x', 0.5, 0, {
    bezierValue: (_left, _right, property, progress) => property === 'x' ? progress * 80 : NaN
  }), 40);
  assert.equal(Runtime.interpolateProperty(frames, 'x', 0.5, 0, {
    bezierValue: () => NaN
  }), 50);
});

test('runtime evalueert actieve laag, lokale tijd en basiswaarden', () => {
  const layer = {
    id: 'title-1', start: 2, duration: 4, x: 10, y: -5, scale: 1,
    keyframes: [{ time: 0, x: 0, ease: 'linear' }, { time: 2, x: 40, ease: 'linear' }]
  };
  assert.deepEqual(Runtime.evaluateLayerAtTime(layer, 3), {
    id: 'title-1', active: true,
    values: { x: 20, y: -5, scale: 1, opacity: 1, rotation: 0, volume: 0 }
  });
  assert.equal(Runtime.evaluateLayerAtTime(layer, 6).active, false);
});

test('runtime valideert de laag en accepteert lege keyframes veilig', () => {
  assert.throws(() => Runtime.evaluateLayerAtTime(null, 0), /geldige Motion FX-laag/);
  assert.equal(Runtime.interpolateProperty([], 'x', 5, 12), 12);
});


test('browser runtime evalueert ouder-kindtransformaties en geërfde opacity', () => {
  const composition = { layers: [
    { id: 'child', type: 'shape', name: 'Kind', parentId: 'parent', enabled: true,
      transform: { x: 10, y: 0, scaleX: 1, scaleY: 1, opacity: 0.5 },
      timing: { inFrame: 0, outFrame: 20 }, keyframes: [] },
    { id: 'parent', type: 'null', name: 'Ouder', parentId: null, enabled: true,
      transform: { x: 100, y: 20, scaleX: 2, scaleY: 2, opacity: 0.8 },
      timing: { inFrame: 0, outFrame: 20 }, keyframes: [] }
  ] };
  const result = Runtime.evaluateCompositionAtFrame(composition, 5);
  assert.deepEqual(result.map(layer => layer.id), ['parent', 'child']);
  assert.deepEqual(result[1].worldTransform, { a: 2, b: 0, c: 0, d: 2, e: 120, f: 20 });
  assert.equal(result[1].opacity, 0.4);
  assert.equal(result[1].visible, true);
});

test('browser runtime verbergt kinderen van inactieve ouders en weigert cycli', () => {
  const composition = { layers: [
    { id: 'parent', parentId: null, enabled: false, transform: {}, timing: { inFrame: 0, outFrame: 10 }, keyframes: [] },
    { id: 'child', parentId: 'parent', enabled: true, transform: {}, timing: { inFrame: 0, outFrame: 10 }, keyframes: [] }
  ] };
  assert.equal(Runtime.evaluateCompositionAtFrame(composition, 2)[1].visible, false);
  assert.throws(() => Runtime.evaluateCompositionAtFrame({ layers: [
    { id: 'a', parentId: 'b', transform: {}, timing: { inFrame: 0, outFrame: 10 }, keyframes: [] },
    { id: 'b', parentId: 'a', transform: {}, timing: { inFrame: 0, outFrame: 10 }, keyframes: [] }
  ] }, 2), /Circulaire/);
});
