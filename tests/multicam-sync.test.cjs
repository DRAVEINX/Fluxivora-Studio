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

test('waveform correlation ignores misleading matches with too little overlap', () => {
  const reference = [0.1, 0.8, 0.2, 0.9, 0.4, 0.3, 0.7, 0.5, 0.6, 0.2, 0.95, 0.15, 0.75, 0.35, 0.55, 0.25];
  const candidate = [0.99, 0.98, 0.97, 0.96, ...reference.slice(0, 8)];
  const result = estimateWaveformOffset(reference, candidate, { sampleRate: 25, maxLagSamples: 8, minConfidence: 0.2 });
  assert.equal(result.lagSamples, 4);
  assert.ok(result.confidence > 0.99);
  assert.throws(() => estimateWaveformOffset(reference, candidate, { sampleRate: 25, maxLagSamples: 8, minOverlapRatio: 0.1 }), RangeError);
});

test('waveform correlation refuses inputs that could freeze the editor', () => {
  const largeEnvelope = Array(200000).fill(0).map((_, index) => Math.sin(index / 9));
  assert.throws(
    () => estimateWaveformOffset(largeEnvelope, largeEnvelope, { sampleRate: 100, maxLagSamples: 50000 }),
    /too large for a safe synchronous calculation/
  );
});

test('weak correlation is reported as unaccepted instead of silently syncing', () => {
  const reference = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
  const candidate = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  const result = estimateWaveformOffset(reference, candidate, { sampleRate: 25, maxLagSamples: 0, minConfidence: 0.2 });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'low-confidence');
});

test('waveform correlation estimates a negative offset when the candidate starts earlier', () => {
  const reference = [0.05, 0.7, 0.2, 0.95, 0.35, 0.1, 0.8, 0.45, 0.6, 0.15, 0.9, 0.3, 0.55, 0.25, 0.75, 0.4];
  const candidate = [...reference.slice(2), 0.12, 0.88];
  const result = estimateWaveformOffset(reference, candidate, { sampleRate: 25, maxLagSamples: 4, minConfidence: 0.8 });
  assert.equal(result.accepted, true);
  assert.equal(result.lagSamples, -2);
  assert.equal(result.offsetSeconds, -0.08);
  assert.ok(result.confidence > 0.99);
});
