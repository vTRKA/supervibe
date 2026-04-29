import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMediaCapabilities, formatMediaCapabilities } from '../scripts/lib/media-capabilities.mjs';

test('detectMediaCapabilities reports video when ffmpeg is available', () => {
  const caps = detectMediaCapabilities({
    ffmpeg: [process.execPath, '-e', 'process.exit(0)'],
    magick: [process.execPath, '-e', 'process.exit(1)'],
  });
  assert.equal(caps.video, true);
  assert.equal(caps.animatedGif, true);
  assert.equal(caps.tools.ffmpeg.available, true);
});

test('detectMediaCapabilities provides fallbacks when video is unavailable', () => {
  const caps = detectMediaCapabilities({
    ffmpeg: [process.execPath, '-e', 'process.exit(1)'],
    gifski: [process.execPath, '-e', 'process.exit(1)'],
  });
  assert.equal(caps.video, false);
  assert.ok(caps.recommendedFallbacks.length >= 3);
  assert.match(formatMediaCapabilities(caps), /video: unavailable/);
});
