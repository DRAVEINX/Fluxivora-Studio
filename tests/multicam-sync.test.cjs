const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateWaveformOffset } = require('../src/multicam-sync.js');

test('waveform correlation estimates a positive offset when the candidate is delayed', () => {
  const reference = [0, 1, 0, 0.4, 0, 0.8, 0.2, 0.1, 0.7, 0.3, 0.9, 0.2, 0.5, 0.1, 0.6, 0.4];
  const candidate = [0, 0, ...reference.slice(0, -2)];
  const result = estimateWaveformOffset(reference, candidate, { sampleRate: 10, maxLagSamples: 4, minConfidence: 0.2 });
  assert.equal(result.accepted, true);
  assert.equal(result.lagSamples, 2);
  assert.equal(result.offsetSeconds, 0.2);
  assert.ok(result.confidence > 0.9);
});

test('waveform correlation rejects constant or too-weak signals', () => {
  const result = estimateWaveformOffset(Array(16).fill(0), Array(16).fill(0), { sampleRate: 25, maxLagSamples: 3 });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'insufficient-signal');
});

test('waveform correlation validates limits and input values', () => {
  assert.throws(() => estimateWaveformOffset([1, 2], [1, 2], { sampleRate: 25, maxLagSamples: 1 }), TypeError);
  assert.throws(() => estimateWaveformOffset(Array(8).fill(1), Array(8).fill(1), { sampleRate: 0, maxLagSamples: 1 }), RangeError);
  assert.throws(() => estimateWaveformOffset(Array(8).fill(1), Array(8).fill(1), { sampleRate: 25, maxLagSamples: -1 }), RangeError);
  assert.throws(() => estimateWaveformOffset([1, 2, 3, 4, 5, 6, 7, Infinity], Array(8).fill(1), { sampleRate: 25, maxLagSamples: 1 }), TypeError);
});

test('weak correlation is reported as unaccepted instead of silently syncing', () => {
  const reference = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
  const candidate = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  const result = estimateWaveformOffset(reference, candidate, { sampleRate: 25, maxLagSamples: 0, minConfidence: 0.2 });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'low-confidence');
});
