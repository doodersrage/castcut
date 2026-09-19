import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearGalleryPendingActionsForTests,
  consumePendingRefineAfterUpscale,
  consumePendingSkinRefineAfterStill,
  scheduleRefineAfterUpscaleComplete,
  scheduleSkinRefineAfterStillComplete,
} from './gallery-pending-actions';

describe('gallery-pending-actions', () => {
  it('returns undefined when nothing was scheduled for a promptId', () => {
    clearGalleryPendingActionsForTests();
    assert.equal(consumePendingRefineAfterUpscale('never-scheduled'), undefined);
  });

  it('round-trips a scheduled refine and consumes it exactly once', () => {
    clearGalleryPendingActionsForTests();
    scheduleRefineAfterUpscaleComplete('prompt-1', 'final');
    const first = consumePendingRefineAfterUpscale('prompt-1');
    assert.deepEqual(first, { qualityProfile: 'final' });
    // Consuming again returns undefined — get-then-delete semantics.
    assert.equal(consumePendingRefineAfterUpscale('prompt-1'), undefined);
  });

  it('trims whitespace from the promptId on both schedule and consume', () => {
    clearGalleryPendingActionsForTests();
    scheduleRefineAfterUpscaleComplete('  prompt-2  ', 'max');
    assert.deepEqual(consumePendingRefineAfterUpscale('prompt-2'), {
      qualityProfile: 'max',
    });
  });

  it('no-ops scheduling for a blank promptId', () => {
    clearGalleryPendingActionsForTests();
    scheduleRefineAfterUpscaleComplete('   ', 'final');
    assert.equal(consumePendingRefineAfterUpscale(''), undefined);
    assert.equal(consumePendingRefineAfterUpscale('   '), undefined);
  });

  it('keeps independent entries for different promptIds', () => {
    clearGalleryPendingActionsForTests();
    scheduleRefineAfterUpscaleComplete('a', 'final');
    scheduleRefineAfterUpscaleComplete('b', 'max');
    assert.deepEqual(consumePendingRefineAfterUpscale('b'), { qualityProfile: 'max' });
    assert.deepEqual(consumePendingRefineAfterUpscale('a'), { qualityProfile: 'final' });
  });

  it('overwrites a previously scheduled entry for the same promptId', () => {
    clearGalleryPendingActionsForTests();
    scheduleRefineAfterUpscaleComplete('c', 'final');
    scheduleRefineAfterUpscaleComplete('c', 'max');
    assert.deepEqual(consumePendingRefineAfterUpscale('c'), { qualityProfile: 'max' });
  });

  it('round-trips a scheduled skin refine after still complete', () => {
    clearGalleryPendingActionsForTests();
    scheduleSkinRefineAfterStillComplete('still-1', 'flux-ultrareal-v4');
    assert.deepEqual(consumePendingSkinRefineAfterStill('still-1'), {
      model: 'flux-ultrareal-v4',
    });
    assert.equal(consumePendingSkinRefineAfterStill('still-1'), undefined);
  });

  it('no-ops blank skin refine schedule inputs', () => {
    clearGalleryPendingActionsForTests();
    scheduleSkinRefineAfterStillComplete('   ', 'flux-ultrareal-v4');
    scheduleSkinRefineAfterStillComplete('still-2', '   ');
    assert.equal(consumePendingSkinRefineAfterStill('still-2'), undefined);
  });
});
