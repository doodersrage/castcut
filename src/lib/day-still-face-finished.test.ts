import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayStillIsFaceFinished, upsertDaySlotStill } from './day-planner';

describe('dayStillIsFaceFinished', () => {
  const take = {
    slotId: 'morning' as const,
    promptId: 'p1',
    imageUrl: '/api/comfyui/view?filename=Castcut_00001_.png',
    status: 'completed' as const,
  };

  it('a take with its own finish is finished — a fresh browser must not finish it again', () => {
    const [finished] = upsertDaySlotStill([take], {
      slotId: 'morning',
      imageUrl: '/api/comfyui/view?filename=Castcut-face-finish_00001_.png',
      status: 'completed',
      finishedUrl: '/api/comfyui/view?filename=Castcut-face-finish_00001_.png',
      finishedFor: 'p1',
    });
    assert.equal(dayStillIsFaceFinished(finished), true);
  });

  it('a raw take, or a requeued take with an old finish, is not', () => {
    assert.equal(dayStillIsFaceFinished(take), false);
    assert.equal(
      dayStillIsFaceFinished({ ...take, promptId: 'p2', finishedUrl: '/f.png', finishedFor: 'p1' }),
      false
    );
    assert.equal(dayStillIsFaceFinished(null), false);
  });
});
