import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bestOfTwoDecision,
  bestOfTwoFailedPatch,
  bestOfTwoFirstTake,
  bestOfTwoMark,
  bestOfTwoPending,
  bestOfTwoPickPatch,
  isDayHardPose,
  pickBetterTake,
  scoreTakePose,
} from './day-best-of-two';
import { normalizeDaySlotStills, restorePreviousDayTake, upsertDaySlotStill } from './day-planner';
import type { DaySlotStill } from './day-planner';

const landed: DaySlotStill = {
  slotId: 'morning',
  status: 'completed',
  promptId: 'p1',
  imageUrl: '/first.png',
};

const base = {
  enabled: true,
  autoReview: false,
  still: landed,
  poseKey: 'lie_side:1',
  poseScore: 0.55,
};

/** The still once the second take (p2) has landed, the first kept as the pair's other take. */
const secondLanded: DaySlotStill = {
  slotId: 'morning',
  status: 'completed',
  promptId: 'p2',
  imageUrl: '/second.png',
  previousTake: bestOfTwoFirstTake(landed, '/first.png', 0.55),
};

describe('day best of two — hard poses', () => {
  it('knows the lying, kneeling, floor, climbing and bending layouts', () => {
    for (const key of ['lie:1', 'kneel:1', 'crouch:1', 'sit_floor:1', 'lie_front:1']) {
      assert.equal(isDayHardPose(key), true, key);
    }
    for (const key of ['bend_pick:1', 'climb:1', 'sport_plank:1', 'missionary:2', 'lie_side']) {
      assert.equal(isDayHardPose(key), true, key);
    }
    for (const key of ['stand:1', 'walk:1', 'phone:1', 'hug:2', 'sit:1', '', null, undefined]) {
      assert.equal(isDayHardPose(key), false, String(key));
    }
  });
});

describe('day best of two — decision', () => {
  it('queues a second take for a hard pose once the switch is on', () => {
    assert.deepEqual(bestOfTwoDecision(base), { action: 'queue-second', firstScore: 0.55 });
    assert.deepEqual(bestOfTwoDecision({ ...base, enabled: false }), {
      action: 'none',
      skip: 'off',
    });
  });

  it('leaves the pose to Auto-review when it is on', () => {
    assert.deepEqual(bestOfTwoDecision({ ...base, autoReview: true }), {
      action: 'none',
      skip: 'auto-review',
    });
  });

  it('never doubles an easy pose, a still without a guide, or one not landed', () => {
    assert.deepEqual(bestOfTwoDecision({ ...base, poseKey: 'stand:1' }), {
      action: 'none',
      skip: 'easy-pose',
    });
    assert.deepEqual(bestOfTwoDecision({ ...base, poseKey: undefined }), {
      action: 'none',
      skip: 'easy-pose',
    });
    assert.deepEqual(bestOfTwoDecision({ ...base, still: { ...landed, status: 'running' } }), {
      action: 'none',
      skip: 'not-landed',
    });
  });

  it('needs a pose check to tell two takes apart', () => {
    assert.deepEqual(bestOfTwoDecision({ ...base, poseScore: null }), {
      action: 'none',
      skip: 'no-check',
    });
  });

  it('leaves a same-seed compare to the player', () => {
    const comparing = { ...landed, previousTake: { imageUrl: '/old.png', promptId: 'p0' } };
    assert.deepEqual(bestOfTwoDecision({ ...base, still: comparing }), {
      action: 'none',
      skip: 'comparing',
    });
  });

  it('picks the closer pose when the second take lands — never a third', () => {
    assert.equal(bestOfTwoPending(secondLanded), true);
    assert.deepEqual(bestOfTwoDecision({ ...base, still: secondLanded, poseScore: 0.8 }), {
      action: 'pick',
      keep: 'second',
      firstScore: 0.55,
      secondScore: 0.8,
    });
    assert.deepEqual(bestOfTwoDecision({ ...base, still: secondLanded, poseScore: 0.3 }), {
      action: 'pick',
      keep: 'first',
      firstScore: 0.55,
      secondScore: 0.3,
    });
    const picked = { ...secondLanded, bestOfTwo: { keptScore: 0.8, otherScore: 0.55 } };
    assert.equal(bestOfTwoPending(picked), false);
    assert.deepEqual(bestOfTwoDecision({ ...base, still: picked, poseScore: 0.1 }), {
      action: 'none',
      skip: 'picked',
    });
  });

  it('does nothing once the switch is off, even mid-pair (the player picks)', () => {
    assert.deepEqual(bestOfTwoDecision({ ...base, enabled: false, still: secondLanded }), {
      action: 'none',
      skip: 'off',
    });
  });

  it('a second take with no pose read keeps the first (scored) take', () => {
    assert.deepEqual(bestOfTwoDecision({ ...base, still: secondLanded, poseScore: null }), {
      action: 'pick',
      keep: 'first',
      firstScore: 0.55,
      secondScore: 0,
    });
  });
});

