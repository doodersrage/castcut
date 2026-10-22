import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Quaternion, Vector3 } from 'three';
import type { PoseRig3dFigure } from '@/lib/pose/rig3d';
import {
  DEFAULT_CAMERA,
  figureWorld,
  restFigure,
  setBoneWorldRotation,
} from '@/lib/pose/rig3d-pose';
import { moveBeat } from './edit';
import { restOf } from './motion';
import { feetAnchor, footContact, planFeet } from './plant';
import { levelHead, poseBeat, standingFigure, starterFigure, straightenInDepth } from './poses';
import { directionFrames } from './timeline';
import { DEFAULT_DIRECTOR_CAMERA, type Direction } from './types';

const body = 'female' as const;
const stand = standingFigure(body);
const sit = starterFigure('sit', body);
const stride = starterFigure('walk', body);

function direction(beats: Direction['beats']): Direction {
  return { version: 1, body, beats, camera: DEFAULT_DIRECTOR_CAMERA };
}

const SIDES = ['L', 'R'] as const;

/** How far a foot's ball slides along the floor while it is down, over every frame (m). */
function slide(frames: PoseRig3dFigure[], side: 'L' | 'R'): number {
  let total = 0;
  let prev: Vector3 | null = null;
  for (const figure of frames) {
    const foot = footContact(figure, side);
    const down = foot.down && foot.ball.y < 0.012;
    if (down && prev) total += Math.hypot(foot.ball.x - prev.x, foot.ball.z - prev.z);
    prev = down ? foot.ball : null;
  }
  return total;
}

/** The most a flat foot (ball and heel down) moves between two frames (m). */
function flatSlip(frames: PoseRig3dFigure[], side: 'L' | 'R'): number {
  const rest = restOf(body);
  let worst = 0;
  let prev: Vector3 | null = null;
  for (const figure of frames) {
    const world = figureWorld(figure);
    const ankle = world.pos[`foot_${side}`]!;
    const turn = world.quat[`foot_${side}`]!.clone().multiply(
      rest.world.quat[`foot_${side}`]!.clone().invert()
    );
    const heel = rest.heel.clone().applyQuaternion(turn).add(ankle);
    const ball = rest.ball.clone().applyQuaternion(turn).add(ankle);
    const flat = heel.y < 0.006 && ball.y < 0.006;
    if (flat && prev) worst = Math.max(worst, Math.hypot(ball.x - prev.x, ball.z - prev.z));
    prev = flat ? ball : null;
  }
  return worst;
}

describe('director: planted feet', () => {
  it('reads a foot on the floor, flat or up on its ball', () => {
    for (const side of SIDES) assert.ok(footContact(stand, side).down, side);
    // The walk starter's back foot is up on its ball.
    assert.ok(SIDES.every(side => footContact(stride, side).down));
    // Lying, the feet are on their sides: nothing to plant.
    const lie = starterFigure('lie', body);
    assert.ok(SIDES.every(side => !footContact(lie, side).down));
  });

  it('the same stance plants both feet where they are, and nothing moves', () => {
    const plan = planFeet(stand, stand);
    assert.equal(plan.L?.kind, 'plant');
    assert.equal(plan.R?.kind, 'plant');
    assert.deepEqual(feetAnchor(stand, stand), { x: 0, z: 0 });
  });

  it('sitting down from standing keeps the feet where they are (the hips go back)', () => {
    const frames = directionFrames(
      direction([poseBeat('Stand', stand, { first: true }), poseBeat('Sit', sit)])
    );
    for (const side of SIDES) assert.ok(slide(frames, side) < 0.05, `${side}: ${slide(frames, side)}`);
    // Without planting the feet slid about 0.4 m each.
  });

  it('a stride from standing is a step: one foot stays, the other lifts and lands', () => {
    const frames = directionFrames(
      direction([poseBeat('Stand', stand, { first: true }), poseBeat('Stride', stride)])
    );
    const rest = restOf(body);
    const lift = (side: 'L' | 'R') =>
      Math.max(...frames.map(f => figureWorld(f).pos[`foot_${side}`]!.y - rest.ankleH));
    const lifts = SIDES.map(lift).sort((a, b) => a - b);
    assert.ok(lifts[0]! < 0.035, `the standing foot stays down (${lifts[0]})`);
    assert.ok(lifts[1]! > 0.04, `the stepping foot lifts (${lifts[1]})`);
    for (const side of SIDES) assert.ok(slide(frames, side) < 0.03, `${side}: ${slide(frames, side)}`);
  });

  it('into a move: the feet stay put while the move blends in', () => {
    const frames = directionFrames(
      direction([poseBeat('Sit', sit, { first: true }), moveBeat('wave')])
    );
    for (const side of SIDES) assert.ok(slide(frames, side) < 0.05, `${side}: ${slide(frames, side)}`);
  });

  it('a walk plants the stance foot: a flat foot never slips', () => {
    const frames = directionFrames(
      direction([poseBeat('Stand', stand, { first: true }), moveBeat('walk')])
    );
    for (const side of SIDES) {
      assert.ok(flatSlip(frames, side) < 0.003, `${side}: ${flatSlip(frames, side)}`);
    }
  });

  it('a head read from the still is set level, facing where her hips face', () => {
    const figure = restFigure(body);
    // Tip the chest back: resetting the neck and head to rest would leave the face looking up.
    figure.bones.chest = [-0.17, 0, 0, 0.985];
    levelHead(figure, 0.4);
    const world = figureWorld(figure);
    const forward = new Vector3(0, 0, 1).applyQuaternion(
      world.quat.head!.clone().multiply(restOf(body).world.quat.head!.clone().invert())
    );
    assert.ok(Math.abs(forward.y) < 1e-3, `looks level (${forward.y})`);
    assert.ok(Math.abs(Math.atan2(forward.x, forward.z) - 0.4) < 1e-3, `faces ${JSON.stringify(forward)}`);
  });
  it('a still read as leaning toward or away from the camera stands straight', () => {
    const lean = (degrees: number) => {
      const figure = standingFigure(body);
      const world = figureWorld(figure);
      const tip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (degrees * Math.PI) / 180);
      setBoneWorldRotation(figure, 'spine', tip.multiply(world.quat.spine!));
      return figure;
    };
    const depth = (figure: PoseRig3dFigure) => {
      const w = figureWorld(figure);
      return w.pos.neck!.z - w.pos.hips!.z;
    };
    const back = lean(-18);
    assert.ok(depth(back) < -0.08, `leans back first (${depth(back)})`);
    straightenInDepth(back, DEFAULT_CAMERA);
    assert.ok(Math.abs(depth(back)) < 0.01, `straight (${depth(back)})`);
    // A bend over is a real pose: it stays.
    const bow = lean(45);
    const before = depth(bow);
    straightenInDepth(bow, DEFAULT_CAMERA);
    assert.equal(depth(bow), before);
  });
});
