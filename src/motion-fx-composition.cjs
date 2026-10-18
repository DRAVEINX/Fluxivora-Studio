'use strict';

const FORMAT = 'fluxivora-motion-fx';
const VERSION = 1;
const MAX_LAYERS = 500;
const MAX_FRAMES = 60 * 60 * 60;

function makeId(prefix = 'layer') {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}

function finite(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function createComposition(options = {}) {
  const width = Math.round(finite(options.width, 1920, 16, 7680));
  const height = Math.round(finite(options.height, 1080, 16, 4320));
  const fps = finite(options.fps, 25, 1, 120);
  const durationFrames = Math.round(finite(options.durationFrames, fps * 10, 1, MAX_FRAMES));
  return {
    format: FORMAT,
    version: VERSION,
    id: String(options.id || makeId('comp')).slice(0, 128),
    name: String(options.name || 'Nieuwe compositie').trim().slice(0, 128) || 'Nieuwe compositie',
    settings: { width, height, fps, durationFrames, background: String(options.background || '#101014').slice(0, 32), pixelAspect: 1 },
    layers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createLayer(type, options = {}) {
  const allowed = new Set(['shape', 'text', 'media', 'null']);
  if (!allowed.has(type)) throw new TypeError('Onbekend la type: ' + type);
  const now = new Date().toISOString();
  const layer = {
    id: String(options.id || makeId(type)).slice(0, 128),
    name: String(options.name || (type === 'shape' ? 'Vorm' : type === 'text' ? 'Tekst' : type === 'media' ? 'Media' : 'Controller')).slice(0, 128),
    type,
    enabled: options.enabled !== false,
    locked: options.locked === true,
    parentId: options.parentId == null ? null : String(options.parentId).slice(0, 128),
    transform: {
      x: finite(options.transform?.x, 0, -100000, 100000),
      y: finite(options.transform?.y, 0, -100000, 100000),
      anchorX: finite(options.transform?.anchorX, 0.5, -10, 10),
      anchorY: finite(options.transform?.anchorY, 0.5, -10, 10),
      rotation: finite(options.transform?.rotation, 0, -360000, 360000),
      scaleX: finite(options.transform?.scaleX, 1, -100, 100),
      scaleY: finite(options.transform?.scaleY, 1, -100, 100),
      opacity: finite(options.transform?.opacity, 1, 0, 1)
    },
    timing: {
      inFrame: Math.round(finite(options.timing?.inFrame, 0, 0, MAX_FRAMES)),
      outFrame: Math.round(finite(options.timing?.outFrame, 250, 1, MAX_FRAMES))
    },
    keyframes: Array.isArray(options.keyframes) ? options.keyframes.slice(0, 10000).map(keyframe => ({
      frame: Math.round(finite(keyframe?.frame, 0, 0, MAX_FRAMES)),
      property: String(keyframe?.property || 'opacity').slice(0, 64),
      value: finite(keyframe?.value, 0, -100000, 100000),
      interpolation: ['hold', 'linear', 'ease', 'bezier'].includes(keyframe?.interpolation) ? keyframe.interpolation : 'linear'
    })) : [],
    data: options.data && typeof options.data === 'object' && !Array.isArray(options.data) ? structuredClone(options.data) : {},
    createdAt: now
  };
  if (layer.timing.outFrame <= layer.timing.inFrame) layer.timing.outFrame = Math.min(MAX_FRAMES, layer.timing.inFrame + 1);
  return layer;
}

function validateComposition(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Project moet een object zijn.'];
  if (value.format !== FORMAT) errors.push('Onbekend Motion FX-projectformaat.');
  if (value.version !== VERSION) errors.push('Niet-ondersteunde Motion FX-projectversie.');
  if (typeof value.id !== 'string' || !value.id || value.id.length > 128) errors.push('Ongeldige compositie-ID.');
  if (typeof value.name !== 'string' || !value.name || value.name.length > 128) errors.push('Ongeldige compositienaam.');
  const settings = value.settings;
  if (!settings || !Number.isInteger(settings.width) || settings.width < 16 || settings.width > 7680 ||
      !Number.isInteger(settings.height) || settings.height < 16 || settings.height > 4320 ||
      !Number.isFinite(settings.fps) || settings.fps < 1 || settings.fps > 120 ||
      !Number.isInteger(settings.durationFrames) || settings.durationFrames < 1 || settings.durationFrames > MAX_FRAMES) {
    errors.push('Ongeldige compositie-instellingen.');
  }
  if (!Array.isArray(value.layers) || value.layers.length > MAX_LAYERS) {
    errors.push('Ongeldige lagenlijst (maximaal ' + MAX_LAYERS + ' lagen).');
  } else {
    const ids = new Set();
    for (const layer of value.layers) {
      if (!layer || typeof layer.id !== 'string' || !layer.id || ids.has(layer.id)) errors.push('Laag-ID ontbreekt of is dubbel.');
      else ids.add(layer.id);
      if (!['shape', 'text', 'media', 'null'].includes(layer?.type)) errors.push('Ongeldig laagtype.');
      if (!layer?.transform || !layer?.timing || !Array.isArray(layer?.keyframes)) errors.push('Laag mist transform-, timing- of keyframegegevens.');
      if (layer?.timing && (!Number.isInteger(layer.timing.inFrame) || !Number.isInteger(layer.timing.outFrame) || layer.timing.inFrame < 0 || layer.timing.outFrame <= layer.timing.inFrame)) errors.push('Ongeldige laagduur.');
      if (layer?.parentId && layer.parentId === layer.id) errors.push('Een laag kan niet zichzelf als ouder hebben.');
    }
    for (const layer of value.layers) if (layer?.parentId && !ids.has(layer.parentId)) errors.push('Ouderlaag bestaat niet: ' + layer.parentId);
  }
  return [...new Set(errors)];
}

function normalizeComposition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Ongeldig Motion FX-project.');
  const settings = value.settings || {};
  const composition = createComposition({
    id: value.id, name: value.name, width: settings.width, height: settings.height,
    fps: settings.fps, durationFrames: settings.durationFrames, background: settings.background
  });
  composition.createdAt = typeof value.createdAt === 'string' ? value.createdAt : composition.createdAt;
  composition.updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : composition.updatedAt;
  if (!Array.isArray(value.layers) || value.layers.length > MAX_LAYERS) throw new TypeError('Ongeldige lagenlijst.');
  composition.layers = value.layers.map(layer => createLayer(layer?.type, layer));
  const errors = validateComposition(composition);
  if (errors.length) throw new TypeError(errors.join(' '));
  return composition;
}

function serializeComposition(value) {
  const normalized = normalizeComposition(value);
  return JSON.stringify(normalized, null, 2);
}

function parseComposition(text) {
  if (typeof text !== 'string' || text.length > 25 * 1024 * 1024) throw new TypeError('Projectbestand is ongeldig of te groot.');
  let value;
  try { value = JSON.parse(text); } catch { throw new TypeError('Projectbestand bevat geen geldige JSON.'); }
  return normalizeComposition(value);
}

function cloneComposition(value, name) {
  const source = normalizeComposition(value);
  const clone = createComposition({ ...source, id: makeId('comp'), name: name || source.name + ' kopie', ...source.settings });
  clone.layers = source.layers.map(layer => {
    const copy = createLayer(layer.type, { ...layer, id: makeId(layer.type), parentId: null });
    copy.keyframes = layer.keyframes.map(keyframe => ({ ...keyframe }));
    copy.data = structuredClone(layer.data);
    return copy;
  });
  const idMap = new Map(source.layers.map((layer, index) => [layer.id, clone.layers[index].id]));
  clone.layers.forEach((layer, index) => {
    const parentId = source.layers[index].parentId;
    layer.parentId = parentId ? idMap.get(parentId) || null : null;
  });
  return clone;
}

module.exports = { FORMAT, VERSION, MAX_LAYERS, createComposition, createLayer, validateComposition, normalizeComposition, serializeComposition, parseComposition, cloneComposition };
