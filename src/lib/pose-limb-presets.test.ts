import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARM_PRESETS,
  HEAD_DIRECTIONS,
  LEG_PRESETS,
  applyArmPreset,
  applyHeadDirection,
  applyLegPreset,
  legsAreStanding,
  matchLimb,
  readHeadDirection,
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

describe('head direction', () => {
  const FACE = [0, 14, 15, 16, 17];
  const BODY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const close = (a: ReturnType<typeof stand>, b: ReturnType<typeof stand>, within: number) =>
    a.every((point, index) => {
      const other = b[index];
      return point && other ? span(point, other) < within : !point === !other;
    });
  // Front and tipped faces: ear to ear. A profile: nose to the one ear, 1.13 of a head radius
  // where ear to ear is 1.7.
  const headSize = (body: ReturnType<typeof stand>) =>
    body[16] && body[17] ? span(body[16], body[17]) : (span(body[0]!, (body[16] ?? body[17])!) * 1.7) / 1.13;

  it('moves only the face: the neck and the rest of the body stay', () => {
    for (const starter of ['stand', 'walk', 'sit', 'kneel', 'lie'] as const) {
      const before = poseStarterBody(starter);
      for (const { id } of HEAD_DIRECTIONS) {
        const after = applyHeadDirection(before, id, ASPECT);
        for (const joint of BODY) {
          assert.deepEqual(after[joint], before[joint], `${starter} ${id} moved joint ${joint}`);
        }
      }
    }
  });

  it('straight leaves the standing starter as it is', () => {
    const before = stand();
    assert.ok(close(applyHeadDirection(before, 'straight', ASPECT), before, 0.001));
    assert.equal(readHeadDirection(before, ASPECT).direction, 'straight');
  });

  it('left and right are theirs: a profile with the far eye and ear hidden', () => {
    const before = stand();
    const left = applyHeadDirection(before, 'left', ASPECT);
    // Their left is the picture's right when they face the camera.
    assert.ok(left[0]!.x > before[0]!.x + 0.02, 'nose toward the picture right');
    assert.ok(left[14] && left[16], 'their right eye and ear still show');
    assert.deepEqual([left[15], left[17]], [null, null], 'the far side is hidden');
    assert.ok(left[16]!.x < left[14]!.x && left[14]!.x < left[0]!.x, 'ear, eye, nose in a row');
    const right = applyHeadDirection(before, 'right', ASPECT);
    assert.deepEqual([right[14], right[16]], [null, null]);
    // The standing starter is symmetric, so right is left in a mirror.
    for (const [mine, theirs] of [
      [0, 0],
      [15, 14],
      [17, 16],
    ] as const) {
      assert.ok(Math.abs(right[mine]!.x - (1 - left[theirs]!.x)) < 1e-9);
      assert.ok(Math.abs(right[mine]!.y - left[theirs]!.y) < 1e-9);
    }
  });

  it('seen from behind, their left is the picture left', () => {
    // Shoulders swapped across the picture without renaming: a back view.
    const back = stand().map(point => (point ? { x: 1 - point.x, y: point.y } : null));
    const left = applyHeadDirection(back, 'left', ASPECT);
    assert.ok(left[0]!.x < back[0]!.x - 0.02);
  });

  it('up and down move the nose against the eye line, ears where they were', () => {
    const before = stand();
    const eyeLine = (body: typeof before) => (body[14]!.y + body[15]!.y) / 2;
    const gap = (body: typeof before) => body[0]!.y - eyeLine(body);
    const up = applyHeadDirection(before, 'up', ASPECT);
    const down = applyHeadDirection(before, 'down', ASPECT);
    assert.ok(up[0]!.y < before[0]!.y && down[0]!.y > before[0]!.y);
    assert.ok(gap(up) < gap(before) && gap(before) < gap(down));
    for (const tipped of [up, down]) {
      assert.ok(span(tipped[16]!, before[16]!) < 1e-9 && span(tipped[17]!, before[17]!) < 1e-9);
    }
  });

  it('keeps the head size and does not drift, whatever the order of taps', () => {
    const before = stand();
    const size = headSize(before);
    let body = before;
    for (const id of ['left', 'left', 'up', 'right', 'down', 'right', 'left', 'straight', 'down', 'up']) {
      body = applyHeadDirection(body, id as (typeof HEAD_DIRECTIONS)[number]['id'], ASPECT);
      assert.ok(Math.abs(headSize(body) - size) < 1e-9, `${id} changed the head size`);
      assert.equal(readHeadDirection(body, ASPECT).direction, id);
      assert.ok(close(applyHeadDirection(body, id as never, ASPECT), body, 1e-9), `${id} twice moved`);
    }
    assert.ok(close(applyHeadDirection(body, 'straight', ASPECT), before, 0.001), 'back where it began');
  });

  it('a hidden far side comes back for straight', () => {
    const turned = applyHeadDirection(stand(), 'right', ASPECT);
    const straight = applyHeadDirection(turned, 'straight', ASPECT);
    assert.ok(FACE.every(index => straight[index]));
  });

  it('a body seen from the side keeps its profile; left and right do not apply', () => {
    const before = poseStarterBody('sit');
    assert.equal(readHeadDirection(before, ASPECT).sideOn, true);
    assert.deepEqual(applyHeadDirection(before, 'left', ASPECT), before);
    assert.deepEqual(applyHeadDirection(before, 'right', ASPECT), before);
    const straight = applyHeadDirection(before, 'straight', ASPECT);
    // Still facing the picture's right, where the starter looks.
    assert.ok(span(straight[0]!, before[0]!) < 0.02);
    assert.ok(straight[16] && !straight[17] && straight[16]!.x < straight[0]!.x);
    const up = applyHeadDirection(before, 'up', ASPECT);
    const down = applyHeadDirection(up, 'down', ASPECT);
    assert.ok(up[0]!.y < straight[0]!.y && down[0]!.y > straight[0]!.y);
    assert.equal(readHeadDirection(up, ASPECT).direction, 'up');
    assert.equal(readHeadDirection(down, ASPECT).direction, 'down');
    assert.ok(close(applyHeadDirection(down, 'straight', ASPECT), straight, 1e-9));
    // Lying down is side-on too, with no nose out in front to say which way the face points.
    const lying = poseStarterBody('lie');
    assert.equal(readHeadDirection(lying, ASPECT).sideOn, true);
    assert.deepEqual(applyHeadDirection(lying, 'left', ASPECT), lying);
    assert.ok(span(applyHeadDirection(lying, 'straight', ASPECT)[0]!, lying[0]!) < 1e-9);
  });

  it('leaves a figure without a neck alone, and a dragged head lights no chip', () => {
    const headless = stand().map((point, index) => (index === 1 ? null : point));
    assert.deepEqual(applyHeadDirection(headless, 'left', ASPECT), headless);
    const dragged = stand().map((point, index) =>
      index === 0 && point ? { x: point.x + 0.03, y: point.y + 0.03 } : point
    );
    assert.equal(readHeadDirection(dragged, ASPECT).direction, null);
  });
});
