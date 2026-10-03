import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planDaySlotPose, plannedDaySlotPoseKey } from './day-slot-pose';

describe('plannedDaySlotPoseKey', () => {
  it('names the layout the slot plan draws, without drawing it', () => {
    const plan = (sceneHints: string, poseLayout?: string) =>
      planDaySlotPose({
        slot: { id: 'morning', sceneHints, ...(poseLayout ? { poseLayout } : {}) },
        dayMood: 'everyday',
        model: 'qwen-rapid-aio-edit',
      });
    assert.equal(plannedDaySlotPoseKey(plan('kneeling in the garden planting herbs'), 'morning'), 'kneel:1');
    // A picked pose wins over the beat.
    assert.equal(plannedDaySlotPoseKey(plan('walking to the cafe', 'cook'), 'morning'), 'cook:1');
  });
});
