import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roleplayWatchPlaylist } from './character-film';
import { dayWatchPlaylist } from './day/planner';
import {
  applyCutShotEdits,
  captionFromBeat,
  clipTrimWindow,
  cutPosterPick,
  framingCropRect,
  cutRunningSec,
  cutShotProblems,
  estimateTempoBpm,
  fitHoldsToLength,
  moveCutShot,
  normalizeFilmCutLength,
  shotSeconds,
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

  it('finds no beat in noise or a slowly swelling ambient pad', () => {
    const rate = 8000;
    let seed = 7;
    const noise = new Float32Array(rate * 20).map(() => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647) * 2 - 1;
    });
    // A sustained 220 Hz tone swelling every ~8 s — once read as a 150 BPM pulse.
    const pad = new Float32Array(rate * 20).map(
      (_, i) =>
        0.3 * Math.sin((2 * Math.PI * 220 * i) / rate) * (0.6 + 0.4 * Math.sin((2 * Math.PI * 0.13 * i) / rate))
    );
    assert.equal(estimateTempoBpm(noise, rate), null);
    assert.equal(estimateTempoBpm(pad, rate), null);
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

describe('clip trim', () => {
  it('keeps a trim inside the clip and at least half a second long', () => {
    assert.deepEqual(clipTrimWindow({ trimStartSec: 1, trimEndSec: 4 }, 6), { start: 1, end: 4 });
    // Past the end: play to the end.
    assert.deepEqual(clipTrimWindow({ trimStartSec: 1, trimEndSec: 9 }, 6), { start: 1, end: null });
    // Out before in: half a second from the in point.
    assert.deepEqual(clipTrimWindow({ trimStartSec: 3, trimEndSec: 2 }, 6), { start: 3, end: 3.5 });
    // In point at the very end: pulled back.
    assert.deepEqual(clipTrimWindow({ trimStartSec: 8 }, 6), { start: 5.5, end: null });
    assert.deepEqual(clipTrimWindow({}, null), { start: 0, end: null });
  });

  it('carries trims onto clip shots only, and times them', () => {
    const shots: KeyedShot[] = [
      { key: 'a', title: 'A', url: '/a.mp4', kind: 'clip' },
      { key: 'b', title: 'B', url: '/b.png', kind: 'still', holdSec: 3 },
    ];
    const out = applyCutShotEdits(shots, {
      shots: { a: { trimStartSec: 1.5, trimEndSec: 4 }, b: { trimStartSec: 2 } },
    });
    assert.equal(out[0]!.trimStartSec, 1.5);
    assert.equal(out[0]!.trimEndSec, 4);
    assert.equal(out[1]!.trimStartSec, undefined);
    assert.equal(shotSeconds(out[0]!, 6), 2.5);
    // Only an in point: to the end of the clip.
    assert.equal(shotSeconds({ ...out[0]!, trimEndSec: undefined }, 6), 4.5);
    assert.equal(shotSeconds(shots[0]!, 6), 6);
  });
});

describe('poster pick', () => {
  const shots: KeyedShot[] = [
    { key: 'a', title: 'A', url: '/a.png', kind: 'still' },
    { key: 'b', title: 'B', url: '/b.mp4', kind: 'clip', trimStartSec: 2 },
  ];
  it('uses the picked still, or a frame of the picked clip', () => {
    assert.equal(cutPosterPick(shots, {}), null);
    assert.deepEqual(cutPosterPick(shots, { poster: { key: 'a' } }), { imageUrl: '/a.png' });
    // A clip defaults to its trim's in point.
    assert.deepEqual(cutPosterPick(shots, { poster: { key: 'b' } }), {
      videoUrl: '/b.mp4',
      timeSec: 2,
    });
    assert.deepEqual(cutPosterPick(shots, { poster: { key: 'b', atSec: 3.27 } }), {
      videoUrl: '/b.mp4',
      timeSec: 3.3,
    });
    // Left out of the cut: back to the default.
    assert.equal(cutPosterPick([shots[0]!], { poster: { key: 'b' } }), null);
  });
});

describe('still framing', () => {
  it('crops waist up and chest up around the face, 3:4', () => {
    // A full-body still: face 60 px tall in a 1104×1472 frame.
    const face = { x: 520, y: 200, width: 50, height: 60 };
    const close = framingCropRect(1104, 1472, face, 'close')!;
    // Chest up would be 252 px tall — kept at 420 px so it isn't mush at 720p.
    assert.deepEqual(close, { x: 388, y: 146, width: 315, height: 420 });
    const medium = framingCropRect(1104, 1472, face, 'medium')!;
    assert.equal(medium.height, 450);
    assert.equal(medium.width, 338);
    // Already close: a big face keeps the whole still.
    assert.equal(framingCropRect(1104, 1472, { x: 300, y: 200, width: 300, height: 360 }, 'medium'), null);
  });

  it('rides on still shots only', () => {
    const shots: KeyedShot[] = [
      { key: 'a', title: 'A', url: '/a.png', kind: 'still' },
      { key: 'b', title: 'B', url: '/b.mp4', kind: 'clip' },
    ];
    const out = applyCutShotEdits(shots, {
      shots: { a: { framing: 'close' }, b: { framing: 'close' } },
    });
    assert.equal(out[0]!.framing, 'close');
    assert.equal(out[1]!.framing, undefined);
    assert.equal(applyCutShotEdits(shots, { shots: { a: { framing: 'full' } } })[0]!.framing, undefined);
  });
});

describe('fixed holds when fitting a length', async () => {
  const { fitHoldsToLength } = await import('./film-cut-plan');
  it('keeps close-ups and recap shots at their hold and stretches the rest', () => {
    const shots = fitHoldsToLength({
      shots: [
        { key: 'a', title: 'A', url: '/a.png', kind: 'still', holdSec: 3 },
        { key: 'a#face', title: 'A', url: '/f.png', kind: 'still', holdSec: 1.5, holdFixed: true },
        { key: 'b', title: 'B', url: '/b.png', kind: 'still', holdSec: 3 },
      ],
      targetSec: 11.5,
    });
    assert.deepEqual(
      shots.map(shot => shot.holdSec),
      [5, 1.5, 5]
    );
  });
});

describe('clip speed and reverse edits', () => {
  it('passes a clip speed (clamped) and reverse; stills ignore them', async () => {
    const { applyCutShotEdits, clipSpeed } = await import('./film-cut-plan');
    assert.equal(clipSpeed(undefined), 1);
    assert.equal(clipSpeed(9), 4);
    assert.equal(clipSpeed(0.1), 0.25);
    const out = applyCutShotEdits(
      [
        { key: 'a', title: 'a', url: '/a.mp4', kind: 'clip' },
        { key: 'b', title: 'b', url: '/b.png', kind: 'still' },
      ],
      { shots: { a: { speed: 0.5, reverse: true }, b: { speed: 2, reverse: true } } }
    );
    assert.equal(out[0]?.speed, 0.5);
    assert.equal(out[0]?.reverse, true);
    assert.equal(out[1]?.speed, undefined);
    assert.equal(out[1]?.reverse, undefined);
  });
});
