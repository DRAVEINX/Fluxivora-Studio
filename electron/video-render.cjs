'use strict';

const FPS = 25;
const SAMPLE_RATE = 48000;
const MAX_DURATION_SECONDS = 15 * 60;
const MAX_FRAMES = MAX_DURATION_SECONDS * FPS;
const MAX_FRAME_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_STREAM_BYTES = 20 * 1024 * 1024 * 1024;
const OUTPUTS = Object.freeze({
  '720p': Object.freeze({ width: 1280, height: 720 }),
  '1080p': Object.freeze({ width: 1920, height: 1080 }),
  '4k': Object.freeze({ width: 3840, height: 2160 })
});

function safeFileStem(value) {
  const cleaned = String(value || 'Fluxivora-video')
    .replace(/[<>:"\/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 96);
  return cleaned || 'Fluxivora-video';
}

function validateRenderRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Ongeldige MP4-renderaanvraag.');
  }
  const output = OUTPUTS[payload.size];
  if (!output) throw new RangeError('Kies 720p, 1080p of 4K voor MP4-export.');
  const fps = Number(payload.fps);
  if (fps !== FPS) throw new RangeError('De huidige offline renderer gebruikt 25 beelden per seconde.');
  const frameCount = Number(payload.frameCount);
  if (!Number.isInteger(frameCount) || frameCount < 2 || frameCount > MAX_FRAMES) {
    throw new RangeError('De montage moet tussen 2 frames en 15 minuten lang zijn.');
  }
  const durationSeconds = frameCount / FPS;
  return Object.freeze({
    ...output,
    size: payload.size,
    fps: FPS,
    frameCount,
    durationSeconds,
    name: safeFileStem(payload.name)
  });
}

const PROXY_PRESETS = Object.freeze({
  '540p': Object.freeze({ width: 960, height: 540, maxRate: '1400k', bufferSize: '2800k', audioBitrate: '96k' }),
  '720p': Object.freeze({ width: 1280, height: 720, maxRate: '2400k', bufferSize: '4800k', audioBitrate: '128k' })
});
const MAX_PROXY_READ_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_PROXY_OUTPUT_BYTES = 350 * 1024 * 1024;
const MAX_PROXY_SOURCE_BYTES = 20 * 1024 * 1024 * 1024;
const VIDEO_SOURCE_EXTENSIONS = Object.freeze([
  '.3gp', '.avi', '.flv', '.m2ts', '.m2v', '.m4v', '.mkv', '.mov',
  '.mp4', '.mpeg', '.mpg', '.mts', '.mxf', '.ogv', '.ts', '.vob',
  '.webm', '.wmv'
]);

function validateProxyRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Ongeldige proxy-aanvraag.');
  }
  const preset = PROXY_PRESETS[payload.preset];
  if (!preset) throw new RangeError('Kies 540p of 720p voor proxy-generatie.');
  const requestId = String(payload.requestId || '');
  if (!/^[a-z0-9_-]{1,80}$/i.test(requestId)) throw new TypeError('Ongeldige proxy-taak-ID.');
  const durationSeconds = payload.durationSeconds == null ? 0 : Number(payload.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 24 * 60 * 60) {
    throw new RangeError('De bronduur voor proxy-generatie is ongeldig.');
  }
  return Object.freeze({
    requestId,
    preset: payload.preset,
    ...preset,
    durationSeconds,
    sourceName: safeFileStem(payload.sourceName || 'Fluxivora-video')
  });
}

function buildProxyArgs(options) {
  const { inputPath, outputPath, preset } = options || {};
  const target = PROXY_PRESETS[preset];
  if (typeof inputPath !== 'string' || !inputPath.trim() || inputPath.length > 4096 ||
      typeof outputPath !== 'string' || !outputPath.trim() || outputPath.length > 4096 ||
      !target || !/\.mp4$/i.test(outputPath) ||
      path.resolve(inputPath).toLowerCase() === path.resolve(outputPath).toLowerCase()) {
    throw new TypeError('Ongeldige FFmpeg-proxy-instellingen.');
  }
  const scale = "scale=w='min(" + target.width + ",iw)':h='min(" + target.height + ",ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
  return [
    '-hide_banner', '-loglevel', 'error', '-y', '-nostdin',
    '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a?',
    '-vf', scale,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
    '-maxrate', target.maxRate, '-bufsize', target.bufferSize,
    '-c:a', 'aac', '-b:a', target.audioBitrate, '-ac', '2',
    '-map_metadata', '-1', '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    outputPath
  ];
}

