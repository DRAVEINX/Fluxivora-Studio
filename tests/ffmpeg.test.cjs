const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const ffmpegPath = require('ffmpeg-static');
const { buildFfmpegArgs } = require('../electron/video-render.cjs');

test('bundled FFmpeg is present and provides the required H.264 and AAC encoders', () => {
  assert.ok(typeof ffmpegPath === 'string' && ffmpegPath.length > 0, 'ffmpeg-static returned no binary path');
  assert.ok(require('node:fs').existsSync(ffmpegPath), 'FFmpeg binary does not exist at the package path');
  const version = execFileSync(ffmpegPath, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 15000 });
  const encoders = execFileSync(ffmpegPath, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 15000, maxBuffer: 12 * 1024 * 1024 });
  assert.match(version, /ffmpeg version/i);
  assert.match(encoders, /\blibx264\b/, 'The FFmpeg build has no libx264 encoder');
  assert.match(encoders, /\baac\b/, 'The FFmpeg build has no AAC encoder');
});

test('FFmpeg combines JPEG frames from stdin and stereo float audio from pipe 3 into a valid MP4', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'fluxivora-mp4-smoke-'));
  const outputPath = path.join(folder, 'smoke-test.mp4');
  try {
    const frames = execFileSync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=25',
      '-frames:v', '2', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '4', 'pipe:1'
    ], { maxBuffer: 4 * 1024 * 1024, timeout: 20000 });
    const args = buildFfmpegArgs({
      width: 1280, height: 720, fps: 25, frameCount: 2,
      durationSeconds: 0.08, outputPath
    });
    const result = await new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, args, { windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', data => { stderr = (stderr + data.toString('utf8')).slice(-8000); });
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal, stderr }));
      child.stdin.end(frames);
      child.stdio[3].end(Buffer.alloc(3840 * 2 * 4));
    });
    assert.equal(result.code, 0, 'FFmpeg smoke test failed: ' + result.stderr);
    const stat = await fs.stat(outputPath);
    assert.ok(stat.size > 1000, 'MP4 output unexpectedly small');
    execFileSync(ffmpegPath, ['-hide_banner', '-v', 'error', '-i', outputPath, '-f', 'null', '-'], { timeout: 15000 });
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});
