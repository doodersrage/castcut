import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roleplayWatchPlaylist } from './character-film';
import { dayWatchPlaylist } from './day-planner';
import {
  applyCutShotEdits,
  captionFromBeat,
  cutRunningSec,
  cutShotProblems,
  estimateTempoBpm,
  fitHoldsToLength,
  moveCutShot,
  normalizeFilmCutLength,
  snapHoldsToBeat,
  type KeyedShot,
} from './film-cut-plan';
import type { RoleplayStoryBeat } from './roleplay';

const still = (key: string, holdSec = 2.5): KeyedShot => ({
  key,
  title: key,
  url: `/${key}.png`,
  kind: 'still',
  holdSec,
});
const clip = (key: string, holdSec?: number): KeyedShot => ({
  key,
  title: key,
  url: `/${key}.mp4`,
  kind: 'clip',
  ...(holdSec ? { holdSec } : {}),
});

describe('captions', () => {
  it('turns a beat into a short caption', () => {
    assert.equal(captionFromBeat('stirring a pot of risotto at the stove'), 'stirring a pot of risotto at the stove');
    assert.equal(
      captionFromBeat('pours coffee. then checks her phone by the window'),
      'pours coffee'
    );
    assert.equal(captionFromBeat('reads · exactly two adults only: Cast lead'), 'reads');
    const long = captionFromBeat(
      'walking along the harbour wall at golden hour with the fishing boats coming in behind her'
    );
    assert.ok(long.length <= 43 && long.endsWith('…'), long);
    assert.equal(captionFromBeat(''), '');
  });

  it('gives Day shots beat captions and keys, and Story shots beat keys', () => {
    const shots = dayWatchPlaylist(
      [{ slotId: 'morning', status: 'completed', imageUrl: '/m.png', promptId: 'p1' }],
      [
        { id: 'morning', label: 'Morning', sceneHints: 'stirring risotto at the stove' },
        { id: 'afternoon', label: 'Afternoon' },
        { id: 'evening', label: 'Evening' },
        { id: 'night', label: 'Night' },
      ]
    );
    assert.equal(shots[0]?.key, 'morning');
    assert.equal(shots[0]?.caption, 'stirring risotto at the stove');
    assert.equal(shots[0]?.title, 'Morning');
    const story = roleplayWatchPlaylist([
      { id: 'b', at: 7, title: 'The letter', blurb: 'x', stillStatus: 'completed', imageUrl: '/b.png' },
    ] as RoleplayStoryBeat[]);
    assert.equal(story[0]?.key, 'b@7');
  });
});

describe('shot list', () => {
  const shots = [still('a'), still('b'), clip('c')];

  it('reorders, leaves out, captions and holds', () => {
    const edited = applyCutShotEdits(shots, {
      order: ['c', 'a'],
      shots: { b: { include: false }, a: { caption: 'Coffee first', holdSec: 4 } },
    });
    assert.deepEqual(
      edited.map(shot => shot.key),
      ['c', 'a']
    );
    assert.equal(edited[1]?.caption, 'Coffee first');
    assert.equal(edited[1]?.holdSec, 4);
    assert.deepEqual(applyCutShotEdits(shots, null), shots);
  });

  it('keeps new shots in natural order after the ordered ones, and clamps holds', () => {
    const edited = applyCutShotEdits([...shots, still('d')], {
      order: ['b'],
      shots: { a: { holdSec: 99 } },
    });
    assert.deepEqual(
      edited.map(shot => shot.key),
      ['b', 'a', 'c', 'd']
    );
    assert.equal(edited[1]?.holdSec, 12);
  });

  it('moves a shot up or down, staying in bounds', () => {
    assert.deepEqual(moveCutShot(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
    assert.deepEqual(moveCutShot(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
  });
});

describe('fitting the cut to a length', () => {
  it('stretches stills so the cut runs the target, around clips, the title card and fades', () => {
    const shots = [still('a'), clip('c'), still('b')];
    const fitted = fitHoldsToLength({
      shots,
      targetSec: 30,
      clipSecs: [null, 5, null],
      crossfadeSec: 0.5,
      titleCard: true,
    });
    const running = cutRunningSec({ shots: fitted, clipSecs: [null, 5, null], crossfadeSec: 0.5, titleCard: true });
    assert.ok(Math.abs(running - 30) < 0.2, String(running));
    assert.equal(fitted[1], shots[1], 'clip untouched');
  });

  it('keeps holds watchable when the target is out of reach', () => {
    const fitted = fitHoldsToLength({ shots: [still('a'), still('b')], targetSec: 200 });
    assert.ok(fitted.every(shot => shot.holdSec === 12));
    assert.deepEqual(fitHoldsToLength({ shots: [clip('c')], targetSec: 30 }), [clip('c')]);
    assert.equal(normalizeFilmCutLength('music'), 'music');
    assert.equal(normalizeFilmCutLength(45), 'shots');
  });

  it('snaps still holds to whole beats', () => {
    const snapped = snapHoldsToBeat([still('a', 2.6), clip('c', 4), still('b', 0.2)], 120);
    assert.equal(snapped[0]?.holdSec, 2.5, '5 beats at 0.5 s');
    assert.equal(snapped[1]?.holdSec, 4, 'clips untouched');
    assert.equal(snapped[2]?.holdSec, 0.5, 'at least one beat');
    // Fast tempo: beats grouped so a hold is never under 0.5 s.
    assert.ok((snapHoldsToBeat([still('a', 0.6)], 180)[0]?.holdSec ?? 0) >= 0.5);
  });
});

describe('tempo', () => {
  const clicks = (bpm: number, seconds = 20, rate = 8000) => {
    const samples = new Float32Array(rate * seconds);
    const every = Math.round((60 / bpm) * rate);
    for (let start = 0; start < samples.length; start += every) {
      for (let i = 0; i < 200 && start + i < samples.length; i += 1) {
        samples[start + i] = Math.sin(i / 3) * (1 - i / 200);
      }
    }
    return samples;
  };

  it('finds the tempo of a click track', () => {
    for (const bpm of [90, 120, 140]) {
      const found = estimateTempoBpm(clicks(bpm), 8000);
      assert.ok(found && Math.abs(found - bpm) < 3, `${bpm} → ${found}`);
    }
  });

  it('says so when there is no pulse', () => {
    assert.equal(estimateTempoBpm(new Float32Array(8000 * 10), 8000), null);
    assert.equal(estimateTempoBpm(new Float32Array(100), 8000), null);
  });
});

describe('pre-cut check', () => {
  it('lists flagged shots and pose / face misses with their scores', () => {
    const problems = cutShotProblems([still('morning'), still('evening'), still('night')], shot =>
      shot.key === 'evening'
        ? { flagged: ['distorted hands'], poseMiss: true, pose: 0.31 }
        : shot.key === 'night'
          ? { faceMiss: true, face: 0.22 }
          : { pose: 0.9 }
    );
    assert.deepEqual(problems, [
      { key: 'evening', title: 'evening', reasons: ['distorted hands', 'missed its pose (31%)'] },
      { key: 'night', title: 'night', reasons: ["doesn't look like the Cast (22%)"] },
    ]);
  });
});
