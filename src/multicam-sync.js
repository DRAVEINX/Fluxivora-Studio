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

  function createRmsEnvelope(channelData, options = {}) {
    if (!Array.isArray(channelData) || channelData.length < 1 || channelData.length > 32) {
      throw new TypeError('channelData must contain between 1 and 32 audio channels.');
    }
    const frameSize = options.frameSize == null ? 2048 : Number(options.frameSize);
    const maxSamples = options.maxSamples == null ? 200000 : Number(options.maxSamples);
    if (!Number.isInteger(frameSize) || frameSize < 64 || frameSize > 65536) {
      throw new RangeError('frameSize must be an integer between 64 and 65536.');
    }
    if (!Number.isInteger(maxSamples) || maxSamples < 8 || maxSamples > 200000) {
      throw new RangeError('maxSamples must be an integer between 8 and 200000.');
    }
    const channels = channelData.map((channel, index) => {
      if (!channel || typeof channel.length !== 'number' || channel.length < 1) {
        throw new TypeError('Audio channel ' + index + ' must contain samples.');
      }
      if (channel.length > 100000000) throw new RangeError('Audio channel is too large to process safely.');
      return channel;
    });
    const frameCount = Math.ceil(Math.min(...channels.map(channel => channel.length)) / frameSize);
    const stride = Math.max(1, Math.ceil(frameCount / maxSamples));
    const envelope = [];
    for (let frame = 0; frame < frameCount; frame += stride) {
      const start = frame * frameSize;
      const end = Math.min(start + frameSize, ...channels.map(channel => channel.length));
      let sumSquares = 0, count = 0;
      for (let i = start; i < end; i++) {
        for (const channel of channels) {
          const sample = Number(channel[i]);
          if (!Number.isFinite(sample)) throw new TypeError('Audio channels must contain finite samples.');
          sumSquares += sample * sample;
          count++;
        }
      }
      if (count) envelope.push(Math.sqrt(sumSquares / count));
    }
    if (envelope.length < 8) throw new RangeError('Audio is too short to build a useful waveform envelope.');
    return envelope;
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

    const minOverlapRatio = options.minOverlapRatio == null ? 0.5 : Number(options.minOverlapRatio);
    if (!Number.isFinite(minOverlapRatio) || minOverlapRatio < 0.25 || minOverlapRatio > 1) {
      throw new RangeError('minOverlapRatio must be between 0.25 and 1.');
    }
    const minimumOverlap = Math.max(8, Math.ceil(Math.min(reference.length, candidate.length) * minOverlapRatio));
    const maxLag = Math.min(maxLagSamples, reference.length - 4, candidate.length - 4);
    // Bound synchronous work so unusually large inputs cannot freeze the editor UI.
    const estimatedOperations = (2 * maxLag + 1) * Math.min(reference.length, candidate.length);
    const MAX_CORRELATION_OPERATIONS = 25000000;
    if (estimatedOperations > MAX_CORRELATION_OPERATIONS) {
      throw new RangeError('Waveform comparison is too large for a safe synchronous calculation. Use shorter envelopes or a smaller maxLagSamples value.');
    }
    let best = { lagSamples: 0, confidence: -2 };
    let hasValidCorrelation = false;
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      const refStart = Math.max(0, -lag);
      const candStart = Math.max(0, lag);
      const count = Math.min(reference.length - refStart, candidate.length - candStart);
      if (count < minimumOverlap) continue;
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

  return { createRmsEnvelope, estimateWaveformOffset };
});
