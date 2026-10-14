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

describe('narration in the cut', async () => {
  const { buildFilterComplex } = await import('./video-server-encode');
  it('delays each narration to its shot and mixes it with the lines, ducking the music', () => {
    const out = buildFilterComplex({
      shotCount: 3,
      kinds: ['still', 'still', 'still'],
      holdSecs: [3, 4, 3],
      width: 1280,
      height: 720,
      crossfadeSec: 0,
      hasAudioBed: true,
      speech: [false, false, false],
      narration: [{ input: 4, shot: 1 }],
    });
    assert.match(out.filter, /\[4:a\][^;]*adelay=3000:all=1\[n1\]/);
    assert.match(out.filter, /\[n1\]anull,apad=whole_dur=10\[speech\]/);
    assert.match(out.filter, /sidechaincompress/);
    assert.equal(out.audioLabel, 'aout');
  });
  it('makes a soundtrack from narration alone when there is no music', () => {
    const out = buildFilterComplex({
      shotCount: 2,
      kinds: ['still', 'still'],
      holdSecs: [3, 3],
      width: 1280,
      height: 720,
      crossfadeSec: 0,
      hasAudioBed: false,
      narration: [{ input: 2, shot: 0 }],
    });
    assert.equal(out.audioLabel, 'aout');
    assert.match(out.filter, /\[2:a\][^;]*adelay=0:all=1\[n0\]/);
  });
});
