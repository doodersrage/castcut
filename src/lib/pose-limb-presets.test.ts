import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARM_PRESETS,
  LEG_PRESETS,
  applyArmPreset,
  applyLegPreset,
  legsAreStanding,
  matchLimb,
} from './pose-limb-presets';
import { poseStarterBody } from './pose-starters';

const ASPECT = 2 / 3;
const stand = () => poseStarterBody('stand');
const span = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);

describe('arm presets', () => {
  it('keep the bone lengths and leave the rest of the body alone', () => {
    const before = stand();
    for (const { id } of ARM_PRESETS) {
      const after = applyArmPreset(before, id, 'both', ASPECT);
      for (const [root, mid, end] of [
        [2, 3, 4],
        [5, 6, 7],
      ] as const) {
        assert.ok(Math.abs(span(after[root]!, after[mid]!) - span(before[root]!, before[mid]!)) < 0.004, id);
        assert.ok(Math.abs(span(after[mid]!, after[end]!) - span(before[mid]!, before[end]!)) < 0.004, id);
      }
      for (const joint of [0, 1, 2, 5, 8, 9, 10, 11, 12, 13]) {
        assert.deepEqual(after[joint], before[joint], `${id} moved joint ${joint}`);
      }
    }
  });

  it('put the hands where the name says', () => {
    const body = stand();
    const up = applyArmPreset(body, 'up', 'both', ASPECT);
    assert.ok(up[4]!.y < up[0]!.y && up[7]!.y < up[0]!.y, 'hands above the head');
    const hips = applyArmPreset(body, 'hips', 'both', ASPECT);
    assert.ok(
      span(hips[4]!, hips[8]!) < 0.09 && span(hips[7]!, hips[11]!) < 0.09,
      'hands at the hips'
    );
    const head = applyArmPreset(body, 'head', 'both', ASPECT);
    assert.ok(span(head[4]!, head[0]!) < 0.06 && head[3]!.y < head[2]!.y, 'hands at the head, elbows up');
    // Elbows point away from the body.
    assert.ok(hips[3]!.x < hips[2]!.x && hips[6]!.x > hips[5]!.x);
    const out = applyArmPreset(body, 'out', 'both', ASPECT);
    assert.ok(Math.abs(out[4]!.y - out[2]!.y) < 0.03 && out[4]!.x < out[3]!.x);
    const crossed = applyArmPreset(body, 'crossed', 'both', ASPECT);
    assert.ok(crossed[4]!.x > crossed[3]!.x && crossed[7]!.x < crossed[6]!.x, 'forearms fold inward');
  });

  it('one side only leaves the other arm as it was', () => {
    const body = stand();
    const waved = applyArmPreset(body, 'wave', 'right', ASPECT);
    assert.notDeepEqual(waved[4], body[4]);
    assert.deepEqual([waved[5], waved[6], waved[7]], [body[5], body[6], body[7]]);
    assert.ok(waved[4]!.y < waved[2]!.y, 'the waving hand is above the shoulder');
  });
});

describe('leg presets', () => {
  it('keep the bone lengths, the hips and the upper body', () => {
    const before = stand();
    for (const { id } of LEG_PRESETS) {
      const after = applyLegPreset(before, id, 'both', ASPECT);
      for (const [root, mid, end] of [
        [8, 9, 10],
        [11, 12, 13],
      ] as const) {
        assert.ok(Math.abs(span(after[root]!, after[mid]!) - span(before[root]!, before[mid]!)) < 0.004, id);
        assert.ok(Math.abs(span(after[mid]!, after[end]!) - span(before[mid]!, before[end]!)) < 0.004, id);
      }
      for (const joint of [0, 1, 2, 3, 4, 5, 6, 7, 8, 11]) {
        assert.deepEqual(after[joint], before[joint], `${id} moved joint ${joint}`);
      }
    }
  });

  it('apart spreads the feet, crossed crosses them, knee up lifts one knee', () => {
    const body = stand();
    const feet = (b: typeof body) => b[13]!.x - b[10]!.x;
    assert.ok(feet(applyLegPreset(body, 'wide', 'both', ASPECT)) > feet(applyLegPreset(body, 'apart', 'both', ASPECT)));
    assert.ok(feet(applyLegPreset(body, 'apart', 'both', ASPECT)) > feet(applyLegPreset(body, 'together', 'both', ASPECT)));
    assert.ok(feet(applyLegPreset(body, 'crossed', 'both', ASPECT)) < 0, 'ankles swap sides');
    const knee = applyLegPreset(body, 'knee', 'both', ASPECT);
    assert.ok(knee[9]!.y < body[9]!.y - 0.1, 'their right knee is raised');
    assert.deepEqual([knee[12], knee[13]], [body[12], body[13]], 'the other leg stays planted');
  });
});

describe('matchLimb', () => {
  it('mirrors one arm onto the other across the body', () => {
    const waved = applyArmPreset(stand(), 'wave', 'right', ASPECT);
    const both = matchLimb(waved, 'arm', 'right');
    assert.ok(Math.abs(both[7]!.y - both[4]!.y) < 1e-9);
    assert.ok(Math.abs(both[7]!.x - both[5]!.x + (both[4]!.x - both[2]!.x)) < 1e-9);
    assert.deepEqual([both[2], both[3], both[4]], [waved[2], waved[3], waved[4]]);
  });
});

describe('legsAreStanding', () => {
  it('is true on her feet (also with one knee up), false seated, kneeling or lying', () => {
    assert.equal(legsAreStanding(stand(), ASPECT), true);
    assert.equal(legsAreStanding(poseStarterBody('walk'), ASPECT), true);
    assert.equal(legsAreStanding(applyLegPreset(stand(), 'knee', 'both', ASPECT), ASPECT), true);
    assert.equal(legsAreStanding(poseStarterBody('sit'), ASPECT), false);
    assert.equal(legsAreStanding(poseStarterBody('lie'), ASPECT), false);
  });
});
