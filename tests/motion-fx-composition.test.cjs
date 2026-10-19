'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MotionFX = require('../src/motion-fx-composition.cjs');

test('nieuwe compositie heeft begrensde instellingen en een lege lagenlijst', () => {
  const composition = MotionFX.createComposition({ width: 99999, height: 0, fps: 240, durationFrames: -4 });
  assert.equal(composition.format, MotionFX.FORMAT);
  assert.equal(composition.version, 1);
  assert.equal(composition.settings.width, 7680);
  assert.equal(composition.settings.height, 16);
  assert.equal(composition.settings.fps, 120);
  assert.equal(composition.settings.durationFrames, 1);
  assert.deepEqual(composition.layers, []);
  assert.deepEqual(MotionFX.validateComposition(composition), []);
});

test('laagtypes en transformaties krijgen veilige standaardwaarden', () => {
  const layer = MotionFX.createLayer('shape', { transform: { x: 'NaN', opacity: 4, scaleX: -2 } });
  assert.equal(layer.type, 'shape');
  assert.equal(layer.transform.x, 0);
  assert.equal(layer.transform.opacity, 1);
  assert.equal(layer.transform.scaleX, -2);
  assert.equal(layer.timing.outFrame > layer.timing.inFrame, true);
  assert.throws(() => MotionFX.createLayer('unknown'), /Onbekend/);
});

test('compositie serializeert en opent opnieuw zonder gegevensverlies', () => {
  const composition = MotionFX.createComposition({ name: 'Intro animatie', fps: 30, durationFrames: 450 });
  const title = MotionFX.createLayer('text', {
    id: 'title-1', name: 'Hoofdtitel',
    transform: { x: 960, y: 540, opacity: 0.8 },
    timing: { inFrame: 0, outFrame: 450 },
    keyframes: [
      { frame: 0, property: 'opacity', value: 0, interpolation: 'ease' },
      { frame: 24, property: 'opacity', value: 1, interpolation: 'bezier' }
    ],
    data: { text: 'Fluxivora', fontSize: 120, fill: '#ffffff' }
  });
  composition.layers.push(title);
  const reopened = MotionFX.parseComposition(MotionFX.serializeComposition(composition));
  assert.equal(reopened.name, 'Intro animatie');
  assert.equal(reopened.settings.fps, 30);
  assert.equal(reopened.layers[0].data.text, 'Fluxivora');
  assert.deepEqual(reopened.layers[0].keyframes, title.keyframes);
  assert.deepEqual(MotionFX.validateComposition(reopened), []);
});

test('validator weigert dubbele IDs, onbekende formaten en ontbrekende ouderlagen', () => {
  const composition = MotionFX.createComposition();
  const a = MotionFX.createLayer('null', { id: 'controller' });
  const b = MotionFX.createLayer('shape', { id: 'shape', parentId: 'missing' });
  composition.layers.push(a, b);
  assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('Ouderlaag bestaat niet')));
  b.id = 'controller';
  assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('dubbel')));
  composition.format = 'other';
  assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('formaat')));
});

test('projectparser weigert ongeldige JSON, te grote invoer en ongeldige laagstructuren', () => {
  assert.throws(() => MotionFX.parseComposition('{broken'), /geldige JSON/);
  assert.throws(() => MotionFX.parseComposition('x'.repeat(25 * 1024 * 1024 + 1)), /te groot/);
  const invalid = MotionFX.createComposition();
  invalid.layers.push({ id: 'bad', type: 'nope' });
  assert.throws(() => MotionFX.parseComposition(JSON.stringify(invalid)), /Onbekend|Ongeldig/);
});

test('dupliceren maakt nieuwe laag-ID’s en behoudt ouder-kindrelaties en animaties', () => {
  const composition = MotionFX.createComposition({ name: 'Logo animatie' });
  composition.layers.push(
    MotionFX.createLayer('null', { id: 'parent' }),
    MotionFX.createLayer('shape', { id: 'child', parentId: 'parent', keyframes: [{ frame: 8, property: 'rotation', value: 180 }] })
  );
  const copy = MotionFX.cloneComposition(composition);
  assert.notEqual(copy.id, composition.id);
  assert.equal(copy.name, 'Logo animatie kopie');
  assert.notEqual(copy.layers[0].id, composition.layers[0].id);
  assert.equal(copy.layers[1].parentId, copy.layers[0].id);
  assert.deepEqual(copy.layers[1].keyframes, composition.layers[1].keyframes);
  assert.deepEqual(MotionFX.validateComposition(copy), []);
});


