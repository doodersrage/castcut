import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bestSceneTake,
  episodeAnimates,
  episodeRedosFor,
  takeIsBare,
  normalizeEpisodeRunAuto,
  takeCheckMisses,
  takeChecksSkipped,
} from './episode-run';

const take = (id: string, at: number, extra = {}) => ({ id, promptId: id, imageUrl: `/${id}.png`, at, ...extra });

describe('episode run: which take to keep', () => {
  it('says what a take missed', () => {
    assert.deepEqual(takeCheckMisses({ poseMiss: true, outfitMiss: 'a red dress', at: 1 }), [
      'the pose missed',
      'the outfit (a red dress)',
    ]);
    assert.deepEqual(takeCheckMisses({ face: 0.8, at: 1 }), []);
    assert.deepEqual(takeCheckMisses(undefined), []);
  });

  it('keeps a passing take over a newer failing one, the better scores, never a rejected one', () => {
    const checks: Record<string, object> = {
      a: { face: 0.7, pose: 0.6, at: 1 },
      b: { face: 0.9, pose: 0.9, poseMiss: true, at: 1 },
      c: { face: 0.8, pose: 0.7, at: 1 },
      d: { face: 1, pose: 1, at: 1 },
    };
    const scene = { takes: [take('a', 1), take('b', 2), take('c', 3), take('d', 4, { review: 'rejected' as const })] };
    const pick = bestSceneTake(scene, id => checks[id] as never);
    assert.equal(pick?.take.id, 'c');
    assert.deepEqual(pick?.misses, []);
  });

  it('falls back to the least-bad take, and to the newest when nothing was checked', () => {
    const failing = bestSceneTake({ takes: [take('a', 1), take('b', 2)] }, id =>
      (id === 'a' ? { poseMiss: true, faceMiss: true, at: 1 } : { poseMiss: true, at: 1 }) as never
    );
    assert.deepEqual([failing?.take.id, failing?.misses], ['b', ['the pose missed']]);
    const unchecked = bestSceneTake({ takes: [take('a', 1), take('b', 2)] }, () => undefined);
    assert.deepEqual([unchecked?.take.id, unchecked?.checked], ['b', false]);
    assert.equal(bestSceneTake({ takes: [] }, () => undefined), null);
  });

  it('never keeps a take whose outfit or face went unchecked as passing (2026-11-11, shot 2F)', () => {
    // Take 1 was redone at once for looking computer-made, so only its pose was read; take 2's
    // after-checks found her naked. Take 1 was topless too, and the run kept it as "passed".
    const checks: Record<string, object> = {
      first: { pose: 0.5, poseMiss: false, realismMiss: 'looked computer-made (3/10)', at: 1 },
      second: { pose: 0.5, poseMiss: false, outfitMiss: 'naked', outfitChecked: true, face: 0.7, faceMiss: false, at: 2 },
    };
    // Neither passes: the one never looked at is kept before the one found naked, and says so.
    const pick = bestSceneTake({ takes: [take('first', 1), take('second', 2)] }, id => checks[id] as never);
    assert.equal(pick?.take.id, 'first');
    assert.deepEqual(pick?.misses, [
      'it looked computer-made (3/10)',
      'the outfit not checked',
      'the face not checked',
    ]);
    // Older saves have no realismMiss: the missing outfit and face checks still count.
    const old: Record<string, object> = { first: { pose: 0.5, at: 1 }, second: checks.second! };
    const oldPick = bestSceneTake({ takes: [take('first', 1), take('second', 2)] }, id => old[id] as never);
    assert.deepEqual(oldPick?.misses, ['the outfit not checked', 'the face not checked']);
    assert.deepEqual(
      takeChecksSkipped(old.first as never, [old.first as never, old.second as never]),
      ['the outfit not checked', 'the face not checked']
    );
    // A passing outfit check leaves no outfitMiss — outfitChecked says it ran.
    assert.deepEqual(
      takeChecksSkipped({ outfitChecked: true, face: 0.8, at: 1 }, [checks.second as never]),
      []
    );
  });

  it('keeps her dressed over undressed, whatever else missed (live 2026-11-11, shots 1A and 2C)', () => {
    // 1A: take 1 naked, take 2 dressed with a face that missed — a miss each; the naked one won
    // on its better face score.
    const checks: Record<string, object> = {
      naked: { outfitMiss: 'naked, holding light blue cup', outfitChecked: true, face: 0.55, faceMiss: false, at: 1 },
      dressed: { outfitChecked: true, face: 0.21, faceMiss: true, poseUnjudged: 'x', at: 2 },
    };
    const pick = bestSceneTake({ takes: [take('naked', 1), take('dressed', 2)] }, id => checks[id] as never);
    assert.equal(pick?.take.id, 'dressed');
    assert.equal(pick?.bare, undefined);
    // Only bare takes: the least bad, said bare — one more redo than the run's.
    const bare = bestSceneTake({ takes: [take('naked', 1)] }, id => checks[id] as never);
    assert.equal(bare?.bare, true);
    assert.equal(episodeRedosFor(1, bare), 2);
    assert.equal(episodeRedosFor(3, bare), 3);
    assert.equal(episodeRedosFor(0, bare), 0);
    assert.equal(episodeRedosFor(1, pick), 1);
    assert.equal(episodeRedosFor(1, null), 1);
  });

  it('knows undressed from an outfit that is only wrong', () => {
    for (const miss of ['naked', 'topless', 'white underwear, white robe', 'bare chest', 'nude, sitting']) {
      assert.equal(takeIsBare({ outfitMiss: miss, at: 1 }), true, miss);
    }
    for (const miss of ['a red dress', 'blue jeans instead of a skirt', 'a bare-shouldered top', '']) {
      assert.equal(takeIsBare({ outfitMiss: miss, at: 1 }), false, miss);
    }
    assert.equal(takeIsBare(undefined), false);
  });
});

describe('episode run: which kept takes are animated', () => {
  it('animates every one, or only shots with a line, and keeps the choice only while animating', () => {
    const lines = { animate: true, animateOnly: 'lines' as const };
    assert.equal(episodeAnimates({ animate: true }, {}), true);
    assert.equal(episodeAnimates({ animate: false }, { line: 'Hi.' }), false);
    assert.equal(episodeAnimates(lines, { line: 'You’re late.' }), true);
    assert.equal(episodeAnimates(lines, { sceneHints: 'Rob says: “Always was.”' }), true);
    assert.equal(episodeAnimates(lines, { sceneHints: 'She wipes the counter.' }), false);
    assert.deepEqual(normalizeEpisodeRunAuto({ keep: true, animate: true, animateOnly: 'lines' }), {
      keep: true,
      redo: 1,
      animate: true,
      animateOnly: 'lines',
    });
    assert.deepEqual(normalizeEpisodeRunAuto({ keep: true, animate: false, animateOnly: 'lines' }), {
      keep: true,
      redo: 1,
      animate: false,
    });
  });
});