function decodeBase64(value, maxBytes, label) {
  if (typeof value !== 'string' || value.length < 4 || value.length > Math.ceil(maxBytes / 3) * 4 + 8 ||
      value.length % 4 !== 0 || !/^[a-z0-9+/]*={0,2}$/i.test(value)) {
    throw new TypeError(label + ' bevat ongeldige of te grote Base64-data.');
  }
  const buffer = Buffer.from(value, 'base64');
  if (!buffer.length || buffer.length > maxBytes) throw new RangeError(label + ' is leeg of te groot.');
  if (buffer.toString('base64') !== value) throw new TypeError(label + ' bevat ongeldige Base64-data.');
  return buffer;
}

function decodeJpegFrame(value) {
  const buffer = decodeBase64(value, MAX_FRAME_BYTES, 'Videoframe');
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 ||
      buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) {
    throw new TypeError('Het aangeleverde frame is geen geldige JPEG-afbeelding.');
  }
  return buffer;
}

function decodeFloatAudioChunk(value) {
  const buffer = decodeBase64(value, MAX_AUDIO_CHUNK_BYTES, 'Audiofragment');
  if (buffer.length % 8 !== 0) throw new TypeError('Het audiofragment moet uit stereo Float32-samples bestaan.');
  for (let i = 0; i < buffer.length; i += 4) {
    const sample = buffer.readFloatLE(i);
    if (!Number.isFinite(sample) || Math.abs(sample) > 4) {
      throw new TypeError('Het audiofragment bevat een ongeldig audiomonster.');
    }
  }
  return buffer;
}

function buildFfmpegArgs(options) {
  const { width, height, fps, frameCount, durationSeconds, outputPath } = options || {};
  if (![1280, 1920, 3840].includes(Number(width)) ||
      ![720, 1080, 2160].includes(Number(height)) ||
      !Number.isInteger(Number(fps)) || Number(fps) !== FPS ||
      !Number.isInteger(Number(frameCount)) || frameCount < 2 || frameCount > MAX_FRAMES ||
      !Number.isFinite(Number(durationSeconds)) || Math.abs(Number(durationSeconds) - frameCount / FPS) > 0.0001 ||
      typeof outputPath !== 'string' || !outputPath.trim()) {
    throw new TypeError('Ongeldige FFmpeg-uitvoerinstellingen.');
  }
  const size = Number(width) === 1280 ? '720p' : Number(width) === 1920 ? '1080p' : '4k';
  const expected = OUTPUTS[size];
  if (expected.width !== Number(width) || expected.height !== Number(height)) {
    throw new TypeError('De MP4-uitvoerafmetingen passen niet bij de gekozen resolutie.');
  }
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-thread_queue_size', '512',
    '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0',
    '-thread_queue_size', '512',
    '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '2', '-i', 'pipe:3',
    '-map', '0:v:0', '-map', '1:a:0',
    '-frames:v', String(frameCount), '-t', Number(durationSeconds).toFixed(4),
    '-vf', 'format=yuv420p,setsar=1',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', String(FPS), '-fps_mode', 'cfr',
    '-c:a', 'aac', '-b:a', '192k', '-ar', String(SAMPLE_RATE), '-ac', '2',
    '-movflags', '+faststart',
    outputPath
  ];
}

module.exports = Object.freeze({
  FPS, SAMPLE_RATE, MAX_DURATION_SECONDS, MAX_FRAMES,
  MAX_FRAME_BYTES, MAX_AUDIO_CHUNK_BYTES, MAX_STREAM_BYTES, OUTPUTS,
  PROXY_PRESETS, MAX_PROXY_READ_CHUNK_BYTES, MAX_PROXY_OUTPUT_BYTES, MAX_PROXY_SOURCE_BYTES, VIDEO_SOURCE_EXTENSIONS,
  safeFileStem, validateRenderRequest, validateProxyRequest, buildProxyArgs,
  decodeJpegFrame, decodeFloatAudioChunk, buildFfmpegArgs
});
