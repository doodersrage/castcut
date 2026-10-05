import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayChecksRunBeforeFaceFinish,
  faceFinishAwaitsChecks,
  settleDayTake,
} from './day-finish-order';

describe('day-finish-order', () => {
  it('runs the pose check before Face finish only on a Balanced-style Day', () => {
    const balanced = { faceFinish: true, redoPoseMisses: true, autoReviewStills: false };
    assert.equal(dayChecksRunBeforeFaceFinish(balanced), true);
    // Best: Auto-review reviews the finished face, so it keeps waiting for Face finish.
    assert.equal(dayChecksRunBeforeFaceFinish({ ...balanced, autoReviewStills: true }), false);
    // Nothing to wait for without the pose redo, nothing to order without Face finish.
    assert.equal(dayChecksRunBeforeFaceFinish({ ...balanced, redoPoseMisses: false }), false);
    assert.equal(dayChecksRunBeforeFaceFinish({ ...balanced, faceFinish: false }), false);
  });

  it('holds Face finish until the take it would finish has settled', () => {
    const gate = { settledTakes: {}, checksOff: false };
    assert.equal(faceFinishAwaitsChecks(gate, 'morning', 'p1'), true);
    const settled = settleDayTake(gate.settledTakes, 'morning', 'p1');
    assert.equal(faceFinishAwaitsChecks({ ...gate, settledTakes: settled }, 'morning', 'p1'), false);
    // A redo's new take waits for its own check.
    assert.equal(faceFinishAwaitsChecks({ ...gate, settledTakes: settled }, 'morning', 'p2'), true);
    // Another slot is not settled by this one.
    assert.equal(faceFinishAwaitsChecks({ ...gate, settledTakes: settled }, 'night', 'p1'), true);
  });

  it('never holds when there is no gate or the pose check cannot run', () => {
    assert.equal(faceFinishAwaitsChecks(null, 'morning', 'p1'), false);
    assert.equal(faceFinishAwaitsChecks(undefined, 'morning', 'p1'), false);
    assert.equal(faceFinishAwaitsChecks({ settledTakes: {}, checksOff: true }, 'morning', 'p1'), false);
  });

  it('keeps the same object when a take settles twice (no extra render)', () => {
    const once = settleDayTake({}, 'morning', 'p1');
    assert.equal(settleDayTake(once, 'morning', 'p1'), once);
    assert.equal(settleDayTake(once, '', 'p1'), once);
    assert.equal(settleDayTake(once, 'night', ''), once);
    assert.deepEqual(settleDayTake(once, 'morning', 'p2'), { morning: 'p2' });
  });
});
