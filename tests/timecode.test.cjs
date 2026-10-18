const test = require('node:test');
const assert = require('node:assert/strict');
const { FPS, MAX_FRAMES, framesToTimecode, timecodeToFrames } = require('../src/timecode.js');

test('timecode uses the current fixed 25 fps sequence', () => {
  assert.equal(FPS, 25);
  assert.equal(framesToTimecode(0), '00:00:00:00');
  assert.equal(framesToTimecode(24), '00:00:00:24');
  assert.equal(framesToTimecode(25), '00:00:01:00');
  assert.equal(framesToTimecode(25 * 60 + 7), '00:01:00:07');
});

test('timecode round-trips frame positions including the last supported frame', () => {
  for (const frame of [0, 1, 24, 25, 1499, 1500, 90061, MAX_FRAMES]) {
    assert.equal(timecodeToFrames(framesToTimecode(frame)), frame);
  }
});

test('invalid frame positions and malformed timecodes are rejected', () => {
  for (const frame of [-1, 1.5, Number.NaN, MAX_FRAMES + 1]) {
    assert.throws(() => framesToTimecode(frame), RangeError);
  }
  for (const value of ['0:00:00:00', '00:60:00:00', '00:00:60:00', '00:00:00:25', 'not-timecode']) {
    assert.throws(() => timecodeToFrames(value));
  }
});
