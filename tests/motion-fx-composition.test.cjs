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
