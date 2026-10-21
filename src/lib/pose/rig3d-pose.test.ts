import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Quaternion, Vector3 } from 'three';
import type { NormalizedBody } from './library';
import { normalizeMyPose } from './my-poses';
import { normalizePoseRig3d, type PoseRig3d, type PoseRig3dCamera } from './rig3d';
import {
  DEFAULT_CAMERA,
  cloneFigure,
  faceWorld,
  figureWorld,
  flipLimbDepth,
  gazePoint,
  liftBodies,
  liftBody,
  limbJoints,
  limbTwistExcess,
  lookAt,
  makeCamera,
  mirrorFigure,
  projectFigure,
  projectPoint,
  restFigure,
  rigProjectionError,
  solveLimbIK,
} from './rig3d-pose';
import { normalizePhotoPose } from '../day/pose-guide';

const ROOT = join(__dirname, '..', '..', '..');
const ASPECT = 2 / 3;

function meanError(a: NormalizedBody, b: NormalizedBody, aspect: number, joints = 18) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < joints; i += 1) {
    const p = a[i];
    const q = b[i];
    if (!p || !q) continue;
    sum += Math.hypot((p.x - q.x) * aspect, p.y - q.y);
    count += 1;
  }
  return sum / Math.max(1, count);
}

describe('projecting the rig to OpenPose points', () => {
  it('a figure facing the camera has its right on the picture’s left and its whole face', () => {
    const body = projectFigure(restFigure('female'), DEFAULT_CAMERA, ASPECT);
    assert.equal(body.length, 18);
    assert.ok(body.slice(0, 14).every(Boolean), 'every body joint is drawn');
    assert.ok(body[2]!.x < body[5]!.x, 'right shoulder on the left of the picture');
    assert.ok(body[8]!.x < body[11]!.x, 'right hip on the left of the picture');
    assert.ok(body[0]!.y < body[1]!.y, 'nose above the neck');
    assert.ok(body[1]!.y < body[8]!.y && body[8]!.y < body[9]!.y && body[9]!.y < body[10]!.y);
    for (const joint of [0, 14, 15, 16, 17]) assert.ok(body[joint], `face point ${joint}`);
  });

  it('seen from behind, the nose and eyes are hidden and the sides swap', () => {
    const behind: PoseRig3dCamera = { ...DEFAULT_CAMERA, position: [0, 1, -5.4] };
    const body = projectFigure(restFigure('female'), behind, ASPECT);
    assert.equal(body[0], null);
    assert.equal(body[14], null);
    assert.equal(body[15], null);
    assert.ok(body[16] && body[17], 'both ears show from behind');
    assert.ok(body[2]!.x > body[5]!.x, 'right shoulder on the right of the picture');
  });

  it('in profile, the far ear is hidden', () => {
    const figure = restFigure('female');
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    figure.bones.hips = new Quaternion(...figure.bones.hips!).premultiply(turn).toArray() as [
      number,
      number,
      number,
      number,
    ];
    const body = projectFigure(figure, DEFAULT_CAMERA, ASPECT);
    // Turned to her left: her right side faces the camera, her left ear is behind the head.
    assert.ok(body[16], 'near ear');
    assert.equal(body[17], null);
  });

  it('rigProjectionError is small for the rig’s own projection, infinite for another headcount', () => {
    const rig = liftBodies([projectFigure(restFigure('female'), DEFAULT_CAMERA, ASPECT)], ASPECT);
    const own = rig.figures.map(f => projectFigure(f, rig.camera, ASPECT));
    assert.ok(rigProjectionError(rig, own, ASPECT) < 1e-4);
    assert.equal(rigProjectionError(rig, [...own, ...own], ASPECT), Infinity);
  });
});

