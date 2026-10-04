import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyPosture } from './pose-posture';
import {
  BODY18_FROM_COCO17,
  COCO17_NAMES,
  COCO_OCCLUDED_CONFIDENCE,
  cameraViewLabel,
  cocoKeypointsToBody,
  HIDDEN_BY_BODY_CONFIDENCE,
  HIDDEN_BY_LIMB_CONFIDENCE,
  HIDDEN_PAIR_CONFIDENCE,
  projectSkeletons,
  skeletonFacing,
  type Point3,
  type Skeleton3D,
} from './pose-reference-sources';

/** A COCO annotation: a person standing square to the camera in a 400 × 800 frame. */
function cocoStanding(visibility = 2): number[] {
  const points: Record<string, [number, number]> = {
    nose: [200, 100],
    left_eye: [210, 90],
    right_eye: [190, 90],
    left_ear: [225, 95],
    right_ear: [175, 95],
    left_shoulder: [260, 180],
    right_shoulder: [140, 180],
    left_elbow: [280, 300],
    right_elbow: [120, 300],
    left_wrist: [290, 410],
    right_wrist: [110, 410],
    left_hip: [240, 420],
    right_hip: [160, 420],
    left_knee: [240, 580],
    right_knee: [160, 580],
    left_ankle: [240, 740],
    right_ankle: [160, 740],
  };
  return COCO17_NAMES.flatMap(name => [...points[name]!, visibility]);
}

describe('COCO keypoints → app body', () => {
  const frame = { x: 0, y: 0, width: 400, height: 800 };

  it('maps every COCO-17 point once and adds the neck as the shoulder midpoint', () => {
    const sources = BODY18_FROM_COCO17.filter(index => index >= 0);
    assert.equal(new Set(sources).size, 17);
    const mapped = cocoKeypointsToBody(cocoStanding(), frame)!;
    assert.equal(mapped.body.length, 18);
    // Her right shoulder (COCO 6, at x 140) is COCO-18 joint 2; her left (COCO 5) joint 5.
    assert.deepEqual(mapped.body[2], { x: 0.35, y: 0.225 });
    assert.deepEqual(mapped.body[5], { x: 0.65, y: 0.225 });
    assert.deepEqual(mapped.body[1], { x: 0.5, y: 0.225 });
    // Right eye / ear (COCO 2 / 4) land on 14 / 16, left on 15 / 17.
    assert.deepEqual(mapped.body[14], { x: 0.475, y: 0.1125 });
    assert.deepEqual(mapped.body[17], { x: 0.5625, y: 0.1188 });
    assert.ok(mapped.confidence.every(c => c === 1));
    // The app reads it as the standing body it is.
    assert.equal(classifyPosture(mapped.body, 0.5).posture, 'standing');
  });

  it('normalizes to the crop frame', () => {
    const mapped = cocoKeypointsToBody(cocoStanding(), { x: 100, y: 50, width: 200, height: 750 })!;
    assert.deepEqual(mapped.body[0], { x: 0.5, y: 0.0667 });
  });

  it('drops unlabelled points, lowers hidden ones, and loses the neck with a shoulder', () => {
    const keypoints = cocoStanding();
    keypoints[5 * 3 + 2] = 0; // left shoulder unlabelled
    keypoints[9 * 3 + 2] = 1; // left wrist hidden
    const mapped = cocoKeypointsToBody(keypoints, frame)!;
    assert.equal(mapped.body[5], null);
    assert.equal(mapped.confidence[5], 0);
    assert.equal(mapped.body[1], null, 'no neck without both shoulders');
    assert.equal(mapped.confidence[7], COCO_OCCLUDED_CONFIDENCE);
    assert.ok(mapped.body[7]);
  });

  it('rejects malformed input', () => {
    assert.equal(cocoKeypointsToBody([1, 2, 3], frame), null);
    assert.equal(cocoKeypointsToBody(cocoStanding(), { ...frame, width: 0 }), null);
  });
});

/** A 1.75 m figure standing at the origin facing +Z, arms down, in metres (Y up). */
function standing3d(): Skeleton3D {
  const p = (x: number, y: number, z = 0): Point3 => [x, y, z];
  return {
    joints: [
      p(0, 1.62, 0.1), // nose, a little forward
      p(0, 1.45), // neck
      p(-0.18, 1.45), // right shoulder (her right = −X when facing +Z)
      p(-0.22, 1.17),
      p(-0.24, 0.9),
      p(0.18, 1.45), // left shoulder
      p(0.22, 1.17),
      p(0.24, 0.9),
      p(-0.1, 0.95), // right hip
      p(-0.1, 0.5),
      p(-0.1, 0.08),
      p(0.1, 0.95), // left hip
      p(0.1, 0.5),
      p(0.1, 0.08),
      p(-0.03, 1.65, 0.09), // right eye
      p(0.03, 1.65, 0.09),
      p(-0.08, 1.63, 0), // right ear
      p(0.08, 1.63, 0),
    ],
    headTop: p(0, 1.75),
    headBase: p(0, 1.52),
  };
}

