/* Local-only multicam waveform offset estimation. No media leaves the device. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FluxivoraMulticamSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function validateEnvelope(values, name) {
    if (!Array.isArray(values) || values.length < 8 || values.length > 200000) {
      throw new TypeError(name + ' must contain between 8 and 200000 samples.');
    }
    const output = values.map(Number);
    if (output.some(value => !Number.isFinite(value))) {
      throw new TypeError(name + ' must contain only finite samples.');
    }
    return output;
  }

  function estimateWaveformOffset(referenceInput, candidateInput, options = {}) {
    const reference = validateEnvelope(referenceInput, 'reference');
    const candidate = validateEnvelope(candidateInput, 'candidate');
    const sampleRate = Number(options.sampleRate);
    const maxLagSamples = Number(options.maxLagSamples);
    const minConfidence = options.minConfidence == null ? 0.15 : Number(options.minConfidence);
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate > 10000) {
      throw new RangeError('sampleRate must be greater than 0 and at most 10000.');
    }
    if (!Number.isInteger(maxLagSamples) || maxLagSamples < 0 || maxLagSamples > 50000) {
      throw new RangeError('maxLagSamples must be an integer between 0 and 50000.');
    }
    if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
      throw new RangeError('minConfidence must be between 0 and 1.');
    }

    const maxLag = Math.min(maxLagSamples, reference.length - 4, candidate.length - 4);
    let best = { lagSamples: 0, confidence: -2 };
    let hasValidCorrelation = false;
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      const refStart = Math.max(0, -lag);
      const candStart = Math.max(0, lag);
      const count = Math.min(reference.length - refStart, candidate.length - candStart);
      if (count < 8) continue;
      let sumA = 0, sumB = 0;
      for (let i = 0; i < count; i++) {
        sumA += reference[refStart + i];
        sumB += candidate[candStart + i];
      }
      const meanA = sumA / count, meanB = sumB / count;
      let numerator = 0, varianceA = 0, varianceB = 0;
      for (let i = 0; i < count; i++) {
        const a = reference[refStart + i] - meanA;
        const b = candidate[candStart + i] - meanB;
        numerator += a * b;
        varianceA += a * a;
        varianceB += b * b;
      }
      if (varianceA <= 1e-12 || varianceB <= 1e-12) continue;
      const confidence = numerator / Math.sqrt(varianceA * varianceB);
      hasValidCorrelation = true;
      if (confidence > best.confidence) best = { lagSamples: lag, confidence };
    }
    if (!hasValidCorrelation) {
      return { accepted: false, reason: 'insufficient-signal', lagSamples: 0, offsetSeconds: 0, confidence: 0 };
    }
    const confidence = Math.max(-1, Math.min(1, best.confidence));
    return {
      accepted: confidence >= minConfidence,
      reason: confidence >= minConfidence ? null : 'low-confidence',
      lagSamples: best.lagSamples,
      offsetSeconds: best.lagSamples / sampleRate,
      confidence
    };
  }

  return { estimateWaveformOffset };
});