test('validator en parser weigeren circulaire ouder-kindrelaties', () => {
  const composition = MotionFX.createComposition();
  composition.layers.push(
    MotionFX.createLayer('null', { id: 'root-a', parentId: 'group-b' }),
    MotionFX.createLayer('null', { id: 'group-b', parentId: 'shape-c' }),
    MotionFX.createLayer('shape', { id: 'shape-c', parentId: 'root-a' })
  );
  assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('Circulaire ouder-kindrelatie')));
  assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /Circulaire ouder-kindrelatie/);
});


test('validator weigert niet-numerieke transforms en ongeldige keyframes', () => {
  const composition = MotionFX.createComposition();
  const layer = MotionFX.createLayer('shape', { id: 'validated-layer' });
  composition.layers.push(layer);
  layer.transform.x = '12';
  layer.keyframes.push({ frame: 3, property: 'opacity', value: Infinity, interpolation: 'linear' });
  const errors = MotionFX.validateComposition(composition);
  assert.ok(errors.some(error => error.includes('Ongeldige transformatiewaarde: x')));
  assert.ok(errors.some(error => error.includes('Ongeldig keyframe')));
  assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /Ongeldige transformatiewaarde|Ongeldig keyframe/);

  const invalidOpacity = MotionFX.createComposition();
  const opacityLayer = MotionFX.createLayer('shape', { id: 'bad-opacity' });
  opacityLayer.transform.opacity = 1.5;
  invalidOpacity.layers.push(opacityLayer);
  assert.ok(MotionFX.validateComposition(invalidOpacity).some(error => error.includes('Ongeldige transformatiewaarde: opacity')));

  const invalidTiming = MotionFX.createComposition();
  const timingLayer = MotionFX.createLayer('shape', { id: 'bad-timing' });
  timingLayer.timing.inFrame = MotionFX.MAX_FRAMES + 1;
  invalidTiming.layers.push(timingLayer);
  assert.ok(MotionFX.validateComposition(invalidTiming).some(error => error.includes('Ongeldige laagduur')));
});

test('parser weigert expliciet onbekende projectformaten en versies', () => {
  const composition = MotionFX.createComposition();
  assert.throws(() => MotionFX.parseComposition(JSON.stringify({ ...composition, format: 'other' })), /projectformaat/);
  assert.throws(() => MotionFX.parseComposition(JSON.stringify({ ...composition, version: 999 })), /projectversie/);
});


test('parser weigert ongeldige achtergrondkleuren en pixelverhoudingen', () => {
  const composition = MotionFX.createComposition();
  assert.throws(() => MotionFX.parseComposition(JSON.stringify({
    ...composition, settings: { ...composition.settings, background: 'url(javascript:alert(1))' }
  })), /achtergrondkleur/);
  assert.throws(() => MotionFX.parseComposition(JSON.stringify({
    ...composition, settings: { ...composition.settings, pixelAspect: 100 }
  })), /pixelverhouding/);
  assert.deepEqual(MotionFX.validateComposition(composition), []);
});


test('validator weigert ontbrekende verplichte achtergrond- en pixelverhoudinginstellingen', () => {
  const composition = MotionFX.createComposition();
  const missingBackground = { ...composition, settings: { ...composition.settings } };
  delete missingBackground.settings.background;
  assert.ok(MotionFX.validateComposition(missingBackground).some(error => error.includes('Achtergrondkleur ontbreekt')));
  const missingPixelAspect = { ...composition, settings: { ...composition.settings } };
  delete missingPixelAspect.settings.pixelAspect;
  assert.ok(MotionFX.validateComposition(missingPixelAspect).some(error => error.includes('Pixelverhouding ontbreekt')));
});

test('validator en parser weigeren lege of te lange laagnamen', () => {
  for (const name of ['', '   ', 'x'.repeat(129)]) {
    const composition = MotionFX.createComposition();
    composition.layers.push(MotionFX.createLayer('shape', { id: 'named-layer', name: 'Valid' }));
    composition.layers[0].name = name;
    assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('Ongeldige laagnaam')));
    assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /Ongeldige laagnaam/);
  }
});

