import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isServerFilmEncodeAvailable,
  normalizeFilmCrossfadeSec,
  normalizeFilmResolution,
  resolveFfmpegBinary,
} from './video-server-encode';

describe('video-server-encode', () => {
  it('normalizes resolution presets', () => {
    assert.equal(normalizeFilmResolution('1080p'), '1080p');
    assert.equal(normalizeFilmResolution('720'), '720p');
    assert.equal(normalizeFilmResolution(''), '720p');
  });

  it('clamps crossfade seconds', () => {
    assert.equal(normalizeFilmCrossfadeSec(-1), 0);
    assert.equal(normalizeFilmCrossfadeSec(0.5), 0.5);
    assert.equal(normalizeFilmCrossfadeSec(9), 2);
  });

  it('detects system ffmpeg when installed', async () => {
    const bin = await resolveFfmpegBinary();
    const available = await isServerFilmEncodeAvailable();
    assert.equal(Boolean(bin), available);
  });
});