describe('day best of two — picking', () => {
  it('prefers the newer take on a tie, and any score over none', () => {
    assert.equal(pickBetterTake(0.6, 0.6), 'second');
    assert.equal(pickBetterTake(0.7, 0.6), 'first');
    assert.equal(pickBetterTake(null, 0.2), 'second');
    assert.equal(pickBetterTake(0.2, undefined), 'first');
    assert.equal(pickBetterTake(Number.NaN, null), 'second');
  });

  it('keeping the second leaves the first as the other take', () => {
    const patch = bestOfTwoPickPatch(secondLanded, '/second.png', {
      keep: 'second',
      firstScore: 0.55,
      secondScore: 0.8,
    });
    const [still] = upsertDaySlotStill([secondLanded], patch).filter(s => s.slotId === 'morning');
    assert.equal(still?.imageUrl, '/second.png');
    assert.equal(still?.promptId, 'p2');
    assert.equal(still?.previousTake?.imageUrl, '/first.png');
    assert.deepEqual(still?.bestOfTwo, { keptScore: 0.8, otherScore: 0.55 });
    assert.equal(bestOfTwoMark(still), 'Best of two · pose 80% (other 55%)');
  });

  it('keeping the first puts it back and keeps the second as the other take', () => {
    const finished = { ...secondLanded, finishedUrl: '/second-face.png', finishedFor: 'p2' };
    const patch = bestOfTwoPickPatch(finished, '/second-face.png', {
      keep: 'first',
      firstScore: 0.55,
      secondScore: 0.3,
    });
    const [still] = upsertDaySlotStill([finished], patch).filter(s => s.slotId === 'morning');
    assert.equal(still?.imageUrl, '/first.png');
    assert.equal(still?.promptId, 'p1');
    assert.equal(still?.status, 'completed');
    assert.equal(still?.finishedUrl, undefined);
    assert.deepEqual(still?.previousTake, {
      imageUrl: '/second-face.png',
      promptId: 'p2',
      kind: 'best-of-two',
      poseScore: 0.3,
    });
    // The swapped-back take is the pick: the pair is done.
    assert.deepEqual(bestOfTwoDecision({ ...base, still, poseScore: 0.55 }), {
      action: 'none',
      skip: 'picked',
    });
    // "Use the other take" swaps to the second and ends the pair.
    const other = restorePreviousDayTake([still!], 'morning')[0];
    assert.equal(other?.imageUrl, '/second-face.png');
    assert.equal(other?.previousTake, undefined);
    assert.equal(other?.bestOfTwo, undefined);
  });

  it('a failed second take puts the first back on its own', () => {
    const failed = { ...secondLanded, status: 'error' as const, imageUrl: undefined };
    const patch = bestOfTwoFailedPatch(failed);
    assert.ok(patch);
    const [still] = upsertDaySlotStill([failed], patch).filter(s => s.slotId === 'morning');
    assert.equal(still?.imageUrl, '/first.png');
    assert.equal(still?.status, 'completed');
    assert.equal(still?.previousTake, undefined);
    assert.equal(bestOfTwoFailedPatch(landed), null);
  });

  it('marks the card while the second take renders', () => {
    assert.equal(bestOfTwoMark({ ...secondLanded, status: 'running' }), 'Second take for the pose…');
    assert.equal(bestOfTwoMark(landed), null);
  });
});

describe('day best of two — storage', () => {
  it('keeps the pair through a save and load', () => {
    const [still] = normalizeDaySlotStills([
      { ...secondLanded, bestOfTwo: { keptScore: 0.8, otherScore: 0.55 } },
    ]);
    assert.equal(still?.previousTake?.kind, 'best-of-two');
    assert.equal(still?.previousTake?.poseScore, 0.55);
    assert.deepEqual(still?.bestOfTwo, { keptScore: 0.8, otherScore: 0.55 });
    const [plain] = normalizeDaySlotStills([
      { ...landed, previousTake: { imageUrl: '/old.png', promptId: 'p0' } },
    ]);
    assert.deepEqual(plain?.previousTake, { imageUrl: '/old.png', promptId: 'p0' });
    assert.equal(plain?.bestOfTwo, undefined);
  });
});

describe('day best of two — score adapter', () => {
  it('scores a take with the pose score (same guide, same pose = a full match)', () => {
    const body = Array.from({ length: 18 }, (_, index) => ({
      x: 0.3 + (index % 4) * 0.1,
      y: 0.1 + index * 0.04,
    }));
    const score = scoreTakePose({
      guide: [body],
      guideAspect: 0.75,
      detected: {
        canvas: { width: 750, height: 1000 },
        people: [body],
      },
    });
    assert.ok(score > 0.9, String(score));
  });
});
