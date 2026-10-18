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

describe('clip speed, reverse and grade in the graph', () => {
  it('reads hold × speed of the file, slows with interpolated frames and paces the sound', async () => {
    const { buildFilterComplex } = await import('./video-server-encode');
    const graph = buildFilterComplex({
      shotCount: 2,
      kinds: ['clip', 'clip'],
      holdSecs: [4, 2],
      width: 1280,
      height: 720,
      crossfadeSec: 0,
      hasAudioBed: false,
      speech: [true, true],
      trimStarts: [0, 1],
      speeds: [0.5, 2],
      reverses: [true, false],
      grades: ['format=rgb24,colorchannelmixer=rr=1.1,format=yuv420p', ''],
    });
    assert.match(graph.filter, /\[0:v\]trim=start=0\.000:end=2\.000,setpts=PTS-STARTPTS,reverse,/);
    assert.match(graph.filter, /setpts=PTS\/0\.5,minterpolate=/);
    assert.match(graph.filter, /\[1:v\]trim=start=1\.000:end=5\.000,/);
    assert.match(graph.filter, /setpts=PTS\/2,fps=/);
    assert.match(graph.filter, /atrim=0:2,asetpts=PTS-STARTPTS,areverse,atempo=0\.5,/);
    assert.match(graph.filter, /atrim=1:5,asetpts=PTS-STARTPTS,atempo=2,/);
    assert.match(graph.filter, /colorchannelmixer=rr=1\.1/);
  });
});

describe('music shaping, ambience and J / L cuts in the graph', () => {
  it('starts the music in, fades it, loops the ambience and widens a J / L clip window', async () => {
    const { buildFilterComplex } = await import('./video-server-encode');
    const graph = buildFilterComplex({
      shotCount: 2,
      kinds: ['clip', 'clip'],
      holdSecs: [3, 3],
      width: 1280,
      height: 720,
      crossfadeSec: 0,
      hasAudioBed: true,
      speech: [true, true],
      trimStarts: [0, 1.5],
      soundLeads: [0, 1],
      soundTails: [0.5, 0],
      sound: { musicStartSec: 2, musicFadeInSec: 2, musicFadeOutSec: 0 },
      ambienceInput: 3,
    });
    // Shot 2's sound starts 1 s early (from 0.5 s of its file), shot 1's runs 0.5 s on.
    assert.match(graph.filter, /\[1:a\][^;]*atrim=0\.5:4\.5,[^;]*adelay=2000:/);
    assert.match(graph.filter, /\[0:a\][^;]*atrim=0:3\.5,/);
    assert.match(graph.filter, /\[2:a\][^;]*atrim=2:8,[^;]*afade=t=in:st=0:d=2/);
    assert.match(graph.filter, /\[3:a\][^;]*volume=0\.35/);
    assert.equal(graph.audioLabel, 'amix');
    assert.doesNotMatch(graph.filter, /afade=t=out/);
  });
});
