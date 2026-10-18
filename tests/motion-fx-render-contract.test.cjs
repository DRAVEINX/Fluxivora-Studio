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
