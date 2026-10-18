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
