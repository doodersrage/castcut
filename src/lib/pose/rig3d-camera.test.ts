import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Vector3 } from 'three';
import {
  CAMERA_DIRECTIONS,
  CAMERA_HEIGHTS,
  CAMERA_LENSES,
  CAMERA_SHOTS,
  DEFAULT_CAMERA_CHOICE,
  type FullCameraChoice,
} from './camera-shot';
import { normalizePoseRig3d, type PoseRig3d } from './rig3d';
import {
  CAMERA_LENS_FOV,
  cameraForChoice,
  figureFacing,
  readCameraChoice,
  rigCameraChoice,
} from './rig3d-camera';
import { cloneRig, liftBodies, projectRig, turnFigure } from './rig3d-pose';
import { poseStarterBody } from './starters';
import { describePhotoPose } from './describe';

const aspect = 2 / 3;
const standing = () => liftBodies([poseStarterBody('stand')], aspect);
const withCamera = (rig: PoseRig3d, choice: FullCameraChoice): PoseRig3d => ({
  ...rig,
  camera: cameraForChoice(rig, choice, aspect),
});
/** The same camera with its pick forgotten (as after a hand orbit). */
const unpicked = (rig: PoseRig3d): PoseRig3d => {
  const copy = cloneRig(rig);
  delete copy.camera.choice;
  return copy;
};

const LOWER = [9, 10, 12, 13];

describe('3D camera picks', () => {
  it('frames each shot and leaves the joints below it out of the pose map', () => {
    const rig = standing();
    const nulls = (choice: FullCameraChoice) =>
      projectRig(withCamera(rig, choice), aspect)[0]!.flatMap((p, i) => (p ? [] : [i]));
    const full = nulls({ ...DEFAULT_CAMERA_CHOICE, shot: 'full' });
    assert.ok(LOWER.every(i => !full.includes(i)), `full: ${full}`);
    const knees = nulls({ ...DEFAULT_CAMERA_CHOICE, shot: 'knees' });
    assert.ok(knees.includes(10) && knees.includes(13), `knees: ${knees}`);
    assert.ok(!knees.includes(9) && !knees.includes(12), `knees: ${knees}`);
    const waist = nulls({ ...DEFAULT_CAMERA_CHOICE, shot: 'waist' });
    assert.ok(LOWER.every(i => waist.includes(i)), `waist: ${waist}`);
    assert.ok(!waist.includes(8) && !waist.includes(11), `waist keeps the hips: ${waist}`);
    const head = nulls({ ...DEFAULT_CAMERA_CHOICE, shot: 'head' });
    assert.ok([8, 9, 10, 11, 12, 13].every(i => head.includes(i)), `head: ${head}`);
    assert.ok(!head.includes(0) && !head.includes(1), `head keeps the face and neck: ${head}`);
  });

  it('keeps the shot size when the lens changes (and sets the lens field of view)', () => {
    const rig = standing();
    for (const lens of CAMERA_LENSES) {
      const camera = cameraForChoice(rig, { ...DEFAULT_CAMERA_CHOICE, shot: 'waist', lens }, aspect);
      assert.equal(camera.fov, CAMERA_LENS_FOV[lens]);
      const body = projectRig({ ...rig, camera }, aspect)[0]!;
      assert.ok(body[1] && body[8], `${lens}: neck and hip in frame`);
      assert.equal(body[10], null, `${lens}: ankle out of frame`);
    }
    // "Normal" is the editor's own lens: the default pick looks as the editor always did.
    assert.equal(CAMERA_LENS_FOV.normal, 30);
  });

  it('reads a camera back as the pick it was set from, relative to where she faces', () => {
    const rig = standing();
    // Turned a quarter: "front" still faces her.
    turnFigure(rig.figures[0]!, Math.PI / 2);
    for (const height of CAMERA_HEIGHTS)
      for (const direction of CAMERA_DIRECTIONS)
        for (const shot of CAMERA_SHOTS)
          for (const lens of CAMERA_LENSES) {
            const choice: FullCameraChoice = { height, direction, shot, lens };
            const read = readCameraChoice(unpicked(withCamera(rig, choice)), aspect);
            assert.equal(read.height, height, JSON.stringify(choice));
            assert.equal(read.lens, lens, JSON.stringify(choice));
            if (height !== 'overhead') assert.equal(read.direction, direction, JSON.stringify(choice));
            if (height === 'eye') assert.equal(read.shot, shot, JSON.stringify(choice));
          }
    const front = withCamera(rig, { ...DEFAULT_CAMERA_CHOICE });
    const toCamera = new Vector3(...front.camera.position).sub(new Vector3(...front.camera.target));
    assert.ok(toCamera.normalize().dot(figureFacing(rig.figures[0]!)) > 0.99);
  });

  it('keeps the pick on the camera through save and load, and prefers it to the numbers', () => {
    const picked = withCamera(standing(), { height: 'high', direction: 'side', shot: 'knees', lens: 'long' });
    const loaded = normalizePoseRig3d(JSON.parse(JSON.stringify(picked)), 1)!;
    assert.deepEqual(loaded.camera.choice, picked.camera.choice);
    assert.deepEqual(rigCameraChoice(loaded, aspect), picked.camera.choice);
    // A junk pick is dropped, the camera kept.
    const junk = normalizePoseRig3d({ ...picked, camera: { ...picked.camera, choice: { shot: 'x' } } }, 1)!;
    assert.equal(junk.camera.choice, undefined);
    assert.ok(junk.camera.fov > 0);
  });

  it('never claims legs the picture leaves out', () => {
    const rig = withCamera(standing(), { ...DEFAULT_CAMERA_CHOICE, shot: 'head' });
    const words = describePhotoPose({ aspect, people: projectRig(rig, aspect) });
    assert.ok(!/\b(?:leg|knee|foot|feet)\b/.test(words), words);
    const waist = withCamera(standing(), { ...DEFAULT_CAMERA_CHOICE, shot: 'waist' });
    const waistWords = describePhotoPose({ aspect, people: projectRig(waist, aspect) });
    assert.ok(!/\b(?:leg|knee|foot|feet)\b/.test(waistWords), waistWords);
  });
});
