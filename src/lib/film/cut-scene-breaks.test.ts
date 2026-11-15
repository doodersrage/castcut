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
