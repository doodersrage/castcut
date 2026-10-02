import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RoleplayStoryBeat } from './roleplay';
import {
  roleplaySceneWritePlan,
  storyHasBeat,
  storyWithoutUnwrittenBeat,
} from './roleplay-story-write';

function beat(id: string, at: number, extra: Partial<RoleplayStoryBeat> = {}): RoleplayStoryBeat {
  return { id, at, title: id, blurb: `${id} happens.`, kind: 'scene', ...extra } as RoleplayStoryBeat;
}

describe('roleplaySceneWritePlan — desk and phone write a picked scene the same way', () => {
  it('Still output: a still is written, and queued when queue-on-pick is on', () => {
    assert.deepEqual(roleplaySceneWritePlan({ beatOutput: 'still', autoQueue: true }), {
      skipStill: false,
      queueStill: true,
      stillStatus: 'writing',
    });
    assert.deepEqual(roleplaySceneWritePlan({ beatOutput: 'still', autoQueue: false }), {
      skipStill: false,
      queueStill: false,
      stillStatus: 'writing',
    });
  });

  it('Clip output queued on pick: no still — the clip is queued from the scene', () => {
    assert.deepEqual(roleplaySceneWritePlan({ beatOutput: 'clip', autoQueue: true }), {
      skipStill: true,
      queueStill: false,
      stillStatus: undefined,
    });
  });

  it('Clip output without queue-on-pick: the prompt is written as for a still', () => {
    assert.deepEqual(roleplaySceneWritePlan({ beatOutput: 'clip', autoQueue: false }), {
      skipStill: false,
      queueStill: false,
      stillStatus: 'writing',
    });
  });
});

describe('a scene write lands in the live reel', () => {
  const first = beat('first', 1, { prompt: 'p1', stillStatus: 'completed' });
  const second = beat('second', 2, { stillStatus: 'writing' });

  it('knows a scene taken back or replaced by a start-over (same id, other time)', () => {
    assert.equal(storyHasBeat([first, second], second), true);
    assert.equal(storyHasBeat([first], second), false);
    assert.equal(storyHasBeat([beat('second', 3)], second), false);
    assert.equal(storyHasBeat([], second), false);
  });

  it('a failed write drops only the unwritten scene, from the reel as it is now', () => {
    // A still finished on the first scene while the second was written.
    const now = [{ ...first, imageUrl: '/view?a' }, second];
    const next = storyWithoutUnwrittenBeat(now, second);
    assert.deepEqual(next, [{ ...first, imageUrl: '/view?a' }]);
    // A scene that already has a prompt stays (a rewrite that failed keeps its scene).
    const written = { ...second, prompt: 'p2' };
    assert.deepEqual(storyWithoutUnwrittenBeat([first, written], second), [first, written]);
    // Another scene at the same time is not this one.
    const other = beat('other', 2);
    assert.deepEqual(storyWithoutUnwrittenBeat([first, other], second), [first, other]);
  });
});
