import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScene } from '../day/scenes';
import { sceneCutShots } from '../day/scenes';
import { withSceneBreaks } from './cut-media';
import type { FilmPlaylistShot } from './character-film';

// The flagship (2026-11-15): hard cuts from the kitchen to the street to the café read as jumps.
describe('a dip to black between a script’s scenes', () => {
  const shot = (url: string, sceneGroup?: string, extra: Partial<FilmPlaylistShot> = {}) =>
    ({ title: url, url, kind: 'clip', ...(sceneGroup ? { sceneGroup } : {}), ...extra }) as FilmPlaylistShot;

  it('dips where the scene changes; leaves a picked transition and unknown scenes alone', () => {
    const out = withSceneBreaks([
      shot('a1', 's|kitchen'),
      shot('a2', 's|kitchen'),
      shot('b1', 's|street'),
      shot('c1', 's|cafe', { transitionIn: { kind: 'slide', sec: 0.6 } }),
      shot('x', undefined),
      shot('d1', 's|park'),
    ]);
    assert.deepEqual(
      out.map(entry => entry.transitionIn?.kind ?? null),
      [null, null, 'black', 'slide', null, null]
    );
  });

  it('Cut’s Scenes source says which script scene each shot is in', () => {
    const base = createScene({ castId: 'slyne', name: '1A', id: 'a', now: 1 });
    const kept = (id: string, sceneId?: string) => ({
      ...base,
      id,
      takes: [{ id: `${id}1`, promptId: `${id}1`, imageUrl: `/${id}.png`, at: 1 }],
      keptTakeId: `${id}1`,
      ...(sceneId ? { fromScript: { scriptId: 'sk', sceneId, shotId: `${sceneId}~1` } } : {}),
    });
    const shots = sceneCutShots([kept('a', 'int-kitchen'), kept('b')], 'slyne', 3, true);
    assert.equal(shots[0]!.sceneGroup, 'sk|int-kitchen');
    assert.equal(shots[1]!.sceneGroup, undefined, 'made by hand: no scene');
  });
});

describe('a script shot with no line comes in quiet (the flagship, 2026-11-15)', () => {
  // MiniMax-H3 made up words for every clip with nothing to say.
  it('its clip at no volume; a line keeps its sound; a level picked in Cut wins', async () => {
    const { applyCutShotEdits } = await import('./cut-plan');
    const base = createScene({ castId: 'slyne', name: '1A', id: 'a', now: 1 });
    const clip = (id: string, line?: string) => ({
      ...base,
      id,
      slot: { ...base.slot, ...(line ? { line } : {}) },
      takes: [
        { id: `${id}1`, promptId: `${id}1`, imageUrl: `/${id}.png`, clipUrl: `/${id}.mp4`, at: 1 },
      ],
      keptTakeId: `${id}1`,
      fromScript: { scriptId: 'sk', sceneId: 'int-kitchen', shotId: `int-kitchen~${id}` },
    });
    const [quiet, talking] = sceneCutShots([clip('a'), clip('b', "That's a key.")], 'slyne', 3, true);
    assert.equal(quiet!.volume, 0);
    assert.equal(talking!.volume, undefined);
    const keyed = [{ ...quiet!, key: 'scenes:a' }];
    assert.equal(applyCutShotEdits(keyed, { shots: { 'scenes:a': { volume: 1 } } })[0]!.volume, 1);
    assert.equal(applyCutShotEdits(keyed, {})[0]!.volume, 0);
  });
});

describe('a clip that cuts away plays up to its cut (the flagship, 2026-11-15)', () => {
  it('trimmed at the cut its check found; a trim of your own, a still or an early cut left alone', async () => {
    const { trimClipsAtTheirCuts } = await import('./cut-plan');
    const shot = (key: string, extra: Record<string, unknown> = {}) =>
      ({ key, title: key, url: `/${key}.mp4`, kind: 'clip', entryId: key, ...extra }) as never;
    const cuts: Record<string, number> = { a: 2.7, b: 2.7, d: 0.6 };
    const out = trimClipsAtTheirCuts(
      [shot('a'), shot('b', { trimEndSec: 4 }), shot('c'), shot('d'), shot('e', { kind: 'still' })],
      id => cuts[id]
    ) as Array<{ trimEndSec?: number }>;
    assert.deepEqual(
      out.map(entry => entry.trimEndSec),
      [2.65, 4, undefined, undefined, undefined]
    );
  });
});

describe('a reaction shot is heard: its laugh is not muted (the flagship, 2026-11-16)', () => {
  it('a no-line reaction keeps its sound; a no-line shot that is not a reaction comes in quiet', () => {
    const base = createScene({ castId: 'slyne', name: '5E', id: 'r', now: 1 });
    const clip = (id: string, sceneHints: string) => ({
      ...base,
      id,
      slot: { ...base.slot, sceneHints },
      takes: [{ id: `${id}1`, promptId: `${id}1`, imageUrl: `/${id}.png`, clipUrl: `/${id}.mp4`, at: 1 }],
      keptTakeId: `${id}1`,
      fromScript: { scriptId: 'sk', sceneId: 'park', shotId: `park~${id}` },
    });
    const [reaction, establishing] = sceneCutShots(
      [clip('r', 'They sit on a bench. Jason reacts.'), clip('e', 'A park in the afternoon.')],
      'slyne',
      3,
      true
    );
    assert.equal(reaction!.volume, undefined);
    assert.equal(establishing!.volume, 0);
  });
});
