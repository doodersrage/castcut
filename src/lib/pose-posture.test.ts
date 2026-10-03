import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { synthesizeStickSkeleton } from './day-pose-guide';
import { stickToOpenPoseKeypoints } from './pose-guide-openpose';
import type { NormalizedBody } from './pose-library';
import {
  classifyPosture,
  postureMismatch,
  postureUnsure,
  withoutEdgeJoints,
  type PostureRead,
} from './pose-posture';

type Base = 'stand' | 'walk' | 'sit' | 'crouch' | 'kneel' | 'lie';

function figure(base: Base): NormalizedBody {
  return stickToOpenPoseKeypoints(
    synthesizeStickSkeleton(
      { base, armLeft: 'down', armRight: 'down', lean: 0, stride: 0.2, seed: 11, people: 1, label: base },
      { centerX: 0.5 }
    )
  ).map(p => (p ? { x: p.x / 512, y: p.y / 768 } : null));
}

/** A body from named joints on a square canvas (0–1). */
function body(joints: Partial<Record<number, [number, number]>>): NormalizedBody {
  return Array.from({ length: 18 }, (_, i) => {
    const p = joints[i];
    return p ? { x: p[0], y: p[1] } : null;
  });
}

const read = (posture: PostureRead['posture'], group: PostureRead['group'], confident = true) =>
  ({ posture, group, confident, facing: 'camera', tiltDeg: 0 }) as PostureRead;

describe('pose posture class', () => {
  it('reads the drawn guide postures', () => {
    const aspect = 2 / 3;
    assert.equal(classifyPosture(figure('stand'), aspect).posture, 'standing');
    assert.equal(classifyPosture(figure('walk'), aspect).group, 'upright');
    assert.equal(classifyPosture(figure('sit'), aspect).posture, 'sitting');
    assert.equal(classifyPosture(figure('kneel'), aspect).posture, 'kneeling');
    assert.equal(classifyPosture(figure('lie'), aspect).group, 'lying');
    assert.equal(classifyPosture(figure('stand'), aspect).confident, true);
  });

  it('reads bending, all fours, lying on the front and upside down', () => {
    // Bent at the waist: torso level, legs straight down.
    const bent = body({ 0: [0.25, 0.45], 1: [0.3, 0.4], 2: [0.3, 0.38], 5: [0.3, 0.42], 8: [0.6, 0.42], 11: [0.6, 0.44], 9: [0.6, 0.65], 12: [0.61, 0.66], 10: [0.6, 0.9], 13: [0.61, 0.9] });
    assert.equal(classifyPosture(bent, 1).posture, 'bending');
    // Hands and knees: torso level, knees under the hips, shins flat behind.
    const fours = body({ 0: [0.2, 0.42], 1: [0.25, 0.45], 2: [0.25, 0.43], 5: [0.25, 0.47], 8: [0.55, 0.45], 11: [0.55, 0.47], 9: [0.56, 0.7], 12: [0.57, 0.71], 10: [0.8, 0.72], 13: [0.81, 0.73] });
    assert.equal(classifyPosture(fours, 1).posture, 'all-fours');
    // Prone on the forearms: elbows under the shoulders, head up.
    const prone = body({ 0: [0.15, 0.52], 1: [0.22, 0.6], 2: [0.22, 0.56], 3: [0.2, 0.72], 5: [0.24, 0.64], 6: [0.22, 0.75], 8: [0.55, 0.66], 11: [0.55, 0.7], 9: [0.75, 0.68], 12: [0.75, 0.72], 10: [0.95, 0.7], 13: [0.94, 0.72] });
    assert.equal(classifyPosture(prone, 1).posture, 'lying-front');
    // On the side: shoulders stacked (short shoulder line).
    const side = body({ 0: [0.15, 0.55], 1: [0.22, 0.6], 2: [0.22, 0.59], 5: [0.23, 0.62], 8: [0.55, 0.62], 11: [0.55, 0.64], 9: [0.75, 0.63], 12: [0.75, 0.66], 10: [0.95, 0.64], 13: [0.95, 0.66] });
    assert.equal(classifyPosture(side, 1).posture, 'lying-side');
    // Handstand: neck below the hips.
    const handstand = body({ 0: [0.5, 0.85], 1: [0.5, 0.75], 2: [0.45, 0.75], 5: [0.55, 0.75], 8: [0.48, 0.45], 11: [0.52, 0.45], 9: [0.48, 0.25], 12: [0.52, 0.25], 10: [0.48, 0.05], 13: [0.52, 0.05] });
    assert.equal(classifyPosture(handstand, 1).posture, 'upside-down');
  });

  it('reads a lifted knee as standing — the supporting leg carries the posture', () => {
    const kick = body({ 0: [0.5, 0.1], 1: [0.5, 0.2], 2: [0.44, 0.2], 5: [0.56, 0.2], 8: [0.47, 0.5], 11: [0.53, 0.5], 9: [0.47, 0.7], 10: [0.47, 0.9], 12: [0.65, 0.5], 13: [0.7, 0.68] });
    assert.equal(classifyPosture(kick, 1).posture, 'standing');
  });

  it('is scale and translation invariant', () => {
    const sit = figure('sit');
    const small = sit.map(p => (p ? { x: 0.7 + p.x * 0.2, y: 0.1 + p.y * 0.2 } : null));
    assert.equal(classifyPosture(small, 2 / 3).posture, 'sitting');
  });

  it('treats missing torso joints as unknown, never a miss', () => {
    const headOnly = body({ 0: [0.5, 0.2], 14: [0.48, 0.18], 15: [0.52, 0.18] });
    const reading = classifyPosture(headOnly, 1);
    assert.equal(reading.posture, 'unknown');
    assert.equal(reading.confident, false);
    assert.equal(postureMismatch(classifyPosture(figure('lie'), 2 / 3), reading), false);
  });

  it('drops joints DWPose clamped onto the frame edge (cropped legs are not kneeling)', () => {
    const cropped = body({ 0: [0.52, 0.28], 1: [0.58, 0.39], 2: [0.47, 0.38], 5: [0.69, 0.4], 8: [0.46, 0.71], 11: [0.59, 0.72], 9: [0.47, 0.99], 12: [0.54, 0.995], 13: [0.52, 1] });
    assert.equal(classifyPosture(cropped, 0.75).posture, 'kneeling');
    assert.notEqual(classifyPosture(withoutEdgeJoints(cropped), 0.75).posture, 'kneeling');
  });

  it('calls a miss only on confident reads in incompatible groups', () => {
    assert.equal(postureMismatch(read('lying-back', 'lying'), read('sitting', 'seated')), true);
    assert.equal(postureMismatch(read('standing', 'upright'), read('kneeling', 'low')), true);
    // Seated and low read alike from 2D (a squat, sitting back on the heels).
    assert.equal(postureMismatch(read('sitting', 'seated'), read('crouching', 'low')), false);
    assert.equal(postureMismatch(read('lying-back', 'lying'), read('lying-front', 'lying')), false);
    assert.equal(postureMismatch(read('lying-back', 'lying'), read('sitting', 'seated', false)), false);
    assert.equal(postureUnsure(read('lying-back', 'lying'), read('sitting', 'seated', false)), true);
    assert.equal(postureUnsure(read('lying-back', 'lying'), read('lying-side', 'lying', false)), false);
  });
});