describe('3D skeleton → camera view', () => {
  const figure = standing3d();

  it('reads which way the body faces from the hips', () => {
    assert.deepEqual(
      skeletonFacing(figure).map(v => Math.round(v * 100) / 100),
      [0, 0, 1]
    );
  });

  it('projects a front view the way a photo would read: her right on the picture left', () => {
    const shot = projectSkeletons([figure], { azimuthDeg: 0, elevationDeg: 0 })!;
    assert.ok(shot);
    const [body] = shot.people;
    assert.equal(body!.length, 18);
    assert.ok(body![2]!.x < body![5]!.x, 'her right shoulder on the picture left');
    assert.ok(body![0]!.y < body![1]!.y && body![1]!.y < body![8]!.y && body![8]!.y < body![10]!.y);
    // Cropped like the photo harvest: everyone inside 0–1 with a margin.
    for (const point of body!) {
      assert.ok(point && point.x > 0.05 && point.x < 0.95 && point.y > 0.05 && point.y < 0.95);
    }
    assert.ok(shot.aspect > 0.3 && shot.aspect < 0.6, `tall crop, got ${shot.aspect}`);
    assert.ok(shot.confidence[0]!.every(c => c === 1), 'nothing hidden head-on');
    assert.equal(classifyPosture(body!, shot.aspect).posture, 'standing');
    assert.equal(classifyPosture(body!, shot.aspect).facing, 'camera');
  });

  it('mirrors left and right from behind and loses the face', () => {
    const back = projectSkeletons([figure], { azimuthDeg: 180, elevationDeg: 0 })!;
    const [body] = back.people;
    assert.ok(body![2]!.x > body![5]!.x, 'her right shoulder on the picture right');
    // The nose and eyes sit behind the head: a detector would not report them.
    assert.ok(back.confidence[0]![0]! <= HIDDEN_BY_BODY_CONFIDENCE);
    assert.ok(back.confidence[0]![14]! <= HIDDEN_BY_BODY_CONFIDENCE);
    assert.equal(back.confidence[0]![16], 1, 'ears stay on the silhouette');
  });

  it('marks the far side low from side on, and keeps near joints', () => {
    const side = projectSkeletons([figure], { azimuthDeg: 90, elevationDeg: 0 })!;
    const conf = side.confidence[0]!;
    // Camera on her left: her left shoulder and hip are nearest (the hip behind the hanging
    // forearm at most), the right ones behind the torso, the right arm hidden altogether.
    assert.equal(conf[5], 1);
    assert.ok(conf[11]! >= HIDDEN_BY_LIMB_CONFIDENCE);
    assert.equal(conf[2], HIDDEN_PAIR_CONFIDENCE);
    assert.equal(conf[8], HIDDEN_PAIR_CONFIDENCE);
    assert.equal(conf[3], HIDDEN_BY_BODY_CONFIDENCE);
    assert.equal(conf[4], HIDDEN_BY_BODY_CONFIDENCE);
    // Shoulders stacked across the frame, as a detector sees a profile.
    const [body] = side.people;
    assert.ok(Math.abs(body![2]!.x - body![5]!.x) < 0.05);
  });

  it('a camera above shows the top of a lying body as the detector would', () => {
    // Lie her down on her back: swap Y and Z (head toward +Z, face up).
    const lying: Skeleton3D = {
      joints: figure.joints.map(p => (p ? ([p[0], 0.1 + p[2], p[1]] as Point3) : null)),
      headTop: [0, 0.1, 1.75],
      headBase: [0, 0.1, 1.52],
    };
    const shot = projectSkeletons([lying], { azimuthDeg: 90, elevationDeg: 25 })!;
    assert.ok(shot);
    const read = classifyPosture(shot.people[0]!, shot.aspect);
    assert.equal(read.group, 'lying');
    assert.ok(shot.aspect > 1.5, `wide crop, got ${shot.aspect}`);
  });

  it('projects two people into one frame with the lead first', () => {
    const partner: Skeleton3D = {
      ...figure,
      joints: figure.joints.map(p => (p ? ([p[0] + 0.7, p[1], p[2]] as Point3) : null)),
      headTop: [0.7, 1.75, 0],
      headBase: [0.7, 1.52, 0],
    };
    const shot = projectSkeletons([figure, partner], { azimuthDeg: 0 })!;
    assert.equal(shot.people.length, 2);
    assert.ok(shot.people[0]![1]!.x < shot.people[1]![1]!.x, 'the partner stands to her left');
    assert.ok(shot.aspect > 0.6);
  });

  it('names the view in words', () => {
    assert.equal(cameraViewLabel({ azimuthDeg: 0 }), 'front view');
    assert.equal(cameraViewLabel({ azimuthDeg: 40 }), 'three-quarter view from her left');
    assert.equal(cameraViewLabel({ azimuthDeg: -90, elevationDeg: 25 }), 'side view from her right, slightly high');
    assert.equal(cameraViewLabel({ azimuthDeg: 180 }), 'back view');
  });

  it('refuses a skeleton without a body', () => {
    assert.equal(projectSkeletons([{ joints: [null, null, null] }], { azimuthDeg: 0 }), null);
    assert.equal(projectSkeletons([], { azimuthDeg: 0 }), null);
  });
});