test('validator en parser weigeren lege, niet-tekstuele of te lange ouderlaag-ID’s', () => {
  for (const parentId of ['', 42, 'x'.repeat(129)]) {
    const composition = MotionFX.createComposition();
    composition.layers.push(MotionFX.createLayer('null', { id: 'parent' }));
    const child = MotionFX.createLayer('shape', { id: 'child', parentId: 'parent' });
    child.parentId = parentId;
    composition.layers.push(child);
    assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('Ongeldige ouderlaag-ID')));
    assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /Ongeldige ouderlaag-ID/);
  }
});

test('validator en parser weigeren ontbrekende en te lange laag-ID’s', () => {
  const missingId = MotionFX.createComposition();
  missingId.layers.push(MotionFX.createLayer('shape', { id: 'valid-id' }));
  missingId.layers[0].id = '';
  assert.ok(MotionFX.validateComposition(missingId).some(error => error.includes('Laag-ID ontbreekt')));
  assert.throws(() => MotionFX.parseComposition(JSON.stringify(missingId)), /Laag-ID ontbreekt/);

  const longId = MotionFX.createComposition();
  longId.layers.push(MotionFX.createLayer('shape', { id: 'valid-id' }));
  longId.layers[0].id = 'x'.repeat(129);
  assert.ok(MotionFX.validateComposition(longId).some(error => error.includes('Laag-ID ontbreekt')));
  assert.throws(() => MotionFX.parseComposition(JSON.stringify(longId)), /Laag-ID ontbreekt/);
});

test('validator en parser weigeren laag-ID’s die alleen uit witruimte bestaan', () => {
  const composition = MotionFX.createComposition();
  composition.layers.push(MotionFX.createLayer('shape', { id: 'valid-id' }));
  composition.layers[0].id = '   ';
  assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('Laag-ID ontbreekt')));
  assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /Laag-ID ontbreekt/);
});

test('validator en parser weigeren lege, witruimte-only en te lange keyframe-eigenschappen', () => {
  for (const property of ['', '   ', 'x'.repeat(129)]) {
    const composition = MotionFX.createComposition();
    const layer = MotionFX.createLayer('shape', { id: 'keyframe-property-layer' });
    layer.keyframes.push({ frame: 1, property, value: 0.5, interpolation: 'linear' });
    composition.layers.push(layer);
    assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('Ongeldig keyframe')));
    assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /Ongeldig keyframe/);
  }
});

test('validator en parser weigeren lege of witruimte-only compositie-ID’s en namen', () => {
  for (const id of ['', '   ']) {
    const composition = MotionFX.createComposition();
    composition.id = id;
    assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('compositie-ID')));
    assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /compositie-ID/);
  }
  for (const name of ['', '   ']) {
    const composition = MotionFX.createComposition();
    composition.name = name;
    assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('compositienaam')));
    assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /compositienaam/);
  }
});

test('validator en parser weigeren ouderlaag-ID’s die alleen uit witruimte bestaan', () => {
  const composition = MotionFX.createComposition();
  const layer = MotionFX.createLayer('shape', { id: 'child', parentId: '   ' });
  composition.layers.push(layer);
  assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('Ongeldige ouderlaag-ID')));
  assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /Ongeldige ouderlaag-ID/);
});

test('validator en parser herkennen dubbele laag-ID’s ook bij afwijkende spaties', () => {
  const composition = MotionFX.createComposition();
  composition.layers.push(
    MotionFX.createLayer('shape', { id: 'shared-id' }),
    MotionFX.createLayer('text', { id: ' shared-id ' })
  );
  assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('Laag-ID ontbreekt, is ongeldig of is dubbel')));
  assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /Laag-ID ontbreekt, is ongeldig of is dubbel/);
});

test('validator en parser weigeren voor- en achterspaties in laag-ID’s en ouderlaag-ID’s', () => {
  const paddedLayerId = MotionFX.createComposition();
  paddedLayerId.layers.push(MotionFX.createLayer('shape', { id: ' padded-id ' }));
  assert.ok(MotionFX.validateComposition(paddedLayerId).some(error => error.includes('Laag-ID ontbreekt, is ongeldig of is dubbel')));
  assert.throws(() => MotionFX.parseComposition(JSON.stringify(paddedLayerId)), /Laag-ID ontbreekt, is ongeldig of is dubbel/);

  const paddedParentId = MotionFX.createComposition();
  paddedParentId.layers.push(
    MotionFX.createLayer('shape', { id: 'parent' }),
    MotionFX.createLayer('text', { id: 'child', parentId: ' parent ' })
  );
  assert.ok(MotionFX.validateComposition(paddedParentId).some(error => error.includes('Ongeldige ouderlaag-ID')));
  assert.throws(() => MotionFX.parseComposition(JSON.stringify(paddedParentId)), /Ongeldige ouderlaag-ID/);
});

