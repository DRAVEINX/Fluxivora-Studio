'use strict';

const MotionFX = require('./motion-fx-composition.cjs');
const MAX_PRESETS = 100;
const MAX_LIBRARY_BYTES = 10 * 1024 * 1024;

function validateLibrary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.format !== 'fluxivora-motion-fx-library' || value.version !== 1 || !Array.isArray(value.presets) || value.presets.length > MAX_PRESETS) {
    throw new TypeError('Ongeldige Motion FX-bibliotheek.');
  }
  const ids = new Set();
  for (const preset of value.presets) {
    if (!preset || typeof preset.id !== 'string' || !preset.id || ids.has(preset.id)) throw new TypeError('Preset-ID ontbreekt of is dubbel.');
    ids.add(preset.id);
    if (typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 60) throw new TypeError('Ongeldige presetnaam.');
    if (!preset.composition || MotionFX.validateComposition(preset.composition).length) throw new TypeError('Preset bevat een ongeldige compositie.');
  }
  return [];
}

function createLibrary() {
  return { format: 'fluxivora-motion-fx-library', version: 1, presets: [] };
}

function normalizeName(name) {
  if (typeof name !== 'string' || !name.trim()) throw new TypeError('Geef de preset een naam.');
  const normalized = name.trim();
  if (normalized.length > 60) throw new TypeError('Een presetnaam mag maximaal 60 tekens bevatten.');
  return normalized;
}

function addPreset(library, composition, name, id) {
  validateLibrary(library);
  if (library.presets.length >= MAX_PRESETS) throw new RangeError('De bibliotheek bevat maximaal ' + MAX_PRESETS + ' presets.');
  const normalized = MotionFX.normalizeComposition(composition);
  const presetName = normalizeName(name || normalized.name);
  const presetId = id || 'preset-' + Math.random().toString(36).slice(2, 12);
  if (library.presets.some(preset => preset.id === presetId)) throw new TypeError('Deze preset-ID bestaat al.');
  return {
    ...library,
    presets: [...library.presets, {
      id: presetId,
      name: presetName,
      updatedAt: new Date().toISOString(),
      composition: normalized
    }]
  };
}

function removePreset(library, id) {
  validateLibrary(library);
  if (!library.presets.some(preset => preset.id === id)) return library;
  return { ...library, presets: library.presets.filter(preset => preset.id !== id) };
}

function renamePreset(library, id, name) {
  validateLibrary(library);
  const normalized = normalizeName(name);
  let found = false;
  const presets = library.presets.map(preset => {
    if (preset.id !== id) return preset;
    found = true;
    return { ...preset, name: normalized, updatedAt: new Date().toISOString() };
  });
  if (!found) throw new TypeError('Preset niet gevonden.');
  return { ...library, presets };
}

function duplicatePreset(library, id, name) {
  validateLibrary(library);
  const source = library.presets.find(preset => preset.id === id);
  if (!source) throw new TypeError('Preset niet gevonden.');
  const copy = MotionFX.cloneComposition(source.composition, name || source.name + ' kopie');
  return addPreset(library, copy, name || source.name + ' kopie');
}

function serializeLibrary(library) {
  validateLibrary(library);
  const result = JSON.stringify(library, null, 2);
  if (Buffer.byteLength(result, 'utf8') > MAX_LIBRARY_BYTES) throw new RangeError('Motion FX-bibliotheek is te groot om te exporteren.');
  return result;
}

function parseLibrary(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_LIBRARY_BYTES) throw new TypeError('Bibliotheekbestand is ongeldig of te groot.');
  let value;
  try { value = JSON.parse(text); } catch { throw new TypeError('Bibliotheekbestand bevat geen geldige JSON.'); }
  validateLibrary(value);
  return value;
}

module.exports = { MAX_PRESETS, createLibrary, validateLibrary, addPreset, removePreset, renamePreset, duplicatePreset, serializeLibrary, parseLibrary };
