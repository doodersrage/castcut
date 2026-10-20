import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cutJoins, cutStarts, filmShotStarts, normalizeCutTransition } from './cut-timeline';
import { buildFilterComplex } from './server-encode';
import { applyCutShotEdits } from '../film/cut-plan';

describe('cut joins (transitions)', () => {
  it('a shot with its own transition overrides the crossfade; a hard cut overlaps nothing', () => {
    const joins = cutJoins({
      count: 4,
      crossfadeSec: 0.5,
      transitions: [undefined, { kind: 'black', sec: 0.6 }, { kind: 'cut', sec: 0 }, undefined],
    });
    assert.deepEqual(joins.overlaps, [0, 0.6, 0, 0.5]);
    assert.deepEqual(joins.kinds, ['cut', 'black', 'cut', 'fade']);
  });

  it('places shots: 4 × 2 s with a 0.6 s dip and a slide → 6.8 s', () => {
    const { starts, total } = cutStarts([2, 2, 2, 2], [0, 0.6, 0.6, 0]);
    assert.deepEqual(starts, [0, 1.4, 2.8, 4.8]);
    assert.equal(total, 6.8);
  });

  it('without transitions it matches the old uniform crossfade arithmetic', () => {
    assert.deepEqual(
      filmShotStarts({ kinds: ['still', 'still', 'clip'], holdSecs: [2.5, 2.5, 3], crossfadeSec: 0.5 }),
      [0, 2, 4]
    );
  });

  it('reads stored transitions safely', () => {
    assert.deepEqual(normalizeCutTransition({ kind: 'white', sec: 9 }), { kind: 'white', sec: 2 });
    assert.deepEqual(normalizeCutTransition({ kind: 'cut', sec: 1 }), { kind: 'cut', sec: 0 });
    assert.equal(normalizeCutTransition({ kind: 'wipe' }), undefined);
  });

  it('the ffmpeg graph uses xfade per join, concat for a hard cut', () => {
    const graph = buildFilterComplex({
      shotCount: 3,
      kinds: ['still', 'still', 'still'],
      holdSecs: [2, 2, 2],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: false,
      transitions: [undefined, { kind: 'black', sec: 0.6 }, { kind: 'cut', sec: 0 }],
    });
    assert.match(graph.filter, /\[v0\]\[v1\]xfade=transition=fadeblack:duration=0\.6:offset=1\.4\[xf1\]/);
    assert.match(graph.filter, /\[xf1\]\[v2\]concat=n=2:v=1:a=0\[vout\]/);
    assert.equal(graph.durationSec, 5.4);
  });

  it('a transition picked in the shot list reaches the shot', () => {
    const shots = applyCutShotEdits(
      [
        { key: 'a', title: 'A', url: '/a.png', kind: 'still' },
        { key: 'b', title: 'B', url: '/b.png', kind: 'still' },
      ],
      { shots: { b: { transition: 'slide' } } }
    );
    assert.deepEqual(shots[1]?.transitionIn, { kind: 'slide', sec: 0.6 });
    assert.equal(shots[0]?.transitionIn, undefined);
  });
});

describe('per-shot motion and sound', () => {
  it('a still held still skips zoompan; a picked direction picks the curve; a clip has its level', () => {
    const graph = buildFilterComplex({
      shotCount: 3,
      kinds: ['still', 'still', 'clip'],
      holdSecs: [2, 2, 3],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: false,
      stillMotion: true,
      stillMotions: ['none', 'in', undefined],
      speech: [false, false, true],
      volumes: [undefined, undefined, 0.5],
    });
    const chains = graph.filter.split(';');
    assert.doesNotMatch(chains.find(chain => chain.startsWith('[0:v]'))!, /zoompan/);
    // Shot 1 (odd: it would pull out) pushes in — the even curve.
    assert.match(chains.find(chain => chain.startsWith('[1:v]'))!, /zoompan=z='1\+/);
    assert.match(graph.filter, /\[2:a\][^;]*volume=0\.5,adelay/);
  });

  it('the shot list passes motion (stills) and level (clips) to the shots', () => {
    const shots = applyCutShotEdits(
      [
        { key: 'a', title: 'A', url: '/a.png', kind: 'still' },
        { key: 'b', title: 'B', url: '/b.mp4', kind: 'clip' },
      ],
      { shots: { a: { motion: 'out', volume: 0 }, b: { volume: 0, motion: 'in' } } }
    );
    assert.equal(shots[0]?.motion, 'out');
    assert.equal(shots[0]?.volume, undefined);
    assert.equal(shots[1]?.volume, 0);
    assert.equal(shots[1]?.motion, undefined);
  });
});
