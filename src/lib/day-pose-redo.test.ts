import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  notePoseRedoTake,
  poseRedoDecision,
  poseRedoMark,
  poseRedoTakeId,
  type PoseRedoLedger,
} from './day-pose-redo';

const base = {
  enabled: true,
  autoReview: false,
  slotId: 'morning',
  take: 'p1',
  poseScore: 0.4,
  ledger: {} as PoseRedoLedger,
};

describe('day pose redo', () => {
  it('redoes a missed pose once the switch is on', () => {
    assert.deepEqual(poseRedoDecision(base), { redo: true, reason: 'pose' });
    assert.deepEqual(poseRedoDecision({ ...base, enabled: false }), { redo: false, skip: 'off' });
  });

  it('leaves pose misses to Auto-review when it is on', () => {
    assert.deepEqual(poseRedoDecision({ ...base, autoReview: true }), {
      redo: false,
      skip: 'auto-review',
    });
  });

  it('skips a still that matched, or was never checked', () => {
    assert.deepEqual(poseRedoDecision({ ...base, poseScore: 0.6 }), {
      redo: false,
      skip: 'matched',
    });
    assert.deepEqual(poseRedoDecision({ ...base, poseScore: 0.5, minPoseMatch: 0.45 }), {
      redo: false,
      skip: 'matched',
    });
    assert.deepEqual(poseRedoDecision({ ...base, poseScore: null }), {
      redo: false,
      skip: 'no-check',
    });
    assert.deepEqual(poseRedoDecision({ ...base, take: ' ' }), { redo: false, skip: 'no-take' });
  });

  it('never loops: the missed take and the redo take are not redone again', () => {
    let ledger: PoseRedoLedger = { morning: { missedTake: 'p1' } };
    assert.deepEqual(poseRedoDecision({ ...base, ledger }), { redo: false, skip: 'same-take' });
    // The redo lands (and misses again): it is the redo's take, not redone.
    ledger = notePoseRedoTake(ledger, 'morning', 'p2');
    assert.deepEqual(ledger.morning, { missedTake: 'p1', redoTake: 'p2' });
    assert.deepEqual(poseRedoDecision({ ...base, take: 'p2', ledger }), {
      redo: false,
      skip: 'redo-take',
    });
    // Noting again does not move it.
    assert.equal(notePoseRedoTake(ledger, 'morning', 'p3'), ledger);
    // A later take queued by hand gets its own one redo.
    assert.deepEqual(poseRedoDecision({ ...base, take: 'p3', ledger }), { redo: true, reason: 'pose' });
    // Other slots are untouched.
    assert.deepEqual(poseRedoDecision({ ...base, slotId: 'night', ledger }), { redo: true, reason: 'pose' });
  });

  it('notes only a new take as the redo result', () => {
    const ledger: PoseRedoLedger = { morning: { missedTake: 'p1' } };
    assert.equal(notePoseRedoTake(ledger, 'morning', 'p1'), ledger);
    assert.equal(notePoseRedoTake(ledger, 'morning', ''), ledger);
    assert.equal(notePoseRedoTake(ledger, 'night', 'p9'), ledger);
  });

  it('marks the card while the redo renders and on the take it made', () => {
    const pending: PoseRedoLedger = { morning: { missedTake: 'p1' } };
    assert.equal(poseRedoMark(pending, 'morning', 'p1'), 'Redoing for the pose…');
    const done = notePoseRedoTake(pending, 'morning', 'p2');
    assert.equal(poseRedoMark(done, 'morning', 'p2'), 'Redone for the pose');
    assert.equal(poseRedoMark(done, 'morning', 'p3'), null);
    assert.equal(poseRedoMark(done, 'night', 'p2'), null);
  });

  it('redoes a computer-made-looking take once, after a pose miss', () => {
    // Pose matched (or no guide checked it), but it looked computer-made: redo for the look.
    assert.deepEqual(poseRedoDecision({ ...base, poseScore: 0.9, realismMiss: true }), {
      redo: true,
      reason: 'realism',
    });
    assert.deepEqual(poseRedoDecision({ ...base, poseScore: null, realismMiss: true }), {
      redo: true,
      reason: 'realism',
    });
    // A pose miss outranks it: that redo spells the pose out.
    assert.deepEqual(poseRedoDecision({ ...base, realismMiss: true }), {
      redo: true,
      reason: 'pose',
    });
    assert.deepEqual(poseRedoDecision({ ...base, poseScore: null }), {
      redo: false,
      skip: 'no-check',
    });
    // Its own redo is never redone again.
    const ledger: PoseRedoLedger = { morning: { missedTake: 'p1', reason: 'realism' } };
    assert.deepEqual(
      poseRedoDecision({ ...base, take: 'p2', poseScore: 0.9, realismMiss: true, ledger }),
      { redo: false, skip: 'redo-take' }
    );
    assert.equal(poseRedoMark(ledger, 'morning', 'p1'), 'Redoing — looked computer-made…');
    const done = notePoseRedoTake(ledger, 'morning', 'p2');
    assert.equal(poseRedoMark(done, 'morning', 'p2'), 'Redone — looked computer-made');
  });

  it('identifies a take by prompt id, else image', () => {
    assert.equal(poseRedoTakeId({ promptId: ' abc ', imageUrl: '/a.png' }), 'abc');
    assert.equal(poseRedoTakeId({ imageUrl: '/a.png' }), '/a.png');
    assert.equal(poseRedoTakeId(undefined), '');
  });
});
