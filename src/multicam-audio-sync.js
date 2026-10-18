'use strict';

(function attachAudioSync(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FluxivoraAudioSync = api;
})(typeof window !== 'undefined' ? window : globalThis, function createAudioSync() {
  'use strict';

  function makeEnvelope(samples, sampleRate, windowMs = 20) {
    if (!samples || typeof samples.length !== 'number' || samples.length < 1) {
      throw new TypeError('Audiomonsters ontbreken.');
    }
    if (!Number.isFinite(sampleRate) || sampleRate < 1000 || sampleRate > 384000) {
      throw new RangeError('De samplefrequentie is ongeldig.');
    }
    if (!Number.isFinite(windowMs) || windowMs < 5 || windowMs > 200) {
      throw new RangeError('Het analysevenster moet tussen 5 en 200 ms liggen.');
    }
    const blockSize = Math.max(1, Math.round(sampleRate * windowMs / 1000));
    const envelope = [];
    for (let start = 0; start < samples.length; start += blockSize) {
      const end = Math.min(samples.length, start + blockSize);
      let energy = 0;
      for (let i = start; i < end; i += 1) {
        const sample = Number(samples[i]);
        if (!Number.isFinite(sample) || Math.abs(sample) > 8) {
          throw new TypeError('Audio bevat ongeldige samples.');
        }
        energy += sample * sample;
      }
      envelope.push(Math.sqrt(energy / (end - start)));
    }
    return envelope;
  }

  function estimateOffset(reference, candidate, options = {}) {
    if (!Array.isArray(reference) || !Array.isArray(candidate) ||
        reference.length < 3 || candidate.length < 3) {
      throw new TypeError('Voor synchronisatie zijn twee audioprofielen met minstens 3 punten nodig.');
    }
    const windowMs = options.windowMs == null ? 20 : Number(options.windowMs);
    const maxOffsetSeconds = options.maxOffsetSeconds == null ? 30 : Number(options.maxOffsetSeconds);
    if (!Number.isFinite(windowMs) || windowMs < 5 || windowMs > 200 ||
        !Number.isFinite(maxOffsetSeconds) || maxOffsetSeconds < 0 || maxOffsetSeconds > 600) {
      throw new RangeError('Ongeldige instellingen voor audio-synchronisatie.');
    }
    const stepSeconds = windowMs / 1000;
    const maxLag = Math.min(Math.floor(maxOffsetSeconds / stepSeconds), reference.length - 2, candidate.length - 2);
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const refMean = mean(reference);
    const candMean = mean(candidate);
    let best = { lag: 0, score: -Infinity, overlap: 0 };
    for (let lag = -maxLag; lag <= maxLag; lag += 1) {
      const refStart = Math.max(0, -lag);
      const refEnd = Math.min(reference.length, candidate.length - lag);
      const count = refEnd - refStart;
      if (count < 3) continue;
      let numerator = 0;
      let refEnergy = 0;
      let candEnergy = 0;
      for (let i = refStart; i < refEnd; i += 1) {
        const a = reference[i] - refMean;
        const b = candidate[i + lag] - candMean;
        numerator += a * b;
        refEnergy += a * a;
        candEnergy += b * b;
      }
      const denominator = Math.sqrt(refEnergy * candEnergy);
      const score = denominator > 1e-12 ? numerator / denominator : -1;
      if (score > best.score) best = { lag, score, overlap: count };
    }
    if (!Number.isFinite(best.score) || best.score < 0.15) {
      return { ok: false, offsetSeconds: null, confidence: Number.isFinite(best.score) ? best.score : 0, reason: 'Onvoldoende overeenkomst tussen de audio.' };
    }
    // A positive lag means the candidate audio occurs later; move it earlier by that amount.
    return {
      ok: true,
      offsetSeconds: Number((-best.lag * stepSeconds).toFixed(3)),
      confidence: Number(Math.max(0, Math.min(1, best.score)).toFixed(4)),
      overlapSamples: best.overlap,
      reason: null
    };
  }

  function synchronize(referenceSamples, candidateSamples, sampleRate, options = {}) {
    const windowMs = options.windowMs == null ? 20 : Number(options.windowMs);
    const reference = makeEnvelope(referenceSamples, sampleRate, windowMs);
    const candidate = makeEnvelope(candidateSamples, sampleRate, windowMs);
    return estimateOffset(reference, candidate, { ...options, windowMs });
  }

  return Object.freeze({ makeEnvelope, estimateOffset, synchronize });
});
