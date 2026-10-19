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
  if (!allowed.has(type)) throw new TypeError('Onbekend laagtype: ' + type);
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
  if (typeof value.id !== 'string' || !value.id.trim() || value.id !== value.id.trim() || value.id.length > 128) errors.push('Ongeldige compositie-ID.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name !== value.name.trim() || value.name.length > 128) errors.push('Ongeldige compositienaam.');
  const settings = value.settings;
  if (!settings || !Number.isInteger(settings.width) || settings.width < 16 || settings.width > 7680 ||
      !Number.isInteger(settings.height) || settings.height < 16 || settings.height > 4320 ||
      !Number.isFinite(settings.fps) || settings.fps < 1 || settings.fps > 120 ||
      !Number.isInteger(settings.durationFrames) || settings.durationFrames < 1 || settings.durationFrames > MAX_FRAMES) {
    errors.push('Ongeldige compositie-instellingen.');
  }
  // Keep imported background values predictable for canvas, preview and export rendering.
  if (settings && settings.background != null &&
      (typeof settings.background !== 'string' || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(settings.background))) {
    errors.push('Ongeldige achtergrondkleur.');
  }
  if (settings && settings.pixelAspect != null &&
      (!Number.isFinite(settings.pixelAspect) || settings.pixelAspect < 0.1 || settings.pixelAspect > 10)) {
    errors.push('Ongeldige pixelverhouding.');
  }
  if (settings && settings.background == null) errors.push('Achtergrondkleur ontbreekt.');
  if (settings && settings.pixelAspect == null) errors.push('Pixelverhouding ontbreekt.');
  if (!Array.isArray(value.layers) || value.layers.length > MAX_LAYERS) {
    errors.push('Ongeldige lagenlijst (maximaal ' + MAX_LAYERS + ' lagen).');
  } else {
    const ids = new Set();
    for (const layer of value.layers) {
      if (!layer || typeof layer.id !== 'string' || !layer.id.trim() || layer.id !== layer.id.trim() || layer.id.length > 128 || ids.has(layer.id.trim())) errors.push('Laag-ID ontbreekt, is ongeldig of is dubbel.');
      else ids.add(layer.id.trim());
      if (layer && (typeof layer.name !== 'string' || !layer.name.trim() || layer.name.length > 128)) errors.push('Ongeldige laagnaam.');
      if (!['shape', 'text', 'media', 'null'].includes(layer?.type)) errors.push('Ongeldig laagtype.');
      if (!layer?.transform || typeof layer.transform !== 'object' || !layer?.timing || typeof layer.timing !== 'object' || !Array.isArray(layer?.keyframes)) {
        errors.push('Laag mist transform-, timing- of keyframegegevens.');
      } else {
        const transformBounds = {
          x: [-100000, 100000], y: [-100000, 100000],
          anchorX: [-10, 10], anchorY: [-10, 10],
          rotation: [-360000, 360000], scaleX: [-100, 100],
          scaleY: [-100, 100], opacity: [0, 1]
        };
        for (const [property, [min, max]] of Object.entries(transformBounds)) {
          const current = layer.transform[property];
          if (!Number.isFinite(current) || current < min || current > max) {
            errors.push('Ongeldige transformatiewaarde: ' + property + '.');
          }
        }
        if (!Number.isInteger(layer.timing.inFrame) || !Number.isInteger(layer.timing.outFrame) ||
            layer.timing.inFrame < 0 || layer.timing.inFrame > MAX_FRAMES ||
            layer.timing.outFrame < 1 || layer.timing.outFrame > MAX_FRAMES ||
            layer.timing.outFrame <= layer.timing.inFrame) {
          errors.push('Ongeldige laagduur.');
        }
        if (layer.keyframes.length > 10000) errors.push('Te veel keyframes op één laag.');
        for (const keyframe of layer.keyframes) {
          if (!keyframe || !Number.isInteger(keyframe.frame) || keyframe.frame < 0 || keyframe.frame > MAX_FRAMES ||
              typeof keyframe.property !== 'string' || !keyframe.property.trim() || keyframe.property.length > 128 || !Number.isFinite(keyframe.value) ||
              !['hold', 'linear', 'ease', 'bezier'].includes(keyframe.interpolation)) {
            errors.push('Ongeldig keyframe in laag ' + (layer.id || '(zonder ID)') + '.');
            break;
          }
        }
      }
      if (layer?.parentId != null && (typeof layer.parentId !== 'string' || !layer.parentId.trim() || layer.parentId !== layer.parentId.trim() || layer.parentId.length > 128)) errors.push('Ongeldige ouderlaag-ID.');
      if (layer?.data != null && (typeof layer.data !== 'object' || Array.isArray(layer.data))) errors.push('Ongeldige laaggegevens.');
      if (layer?.parentId && layer.parentId === layer.id) errors.push('Een laag kan niet zichzelf als ouder hebben.');
    }
    for (const layer of value.layers) if (layer?.parentId && !ids.has(layer.parentId)) errors.push('Ouderlaag bestaat niet: ' + layer.parentId);

    // Reject parent cycles while the project is being validated/imported,
    // rather than waiting for the evaluator to discover them at playback.
    const byId = new Map(value.layers.filter(layer => layer && typeof layer.id === 'string' && layer.id).map(layer => [layer.id, layer]));
    const visited = new Set();
    const visiting = new Set();
    function visitParentChain(layer) {
      if (visited.has(layer.id)) return;
      if (visiting.has(layer.id)) {
        errors.push('Circulaire ouder-kindrelatie gedetecteerd.');
        return;
      }
      visiting.add(layer.id);
      const parent = layer.parentId && byId.get(layer.parentId);
      if (parent) visitParentChain(parent);
      visiting.delete(layer.id);
      visited.add(layer.id);
    }
    for (const layer of byId.values()) visitParentChain(layer);
  }
  return [...new Set(errors)];
}

function normalizeComposition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Ongeldig Motion FX-project.');
  if (value.format !== FORMAT) throw new TypeError('Onbekend Motion FX-projectformaat.');
  if (value.version !== VERSION) throw new TypeError('Niet-ondersteunde Motion FX-projectversie.');
  if (typeof value.id !== 'string' || !value.id || value.id.length > 128) throw new TypeError('Ongeldige compositie-ID.');
  if (typeof value.name !== 'string' || !value.name || value.name.length > 128) throw new TypeError('Ongeldige compositienaam.');
  // Validate the untrusted input before createLayer() normalizes/coerces values.
  // Otherwise malformed transforms and keyframes (for example a numeric string
  // or JSON null where Infinity was serialized) could be silently repaired.
  const inputErrors = validateComposition(value);
  if (inputErrors.length) throw new TypeError(inputErrors.join(' '));
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