describe('lifting flat poses into the rig', () => {
  it('a projected rest pose lifts back to (nearly) the same points', () => {
    const flat = projectFigure(restFigure('female'), DEFAULT_CAMERA, ASPECT);
    const back = projectFigure(liftBody(flat, ASPECT), DEFAULT_CAMERA, ASPECT);
    assert.ok(meanError(flat, back, ASPECT, 14) < 0.004, `${meanError(flat, back, ASPECT, 14)}`);
  });

  it('every one-person reference pose round-trips closely (lift → project)', () => {
    const refs = JSON.parse(readFileSync(join(ROOT, 'public/pose-references.json'), 'utf8')) as {
      references: Array<{ id: string; aspect: number; people: NormalizedBody[] }>;
    };
    const solo = refs.references.filter(ref => ref.people.length === 1);
    assert.ok(solo.length > 200);
    let all = 0;
    let body = 0;
    for (const ref of solo) {
      const flat = ref.people[0]!;
      const back = projectFigure(liftBody(flat, ref.aspect), DEFAULT_CAMERA, ref.aspect);
      all += meanError(flat, back, ref.aspect);
      body += meanError(flat, back, ref.aspect, 14);
    }
    all /= solo.length;
    body /= solo.length;
    // Measured 2026-10-21: 0.78% of the picture height over all points, 0.35% over the body
    // joints (scripts/pose-3d/lift-report.mts prints the breakdown).
    assert.ok(all < 0.012, `mean error ${all}`);
    assert.ok(body < 0.006, `body mean error ${body}`);
  });

  it('a figure turned away reads as turned away (no nose → back to the camera)', () => {
    const behind: PoseRig3dCamera = { ...DEFAULT_CAMERA, position: [0, 1, -5.4] };
    // A back view, as the default camera sees it.
    const flat = projectFigure(restFigure('female'), behind, ASPECT);
    const figure = liftBody(flat, ASPECT);
    const world = figureWorld(figure);
    const facing = new Vector3(0, 0, 1).applyQuaternion(world.quat.hips!);
    assert.ok(facing.z < -0.5, `chest faces away from the camera (${facing.z})`);
  });
});

describe('IK and joint limits', () => {
  it('a hand reaches a target within reach', () => {
    const figure = restFigure('female');
    const target = new Vector3(-0.35, 1.25, 0.35);
    solveLimbIK(figure, 'R', 'arm', target);
    const { end } = limbJoints(figure, 'R', 'arm');
    assert.ok(end.distanceTo(target) < 0.002, `${end.distanceTo(target)}`);
  });

  it('knees and elbows never bend backwards, wherever the hand or foot is dragged', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let trial = 0; trial < 60; trial += 1) {
      const figure = restFigure('female');
      const footTarget = new Vector3(0.1 + random() * 0.4 - 0.2, random() * 0.9, random() - 0.5);
      solveLimbIK(figure, 'L', 'leg', footTarget);
      assert.equal(limbTwistExcess(figure, 'L', 'leg'), 0);
      // The knee sits in front of the hip–ankle line (the figure faces +z).
      const { root, mid, end } = limbJoints(figure, 'L', 'leg');
      const line = end.clone().sub(root).normalize();
      const offset = mid.clone().sub(root);
      offset.sub(line.multiplyScalar(offset.dot(line)));
      if (offset.length() > 0.02) assert.ok(offset.z > -0.01, `knee bent backwards: ${offset.z}`);

      const handTarget = new Vector3(random() - 0.5, 0.6 + random() * 1.2, random() - 0.5);
      solveLimbIK(figure, 'R', 'arm', handTarget);
      assert.equal(limbTwistExcess(figure, 'R', 'arm'), 0);
    }
  });

  it('the head turns toward a point, but no further than a neck can', () => {
    const figure = restFigure('female');
    lookAt(figure, new Vector3(2, 1.5, 0.3));
    const face = faceWorld(figure);
    assert.ok(face.forward.x > 0.6, 'turned toward her left');
    const behind = restFigure('female');
    lookAt(behind, new Vector3(0, 1.5, -3));
    const turned = faceWorld(behind);
    assert.ok(turned.forward.z > -0.2, 'never looks straight behind');
    const gaze = gazePoint(figure);
    assert.ok(gaze.distanceTo(figureWorld(figure).pos.head!) < 0.6);
  });
});

