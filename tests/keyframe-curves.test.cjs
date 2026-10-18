const test = require('node:test');
const assert = require('node:assert/strict');
const curves = require('../src/keyframe-curves.js');

test('default Bezier handles preserve linear interpolation between keyframes', () => {
  const left = { time: 0, opacity: 0 };
  const right = { time: 10, opacity: 1 };
  for (const amount of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    assert.ok(Math.abs(curves.bezierValue(left, right, 'opacity', amount) - amount) < 0.0001,
      'linear handle defaults diverged at ' + amount);
  }
});

test('Bezier control handles change the animated curve and preserve exact endpoints', () => {
  const left = { time: 0, opacity: 0, outHandle: { time: 0.1, opacity: 0 } };
  const right = { time: 1, opacity: 1, inHandle: { time: 0.1, opacity: 0 } };
  assert.equal(curves.bezierValue(left, right, 'opacity', 0), 0);
  assert.equal(curves.bezierValue(left, right, 'opacity', 1), 1);
  assert.ok(curves.bezierValue(left, right, 'opacity', 0.2) < 0.2,
    'flat tangents at both ends should produce a slower initial rise');
  assert.ok(curves.bezierValue(left, right, 'opacity', 0.8) > 0.8,
    'flat tangents at both ends should ease into the final keyframe');
});

test('Bezier control points stay monotonic in time and clamp to each property range', () => {
  const left = { time: 2, opacity: 0.5, scale: 1, x: 0, y: 0, volume: 1, outHandle: { time: 0.48, opacity: 100, scale: 100, x: 500, y: -500, volume: 100 } };
  const right = { time: 3, opacity: 0.8, scale: 2, x: 80, y: -30, volume: 1.5, inHandle: { time: 0.48, opacity: -100, scale: -100, x: -500, y: 500, volume: -100 } };
  for (const property of Object.keys(curves.PROPERTIES)) {
    const cp = curves.controlPoints(left, right, property);
    assert.ok(cp.x1 > left.time && cp.x1 < cp.x2, 'first handle should remain left of the second');
    assert.ok(cp.x2 < right.time && cp.y1 >= cp.bounds[0] && cp.y1 <= cp.bounds[1]);
    assert.ok(cp.y2 >= cp.bounds[0] && cp.y2 <= cp.bounds[1]);
    for (const amount of [0, .25, .5, .75, 1]) {
      const value = curves.bezierValue(left, right, property, amount);
      assert.ok(value >= cp.bounds[0] && value <= cp.bounds[1]);
    }
  }
});

test('untrusted handle values are normalized and invalid handle objects are ignored', () => {
  const frame = { opacity: 0.5, scale: 1, x: 0, y: 0, volume: 1 };
  assert.equal(curves.normaliseHandle(null, frame), null);
  assert.equal(curves.normaliseHandle([], frame), null);
  const handle = curves.normaliseHandle({ time: 9, opacity: 9, scale: -99, x: 999, y: -999, volume: 99 }, frame);
  assert.equal(handle.time, 0.48);
  assert.equal(handle.opacity, 0.5);
  assert.equal(handle.scale, -0.9);
  assert.equal(handle.x, 100);
  assert.equal(handle.y, -100);
  assert.equal(handle.volume, 1);
});
