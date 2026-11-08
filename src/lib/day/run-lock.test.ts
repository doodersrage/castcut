import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readRunLock, runHeldElsewhere, RUN_LOCK_FRESH_MS } from './run-lock';

describe('one renderer per run', () => {
  const lock = { runId: 'run-1', holder: 'tab-a', at: 1_000_000 };
  it('another tab’s fresh lock on this run holds it; ours, another run’s or a stale one don’t', () => {
    assert.equal(runHeldElsewhere(lock, 'run-1', 'tab-b', lock.at + 1000), true);
    assert.equal(runHeldElsewhere(lock, 'run-1', 'tab-a', lock.at + 1000), false);
    assert.equal(runHeldElsewhere(lock, 'run-2', 'tab-b', lock.at + 1000), false);
    assert.equal(runHeldElsewhere(lock, 'run-1', 'tab-b', lock.at + RUN_LOCK_FRESH_MS), false);
    assert.equal(runHeldElsewhere(null, 'run-1', 'tab-b', lock.at), false);
  });

  it('reads only a whole lock', () => {
    assert.deepEqual(readRunLock(JSON.stringify(lock)), lock);
    assert.equal(readRunLock('{"runId":"run-1"}'), null);
    assert.equal(readRunLock('not json'), null);
    assert.equal(readRunLock(null), null);
  });
});