describe('mirror and flip depth', () => {
  it('mirroring twice is the same pose; once swaps sides in the picture', () => {
    const figure = restFigure('female');
    solveLimbIK(figure, 'R', 'arm', new Vector3(-0.3, 1.5, 0.3));
    const twice = mirrorFigure(mirrorFigure(figure));
    const a = projectFigure(figure, DEFAULT_CAMERA, ASPECT);
    const b = projectFigure(twice, DEFAULT_CAMERA, ASPECT);
    assert.ok(meanError(a, b, ASPECT) < 1e-4);
    const once = projectFigure(mirrorFigure(figure), DEFAULT_CAMERA, ASPECT);
    // Her raised right wrist is now her left, on the other side of the picture.
    assert.ok(Math.abs(once[7]!.x - (1 - a[4]!.x)) < 0.01);
    assert.ok(Math.abs(once[7]!.y - a[4]!.y) < 0.01);
  });

  it('flipping a limb keeps the picture and moves the limb along the line of sight', () => {
    const figure = restFigure('female');
    solveLimbIK(figure, 'R', 'arm', new Vector3(-0.25, 1.1, 0.35));
    const before = projectFigure(figure, DEFAULT_CAMERA, ASPECT);
    const handBefore = limbJoints(figure, 'R', 'arm').end;
    const flipped = cloneFigure(figure);
    assert.equal(flipLimbDepth(flipped, DEFAULT_CAMERA, ASPECT, 'R', 'arm'), true);
    const after = projectFigure(flipped, DEFAULT_CAMERA, ASPECT);
    assert.ok(meanError(before, after, ASPECT, 14) < 0.003, `${meanError(before, after, ASPECT, 14)}`);
    const handAfter = limbJoints(flipped, 'R', 'arm').end;
    assert.ok(handAfter.distanceTo(handBefore) > 0.1, 'the hand moved in depth');
    assert.equal(limbTwistExcess(flipped, 'R', 'arm'), 0);
  });

  it('the camera maps a world point to the picture', () => {
    const cam = makeCamera(DEFAULT_CAMERA, ASPECT);
    const centre = projectPoint(cam, new Vector3(...DEFAULT_CAMERA.target));
    assert.ok(Math.abs(centre.x - 0.5) < 1e-6 && Math.abs(centre.y - 0.5) < 1e-6);
  });
});

describe('storing the rig', () => {
  const rig: PoseRig3d = liftBodies(
    [projectFigure(restFigure('female'), DEFAULT_CAMERA, ASPECT)],
    ASPECT
  );

  it('normalizePoseRig3d keeps a valid rig and refuses a broken one', () => {
    const kept = normalizePoseRig3d(JSON.parse(JSON.stringify(rig)));
    assert.ok(kept);
    assert.deepEqual(Object.keys(kept.figures[0]!.bones).sort(), Object.keys(rig.figures[0]!.bones).sort());
    assert.equal(normalizePoseRig3d({ ...rig, version: 2 }), undefined);
    assert.equal(normalizePoseRig3d({ ...rig, camera: { ...rig.camera, fov: 'wide' } }), undefined);
    assert.equal(normalizePoseRig3d(rig, 2), undefined, 'figure count must match the people');
  });

  it('a slot’s photo pose and My poses keep the rig through storage', () => {
    const people = rig.figures.map(f => projectFigure(f, rig.camera, ASPECT));
    const pose = { aspect: ASPECT, people, source: 'edited', rig3d: rig };
    const stored = normalizePhotoPose(JSON.parse(JSON.stringify(pose)));
    assert.ok(stored?.rig3d, 'normalizePhotoPose keeps rig3d');
    assert.ok(rigProjectionError(stored.rig3d, stored.people, ASPECT) < 1e-3);
    const mine = normalizeMyPose({ name: 'Mine', pose: JSON.parse(JSON.stringify(pose)) });
    assert.ok(mine?.pose.rig3d, 'normalizeMyPose keeps rig3d');
  });
});
