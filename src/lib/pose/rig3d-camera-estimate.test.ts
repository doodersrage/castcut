import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { NormalizedBody } from './library';
import { normalizePoseRig3d, type PoseRig3d, type PoseRig3dFigure } from './rig3d';
import { cameraForChoice, photoPoseCameraChoice } from './rig3d-camera';
import {
  DEFAULT_CAMERA,
  cameraElevation,
  cloneRig,
  figureWorld,
  liftBodies,
  liftBodyWithCamera,
  orbitCamera,
  projectFigure,
  projectRig,
  turnFigure,
} from './rig3d-pose';
import { posturesForReference, type Posture } from './rig3d-posture-points';
import { standingFigure, starterFigure } from '../director/poses';

const ROOT = join(__dirname, '..', '..', '..');
const ASPECT = 2 / 3;
const EYE = cameraElevation(DEFAULT_CAMERA);

/** A figure on the floor, turned a little, as a camera `elevation` degrees above her sees it. */
function seenFrom(figure: PoseRig3dFigure, elevation: number): NormalizedBody {
  turnFigure(figure, (40 * Math.PI) / 180);
  const hips = figureWorld(figure).pos.hips!;
  const level = {
    ...DEFAULT_CAMERA,
    target: hips.toArray() as [number, number, number],
    position: hips.clone().add({ x: 0, y: 0, z: 5.4 }).toArray() as [number, number, number],
  };
  return projectFigure(figure, orbitCamera(level, elevation), ASPECT);
}

const largestOff = (figure: PoseRig3dFigure) =>
  Math.max(0, ...Object.values(figure.scale ?? {}).map(v => Math.abs(v - 1)));

describe('the camera a picture was taken with, read during the lift', () => {
  it('a figure seen at eye level keeps the eye-level camera', () => {
    const cases: Array<[PoseRig3dFigure, Posture[]]> = [
      [standingFigure('female'), ['stand', 'bend']],
      [starterFigure('sit', 'female'), ['seated', 'crouch']],
      [starterFigure('kneel', 'female'), ['kneel']],
    ];
    for (const [figure, postures] of cases) {
      const { camera } = liftBodyWithCamera(seenFrom(figure, 0), ASPECT, { postures });
      assert.ok(Math.abs(cameraElevation(camera) - EYE) < 3, `${cameraElevation(camera)}°`);
      assert.equal(camera.fov, DEFAULT_CAMERA.fov);
    }
  });

  it('a seat or a kneel seen from 30° above is read from above', () => {
    const cases: Array<[PoseRig3dFigure, Posture[]]> = [
      [starterFigure('sit', 'female'), ['seated', 'crouch']],
      [starterFigure('kneel', 'female'), ['kneel']],
    ];
    for (const [figure, postures] of cases) {
      const { camera } = liftBodyWithCamera(seenFrom(figure, 30), ASPECT, { postures });
      const elevation = cameraElevation(camera);
      // (Held toward eye level: an ordinary photo must not drift.)
      assert.ok(elevation >= 10 && elevation <= 45, `${elevation}°`);
    }
  });

  it('a kneel photographed from above and close needs no long arm and short legs', () => {
    const refs = JSON.parse(readFileSync(join(ROOT, 'public/pose-references.json'), 'utf8')) as {
      references: Array<{ id: string; pose: string; aspect: number; people: NormalizedBody[] }>;
    };
    const ref = refs.references.find(r => r.id === 'kneel-4')!;
    const postures = [posturesForReference(ref)];
    // Through the eye-level camera: an upper arm 20% long, thighs 25% short.
    const level = liftBodies(ref.people, ref.aspect, ['female'], DEFAULT_CAMERA, { postures });
    assert.ok(largestOff(level.figures[0]!) > 0.15);
    // Through the camera the picture reads as taken with: from above, her own lengths.
    const read = liftBodies(ref.people, ref.aspect, ['female'], DEFAULT_CAMERA, {
      postures,
      estimateCamera: true,
    });
    assert.ok(cameraElevation(read.camera) >= 10, `${cameraElevation(read.camera)}°`);
    assert.ok(largestOff(read.figures[0]!) <= 0.1, JSON.stringify(read.figures[0]!.scale));
    // Marked as read from the picture, it stays marked through storage and a clone.
    assert.equal(read.camera.estimated, true);
    assert.equal(level.camera.estimated, undefined);
    assert.equal(normalizePoseRig3d(JSON.parse(JSON.stringify(read)))?.camera.estimated, true);
    assert.equal(cloneRig(read).camera.estimated, true);
  });

  it("a camera read from the picture does not change the still's camera words", () => {
    const refs = JSON.parse(readFileSync(join(ROOT, 'public/pose-references.json'), 'utf8')) as {
      references: Array<{ id: string; pose: string; aspect: number; people: NormalizedBody[] }>;
    };
    const ref = refs.references.find(r => r.id === 'kneel-4')!;
    const read = liftBodies(ref.people, ref.aspect, ['female'], DEFAULT_CAMERA, {
      postures: [posturesForReference(ref)],
      estimateCamera: true,
    });
    const saved = (rig: PoseRig3d) => ({
      aspect: ref.aspect,
      people: projectRig(rig, ref.aspect),
      source: 'edited' as const,
      rig3d: rig,
    });
    // Saved from the editor as the lift opened it: described at eye level, the normal lens.
    const words = photoPoseCameraChoice(saved(read));
    assert.equal(words?.height, 'eye');
    assert.equal(words?.lens, 'normal');
    // The same numbers without the mark (an older rig, or one orbited there by hand): from
    // the numbers, as before.
    const { estimated: _read, ...byHand } = read.camera;
    assert.equal(photoPoseCameraChoice(saved({ ...read, camera: byHand }))?.height, 'high');
    // Picked in the Camera panel: the pick, and the mark is gone.
    const picked = cameraForChoice(
      read,
      { height: 'high', direction: 'front', shot: 'full', lens: 'normal' },
      ref.aspect
    );
    assert.equal(picked.estimated, undefined);
    assert.equal(photoPoseCameraChoice(saved({ ...read, camera: picked }))?.height, 'high');
  });
});
