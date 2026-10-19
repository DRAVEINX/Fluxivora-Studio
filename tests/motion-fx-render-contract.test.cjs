'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const studio = fs.readFileSync(path.join(root, 'src', 'video-studio.js'), 'utf8');

test('Motion FX runtime loads before the video studio', () => {
  const runtime = html.indexOf('motion-fx-runtime.js');
  const studioScript = html.indexOf('video-studio.js');
  assert.notEqual(runtime, -1, 'runtime script must be present');
  assert.notEqual(studioScript, -1, 'video studio script must be present');
  assert.ok(runtime < studioScript, 'runtime must load before video studio');
});

test('Preview animates primary and secondary mask geometry from keyframes', () => {
  assert.match(studio, /maskPath\(c\.maskType, animatedValue\(c, 'maskSize'/);
  assert.match(studio, /animatedValue\(c, 'maskX'/);
  assert.match(studio, /animatedValue\(c, 'maskY'/);
  assert.match(studio, /maskPath\(secondaryType, animatedValue\(c, 'maskSecondarySize'/);
  assert.match(studio, /animatedValue\(c, 'maskSecondaryX'/);
  assert.match(studio, /animatedValue\(c, 'maskSecondaryY'/);
});

test('Offline animated values use the shared Motion FX runtime with Bézier support', () => {
  const start = studio.indexOf('function exportAnimatedValue(');
  assert.notEqual(start, -1, 'offline interpolation helper must exist');
  const end = studio.indexOf('\n  function exportAudioGain', start);
  assert.ok(end > start, 'offline interpolation helper must have a clear boundary');
  const helper = studio.slice(start, end);
  assert.match(helper, /window\.FluxivoraMotionFxRuntime\?\.interpolateProperty/);
  assert.match(helper, /window\.FluxivoraKeyframeCurves[\s\S]*?bezierValue/);
});

test('Offline video export renders each frame through the shared preview renderer', () => {
  const frameStart = studio.indexOf('async function renderTimelineFrame(time)');
  assert.notEqual(frameStart, -1, 'offline frame renderer must exist');
  const frameEnd = studio.indexOf('\n  function toBase64', frameStart);
  assert.ok(frameEnd > frameStart, 'offline frame renderer must have a clear boundary');
  const frameRenderer = studio.slice(frameStart, frameEnd);
  assert.match(frameRenderer, /state\.playhead\s*=\s*Math\.max\(0,\s*time\)/);
  assert.match(frameRenderer, /renderPreview\(\)/);
  assert.match(frameRenderer, /await Promise\.all\(activeVideos\.map/);

  const exportStart = studio.indexOf('for (let index = 0; index < frameCount; index++)');
  assert.notEqual(exportStart, -1, 'offline export frame loop must exist');
  const exportEnd = studio.indexOf('await audioTask', exportStart);
  assert.ok(exportEnd > exportStart, 'offline export loop must have a clear boundary');
  const exportLoop = studio.slice(exportStart, exportEnd);
  assert.match(exportLoop, /await renderTimelineFrame\(time\)/);
  assert.match(exportLoop, /canvas\.toDataURL\('image\/jpeg',\s*0\.92\)/);
});

test('Shared preview renderer evaluates Motion FX layers before drawing clips', () => {
  const start = studio.indexOf('function renderPreview()');
  assert.notEqual(start, -1, 'preview renderer must exist');
  const end = studio.indexOf('\n  function updateTransport', start);
  assert.ok(end > start, 'preview renderer must have a clear boundary');
  const renderer = studio.slice(start, end);
  assert.match(renderer, /evaluateMotionFxLayers\(\)/);
  assert.match(renderer, /drawWithParentTransform\(ctx, c/);
  assert.match(renderer, /state\.motionFxLayers\.get\(c\.id\)\?\.visible !== false/);
});

test('Motion FX composition import validates size, format and graphic-layer limits', () => {
  const start = studio.indexOf('async function importMotionCompositions(file)');
  assert.notEqual(start, -1, 'composition import handler must exist');
  const end = studio.indexOf('\n  function renderMotionCompositions', start);
  assert.ok(end > start, 'composition import handler must have a clear boundary');
  const importer = studio.slice(start, end);
  assert.match(importer, /file\.size > 2 \* 1024 \* 1024/);
  assert.match(importer, /parsed\.format === 'fluxivora-motion-compositions' && parsed\.version === 1/);
  assert.match(importer, /imported\.length > 30/);
  assert.match(importer, /candidate\.layers\.length > 30/);
  assert.match(importer, /layer\.type !== 'title'/);
  assert.match(importer, /keyframes\.slice\(0, 1000\)/);
  assert.match(importer, /!Number\.isFinite\(frame\.time\) \|\| frame\.time < 0/);
  assert.match(importer, /ongeldige keyframes/);
  assert.match(importer, /effects\.slice\(0, 100\)/);
  assert.match(importer, /ongeldige effecten/);
});

test('Inserting a saved Motion FX composition supports undo and clones animated data', () => {
  const start = studio.indexOf('function handleMotionCompositionAction(event)');
  assert.notEqual(start, -1, 'composition actions must exist');
  const end = studio.indexOf('\n  function refresh()', start);
  assert.ok(end > start, 'composition action handler must have a clear boundary');
  const handler = studio.slice(start, end);
  assert.match(handler, /button\.dataset\.compositionAction !== 'insert'/);
  assert.match(handler, /pushHistory\(\)/);
  assert.match(handler, /keyframes: Array\.isArray\(layer\.keyframes\) \? layer\.keyframes\.map\(frame => \(\{ \.\.\.frame \}\)\)/);
  assert.match(handler, /effects: Array\.isArray\(layer\.effects\) \? layer\.effects\.map\(effect => \(\{ \.\.\.effect \}\)\)/);
  assert.match(handler, /compositionName: item\.name/);
});