test('validator en parser weigeren compositie-ID’s en namen met voor- of achterspaties', () => {
  for (const id of [' padded-id', 'padded-id ']) {
    const composition = MotionFX.createComposition();
    composition.id = id;
    assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('compositie-ID')));
    assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /compositie-ID/);
  }
  for (const name of [' padded-name', 'padded-name ']) {
    const composition = MotionFX.createComposition();
    composition.name = name;
    assert.ok(MotionFX.validateComposition(composition).some(error => error.includes('compositienaam')));
    assert.throws(() => MotionFX.parseComposition(JSON.stringify(composition)), /compositienaam/);
  }
});

test('pixelAspect behouden bij opslaan en opnieuw openen', () => {
  const composition = MotionFX.createComposition({ pixelAspect: 1.25 });
  assert.equal(composition.settings.pixelAspect, 1.25);
  const reopened = MotionFX.parseComposition(MotionFX.serializeComposition(composition));
  assert.equal(reopened.settings.pixelAspect, 1.25);
  assert.deepEqual(MotionFX.validateComposition(reopened), []);
});

test('pixelAspect van een nieuwe compositie blijft binnen veilige grenzen', () => {
  assert.equal(MotionFX.createComposition({ pixelAspect: 0 }).settings.pixelAspect, 0.1);
  assert.equal(MotionFX.createComposition({ pixelAspect: 20 }).settings.pixelAspect, 10);
});

test('gekopieerde compositie behoudt pixelAspect en krijgt eigen identiteit', () => {
  const composition = MotionFX.createComposition({ id: 'original-comp', name: 'Origineel', pixelAspect: 1.25 });
  composition.layers.push(MotionFX.createLayer('shape', { id: 'original-layer' }));

  const clone = MotionFX.cloneComposition(composition, 'Kopie');

  assert.equal(clone.settings.pixelAspect, 1.25);
  assert.equal(clone.name, 'Kopie');
  assert.notEqual(clone.id, composition.id);
  assert.notEqual(clone.layers[0].id, composition.layers[0].id);
  assert.deepEqual(MotionFX.validateComposition(clone), []);
});

test('kopie behoudt alle compositie-instellingen en is onafhankelijk van het origineel', () => {
  const composition = MotionFX.createComposition({
    id: 'settings-source', name: 'Bron', width: 1280, height: 720,
    fps: 30, durationFrames: 900, background: '#123456', pixelAspect: 1.5
  });
  const layer = MotionFX.createLayer('text', {
    id: 'settings-layer',
    data: { text: 'Hallo', style: { fill: '#ffffff' } },
    keyframes: [{ frame: 0, property: 'opacity', value: 1, interpolation: 'linear' }]
  });
  composition.layers.push(layer);

  const clone = MotionFX.cloneComposition(composition);
  assert.deepEqual(clone.settings, composition.settings);
  clone.layers[0].data.style.fill = '#000000';
  clone.layers[0].keyframes[0].value = 0;

  assert.equal(composition.layers[0].data.style.fill, '#ffffff');
  assert.equal(composition.layers[0].keyframes[0].value, 1);
  assert.deepEqual(MotionFX.validateComposition(clone), []);
});

test('cloneComposition weigert ongeldige broncomposities', () => {
  const invalid = MotionFX.createComposition();
  invalid.settings.pixelAspect = 0;
  assert.throws(() => MotionFX.cloneComposition(invalid), /Ongeldige pixelverhouding/);

  const invalidLayer = MotionFX.createComposition();
  const layer = MotionFX.createLayer('shape', { id: 'invalid-layer' });
  layer.transform.opacity = 2;
  invalidLayer.layers.push(layer);
  assert.throws(() => MotionFX.cloneComposition(invalidLayer), /Ongeldige transformatiewaarde: opacity/);
});
