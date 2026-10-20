import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planGalleryPollResume } from './comfyui-gallery-poller';
import type { PendingGalleryPoll } from './pending-polls';

function entry(
  promptId: string,
  status: 'pending' | 'running' | 'completed' | 'error',
  comfyUrl = 'http://127.0.0.1:8188',
) {
  return { promptId, status, comfyUrl };
}

function pending(promptId: string, comfyUrl?: string): PendingGalleryPoll {
  return { promptId, comfyUrl };
}

describe('planGalleryPollResume', () => {
  it('schedules every pending/running entry when nothing is tracked yet', () => {
    const gallery = [entry('a', 'running'), entry('b', 'pending'), entry('c', 'completed')];
    const plan = planGalleryPollResume(gallery, []);

    assert.deepEqual(plan.toForget, []);
    assert.deepEqual(
      plan.toSchedule.map(item => item.promptId).sort(),
      ['a', 'b'],
    );
  });

  it('also schedules an untracked running entry even when other polls are already tracked', () => {
    // Regression test: previously, resumePendingGalleryPolls only ran its
    // fallback full-gallery sweep when pendingMeta was completely empty. As
    // soon as ANY poll was tracked (the common case whenever a queue is
    // active), every other pending/running entry not already in pendingMeta
    // -- e.g. one merged in from a server sync while still in progress --
    // was silently skipped for the rest of the session.
    const gallery = [
      entry('tracked', 'running'),
      entry('untracked-from-server-merge', 'running'),
    ];
    const plan = planGalleryPollResume(gallery, [pending('tracked')]);

    assert.deepEqual(
      plan.toSchedule.map(item => item.promptId).sort(),
      ['tracked', 'untracked-from-server-merge'],
    );
  });

  it('forgets tracked entries that already reached a terminal status, without scheduling them', () => {
    const gallery = [entry('done', 'completed'), entry('failed', 'error')];
    const plan = planGalleryPollResume(gallery, [pending('done'), pending('failed')]);

    assert.deepEqual(plan.toForget.sort(), ['done', 'failed']);
    assert.deepEqual(plan.toSchedule, []);
  });

  it('does not schedule the same promptId twice when it appears in both sources', () => {
    const gallery = [entry('a', 'running', 'http://host-a')];
    const plan = planGalleryPollResume(gallery, [pending('a', 'http://host-a')]);

    assert.equal(plan.toSchedule.length, 1);
    assert.equal(plan.toSchedule[0]?.promptId, 'a');
  });

  it('still schedules a tracked promptId that has no matching gallery entry', () => {
    // e.g. right after a page reload, before the gallery store has re-synced.
    const gallery: ReturnType<typeof entry>[] = [];
    const plan = planGalleryPollResume(gallery, [pending('orphaned', 'http://host-a')]);

    assert.deepEqual(plan.toForget, []);
    assert.deepEqual(plan.toSchedule, [{ promptId: 'orphaned', comfyUrl: 'http://host-a' }]);
  });
});
