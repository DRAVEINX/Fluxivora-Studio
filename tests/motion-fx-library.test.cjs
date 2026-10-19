'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MotionFX = require('../src/motion-fx-composition.cjs');
const Library = require('../src/motion-fx-library.cjs');

function sampleComposition() {
  const composition = MotionFX.createComposition({ name: 'Logo intro', fps: 30 });
  composition.layers.push(MotionFX.createLayer('text', {
    id: 'headline', name: 'Titel',
    data: { text: 'Fluxivora Studio' },
    keyframes: [{ frame: 0, property: 'opacity', value: 0, interpolation: 'ease' }]
  }));
  return composition;
}

test('presetbibliotheek begint leeg en bewaart een gevalideerde compositie', () => {
  const library = Library.createLibrary();
  assert.deepEqual(Library.validateLibrary(library), []);
  const updated = Library.addPreset(library, sampleComposition(), 'Intro', 'intro');
  assert.equal(library.presets.length, 0, 'bewerking verandert oorspronkelijke bibliotheek niet');
  assert.equal(updated.presets.length, 1);
  assert.equal(updated.presets[0].composition.layers[0].data.text, 'Fluxivora Studio');
  assert.deepEqual(Library.validateLibrary(updated), []);
});

test('presetnamen worden genormaliseerd en begrensd', () => {
  const composition = sampleComposition();
  assert.throws(() => Library.addPreset(Library.createLibrary(), composition, '   '), /naam/);
  assert.throws(() => Library.addPreset(Library.createLibrary(), composition, 'x'.repeat(61)), /60 tekens/);
});

test('hernoemen, dupliceren en verwijderen werken zonder de bron te muteren', () => {
  let library = Library.addPreset(Library.createLibrary(), sampleComposition(), 'Intro', 'intro');
  library = Library.renamePreset(library, 'intro', 'Opening');
  assert.equal(library.presets[0].name, 'Opening');
  const duplicated = Library.duplicatePreset(library, 'intro', 'Opening kopie');
  assert.equal(duplicated.presets.length, 2);
  assert.notEqual(duplicated.presets[0].composition.id, duplicated.presets[1].composition.id);
  assert.equal(duplicated.presets[1].composition.layers[0].data.text, 'Fluxivora Studio');
  const removed = Library.removePreset(duplicated, 'intro');
  assert.deepEqual(removed.presets.map(preset => preset.id), [duplicated.presets[1].id]);
  assert.equal(library.presets.length, 1);
});

test('bibliotheek exporteert en importeert presets zonder gegevensverlies', () => {
  const library = Library.addPreset(Library.createLibrary(), sampleComposition(), 'Intro', 'intro');
  const reopened = Library.parseLibrary(Library.serializeLibrary(library));
  assert.deepEqual(reopened, library);
});

test('parser weigert corrupte, dubbele en te grote bibliotheken', () => {
  assert.throws(() => Library.parseLibrary('{broken'), /geldige JSON/);
  const library = Library.createLibrary();
  library.presets.push(
    { id: 'dup', name: 'A', composition: sampleComposition() },
    { id: 'dup', name: 'B', composition: sampleComposition() }
  );
  assert.throws(() => Library.validateLibrary(library), /dubbel/);
  assert.throws(() => Library.parseLibrary('x'.repeat(10 * 1024 * 1024 + 1)), /te groot/);
});

test('onbekende preset en overschrijding van de limiet worden afgewezen', () => {
  assert.throws(() => Library.renamePreset(Library.createLibrary(), 'missing', 'Naam'), /niet gevonden/);
  const library = Library.createLibrary();
  library.presets = Array.from({ length: Library.MAX_PRESETS }, (_, index) => ({
    id: 'p' + index, name: 'Preset ' + index, composition: sampleComposition()
  }));
  assert.throws(() => Library.addPreset(library, sampleComposition(), 'Te veel'), /maximaal/);
});

test('Motion FX JSON-import/export is aangesloten op de bestaande editorinterface', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const video = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');
  for (const id of ['motionfx-export-compositions', 'motionfx-import-compositions', 'motionfx-import-file']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Ontbrekend element: ' + id);
  }
  assert.match(video, /function exportMotionCompositions\(/);
  assert.match(video, /async function importMotionCompositions\(/);
  assert.match(video, /file\.size > 2 \* 1024 \* 1024/);
  assert.match(video, /merged\.length > 30/);
  assert.match(video, /motionfx-import-file.*change/);
});
