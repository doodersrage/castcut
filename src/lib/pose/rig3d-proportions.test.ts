import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Vector3 } from 'three';
import { normalizePoseRig3d, type PoseRig3dFigure } from './rig3d';
import {
  DEFAULT_CAMERA,
  boneScale,
  cloneFigure,
  figureWorld,
  fitProportions,
  limbJoints,
  limbTwistExcess,
  liftBody,
  mirrorFigure,
  placeLimb,
  projectFigure,
  restFigure,
  solveLimbIK,
  turnFigure,
} from './rig3d-pose';
import { mixFigures } from '../director/figure-ops';

const ASPECT = 2 / 3;

const bone = (figure: PoseRig3dFigure, a: string, b: string) => {
  const world = figureWorld(figure);
  return world.pos[a]!.distanceTo(world.pos[b]!);
};

describe('a figure’s own proportions', () => {
  const base = restFigure('female');
  const own: PoseRig3dFigure = { ...cloneFigure(base), scale: { thigh: 1.1, forearm: 0.9 } };

  it('a segment drawn longer or shorter moves the joints after it, both sides alike', () => {
    for (const side of ['L', 'R']) {
      const thigh = bone(own, `thigh_${side}`, `shin_${side}`);
      assert.ok(Math.abs(thigh / bone(base, `thigh_${side}`, `shin_${side}`) - 1.1) < 1e-6);
      const forearm = bone(own, `forearm_${side}`, `hand_${side}`);
      assert.ok(Math.abs(forearm / bone(base, `forearm_${side}`, `hand_${side}`) - 0.9) < 1e-6);
      // Unscaled segments keep the base body's length.
      const shin = bone(own, `shin_${side}`, `foot_${side}`);
      assert.ok(Math.abs(shin - bone(base, `shin_${side}`, `foot_${side}`)) < 1e-9);
    }
    assert.equal(boneScale(own, 'clavicle_L'), 1);
    assert.equal(boneScale(base, 'thigh_L'), 1);
  });

  it('clone, mirror and turn keep them', () => {
    assert.deepEqual(cloneFigure(own).scale, own.scale);
    assert.deepEqual(mirrorFigure(own).scale, own.scale);
    const turned = cloneFigure(own);
    turnFigure(turned, 1);
    assert.deepEqual(turned.scale, own.scale);
  });

  it('IK reaches with her own lengths', () => {
    const figure = cloneFigure(own);
    const { root } = limbJoints(figure, 'R', 'leg');
    const target = root.clone().add(new Vector3(0, -0.76, 0.1));
    solveLimbIK(figure, 'R', 'leg', target);
    assert.ok(limbJoints(figure, 'R', 'leg').end.distanceTo(target) < 1e-3);
  });

  it('storage keeps them in range; a rig without them is the base body', () => {
    const rig = {
      version: 1,
      figures: [{ ...own, scale: { thigh: 1.1, shin: 3, forearm: 'long', upperarm: 1 } }],
      camera: DEFAULT_CAMERA,
    };
    const kept = normalizePoseRig3d(JSON.parse(JSON.stringify(rig)))!;
    assert.deepEqual(kept.figures[0]!.scale, { thigh: 1.1, shin: 1.25 });
    const plain = normalizePoseRig3d(JSON.parse(JSON.stringify({ ...rig, figures: [base] })))!;
    assert.equal(plain.figures[0]!.scale, undefined);
    assert.equal(boneScale(plain.figures[0]!, 'thigh_L'), 1);
  });

  it('the Director eases from her own proportions to the body’s own', () => {
    const half = mixFigures(own, base, 0.5);
    assert.ok(Math.abs(half.scale!.thigh! - 1.05) < 1e-9);
    assert.equal(mixFigures(own, base, 1).scale, undefined);
  });

  it('a picture whose legs look short for the body fits shorter legs, within range', () => {
    // The base body, its legs drawn 12% short.
    const short = { ...restFigure('female'), scale: { thigh: 0.88, shin: 0.88 } };
    const flat = projectFigure(short, DEFAULT_CAMERA, ASPECT);
    const depth = new Vector3(...DEFAULT_CAMERA.position).distanceTo(figureWorld(short).pos.hips!);
    const fitted = fitProportions(flat, ASPECT, depth)!;
    assert.ok(fitted.thigh! < 0.95 && fitted.thigh! >= 0.9 - 1e-9, `thigh ${fitted.thigh}`);
    assert.ok(!fitted.upperarm || Math.abs(fitted.upperarm - 1) < 0.05);
    // Lifted, the legs stand under her rather than swinging toward the camera.
    const lifted = liftBody(flat, ASPECT, { proportions: true });
    const world = figureWorld(lifted);
    const thigh = world.pos.shin_L!.clone().sub(world.pos.thigh_L!).normalize();
    assert.ok(Math.abs(thigh.z) < 0.35, `thigh along the line of sight ${thigh.z}`);
  });
});

describe('limbs read from a picture are not wrung round', () => {
  it('a straight leg read a hair bent the wrong way stays straight, not turned round', () => {
    const figure = restFigure('female');
    const { root, mid } = limbJoints(figure, 'L', 'leg');
    const thigh = mid.clone().sub(root);
    // The ankle 5° forward of straight: a knee bending the wrong way.
    const shin = thigh.clone().normalize().applyAxisAngle(new Vector3(1, 0, 0), (-5 * Math.PI) / 180);
    const end = mid.clone().add(shin.multiplyScalar(0.38));
    const lifted = cloneFigure(figure);
    placeLimb(lifted, 'L', 'leg', mid, end, true, true);
    assert.equal(limbTwistExcess(lifted, 'L', 'leg'), 0);
    // Without the lift's reading, the thigh turns round to bend the knee the natural way.
    const turned = cloneFigure(figure);
    placeLimb(turned, 'L', 'leg', mid, end, true);
    assert.ok(limbTwistExcess(turned, 'L', 'leg') > 1);
  });
});
