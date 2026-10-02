import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countPoseGuidePeople, resolveSceneGuidePlan } from './day-pose-guide';
import {
  DAY_LATE_SLOT_BEAT_PRESETS,
  DAY_LATE_SLOT_COMPANION_BEAT_PRESETS,
  DAY_SLOT_BEAT_PRESETS,
  DAY_SLOT_COMPANION_BEAT_PRESETS,
  DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS,
} from './day-planner';
import { planDaySlotPose } from './day-slot-pose';
import { dayVacationDuoBeatPresetsForSlot } from './day-vacation';

const PARTS = ['morning', 'afternoon', 'evening', 'night'] as const;

/** How many figures Day draws for a beat, through the same planner the slot editor uses. */
function figuresFor(beat: string, dayMood: string, duo: boolean): number {
  const plan = planDaySlotPose({
    slot: { id: 'morning', sceneHints: beat, location: 'city park' },
    dayMood,
    intimateMix: duo ? 'duo' : 'solo',
    allowCompanions: duo,
    model: 'qwen-image-edit-2511-lightning-8',
    retryVariant: 0,
  });
  return resolveSceneGuidePlan(plan.sceneText, 0, { ...plan.options, openPose: true }).figures
    .length;
}

describe('Day beat headcount', () => {
  it('every two-person beat in the pools is planned with two figures', () => {
    const pools: Array<[string, string[]]> = PARTS.flatMap(part => [
      ['everyday', DAY_SLOT_COMPANION_BEAT_PRESETS[part] ?? []] as [string, string[]],
      ['everyday', DAY_LATE_SLOT_COMPANION_BEAT_PRESETS[part] ?? []] as [string, string[]],
      ['suggestive', DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS[part] ?? []] as [string, string[]],
      ['vacation', dayVacationDuoBeatPresetsForSlot(part)] as [string, string[]],
    ]);
    const solo = pools.flatMap(([mood, beats]) =>
      beats.filter(beat => figuresFor(beat, mood, true) < 2)
    );
    // Live 2026-10-01: "piggyback ride on a friend's back", "high-fiving a friend" and "head
    // resting on a friend's shoulder" were drawn and prompted as one woman alone, on every engine.
    assert.deepEqual(solo, []);
  });

  it('no solo Everyday beat is read as two people', () => {
    const beats = PARTS.flatMap(part => [
      ...(DAY_SLOT_BEAT_PRESETS[part] ?? []),
      ...(DAY_LATE_SLOT_BEAT_PRESETS[part] ?? []),
    ]);
    assert.deepEqual(
      beats.filter(beat => countPoseGuidePeople(beat) > 1),
      []
    );
  });

  it('a friend in contact or across the table is in frame; a friend off-stage is not', () => {
    for (const beat of [
      "piggyback ride on a friend's back across the park, both laughing",
      'high-fiving a friend after the farmers market haul',
      "sitting on the steps, head resting on a friend's shoulder",
      'seated across a brunch table from a friend, both mid-laugh',
      'walking a friend’s bike alongside them on the promenade',
    ]) {
      assert.equal(countPoseGuidePeople(beat), 2, beat);
    }
    for (const beat of [
      'leaning on the railing, texting a friend',
      "wearing a friend's jacket on the walk home",
      'waving to a friend across the street',
    ]) {
      assert.equal(countPoseGuidePeople(beat), 1, beat);
    }
  });
});
