const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FPS, SAMPLE_RATE, MAX_FRAMES, safeFileStem, validateRenderRequest,
  decodeJpegFrame, decodeFloatAudioChunk, buildFfmpegArgs
} = require('../electron/video-render.cjs');

test('offline MP4 render validates supported resolutions and caps render duration', () => {
  assert.equal(FPS, 25);
  assert.equal(SAMPLE_RATE, 48000);
  assert.equal(MAX_FRAMES, 22500);
  assert.deepEqual(
    (({ width, height, fps, frameCount, durationSeconds }) =>
      ({ width, height, fps, frameCount, durationSeconds }))(
      validateRenderRequest({ size: '1080p', fps: 25, frameCount: 250, name: 'Mijn film' })),
    { width: 1920, height: 1080, fps: 25, frameCount: 250, durationSeconds: 10 }
  );
  assert.equal(validateRenderRequest({ size: '4k', fps: 25, frameCount: 2 }).width, 3840);
  assert.throws(() => validateRenderRequest({ size: '8k', fps: 25, frameCount: 250 }), /720p, 1080p of 4K/);
  assert.throws(() => validateRenderRequest({ size: '720p', fps: 30, frameCount: 250 }), /25 beelden/);
  assert.throws(() => validateRenderRequest({ size: '720p', fps: 25, frameCount: MAX_FRAMES + 1 }), /15 minuten/);
});

test('offline render filenames are safe and bounded', () => {
  assert.equal(safeFileStem('film: finale/2026?.mp4'), 'film finale 2026 .mp4');
  assert.equal(safeFileStem('...  '), 'Fluxivora-video');
  assert.ok(safeFileStem('x'.repeat(200)).length <= 96);
});

test('only bounded JPEG frames and finite stereo Float32 audio chunks pass validation', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  assert.deepEqual(decodeJpegFrame(jpeg), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.throws(() => decodeJpegFrame(Buffer.from('not jpeg').toString('base64')), /geen geldige JPEG/);
  assert.throws(() => decodeJpegFrame('x'), /Base64-data/);

  const audio = Buffer.alloc(8);
  audio.writeFloatLE(0.25, 0);
  audio.writeFloatLE(-0.25, 4);
  assert.deepEqual(decodeFloatAudioChunk(audio.toString('base64')), audio);
  assert.throws(() => decodeFloatAudioChunk(Buffer.from([1, 2, 3, 4]).toString('base64')), /stereo Float32/);
  const invalid = Buffer.alloc(8);
  invalid.writeFloatLE(Number.NaN, 0);
  assert.throws(() => decodeFloatAudioChunk(invalid.toString('base64')), /ongeldig audiomonster/);
});

test('FFmpeg pipeline reads frame and offline audio pipes and encodes MP4 H.264/AAC', () => {
  const args = buildFfmpegArgs({
    width: 1920, height: 1080, fps: 25, frameCount: 250,
    durationSeconds: 10, outputPath: 'C:\\\\exports\\\\film.partial.mp4'
  });
  const has = (...parts) => {
    for (let i = 0; i <= args.length - parts.length; i++) {
      if (parts.every((part, offset) => args[i + offset] === part)) return true;
    }
    return false;
  };
  assert.ok(has('-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', '25', '-i', 'pipe:0'));
  assert.ok(has('-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', 'pipe:3'));
  assert.ok(has('-c:v', 'libx264', '-preset', 'medium', '-crf', '18'));
  assert.ok(has('-c:a', 'aac', '-b:a', '192k'));
  assert.ok(has('-frames:v', '250'));
  assert.ok(has('-movflags', '+faststart'));
  assert.equal(args.at(-1), 'C:\\\\exports\\\\film.partial.mp4');
  assert.throws(() => buildFfmpegArgs({ width: 1920, height: 720, fps: 25, frameCount: 250, durationSeconds: 10, outputPath: 'x.mp4' }), /afmetingen/);
});
