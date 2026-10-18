'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Sync = require('../src/multicam-audio-sync.js');

test('audio envelope groups samples into stable RMS windows', () => {
  const envelope = Sync.makeEnvelope([1, 1, 0, 0], 1000, 20);
  assert.equal(envelope.length, 2);
  assert.equal(envelope[0], 1);
  assert.equal(envelope[1], 0);
});

test('multicam offset finds a candidate track that starts later', () => {
  const reference = Array.from({ length: 100 }, (_, i) => Math.sin(i * 0.19) + Math.cos(i * 0.071));
  const candidate = Array.from({ length: 100 }, (_, i) => i < 7 ? 0 : reference[i - 7]);
  const result = Sync.estimateOffset(reference, candidate, { windowMs: 20, maxOffsetSeconds: 0.2 });
  assert.equal(result.ok, true);
  assert.equal(result.offsetSeconds, -0.14);
  assert.ok(result.confidence > 0.9);
});

test('audio sync rejects invalid samples and impossible options', () => {
  assert.throws(() => Sync.makeEnvelope([0, NaN, 1], 48000), /ongeldige samples/i);
  assert.throws(() => Sync.makeEnvelope([0, 1], 10), /samplefrequentie/i);
  assert.throws(() => Sync.estimateOffset([1, 2], [1, 2]), /minstens 3 punten/i);
});

test('audio sync reports low confidence rather than inventing an offset', () => {
  const result = Sync.estimateOffset([1, 1, 1, 1, 1], [0, 0, 0, 0, 0]);
  assert.equal(result.ok, false);
  assert.equal(result.offsetSeconds, null);
});
