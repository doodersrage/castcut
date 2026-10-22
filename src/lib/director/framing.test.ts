import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeCamera, openPoseWorld, projectPoint } from '@/lib/pose/rig3d-pose';
import type { NormalizedBody } from '@/lib/pose/library';
import type { PoseRig3dCamera, PoseRig3dFigure } from '@/lib/pose/rig3d';
import { moveBeat } from './edit';
import { cameraAt, cameraMoveEnd, frameDirection, readStillFraming } from './framing';
import { poseBeat, standingFigure } from './poses';
import { directionFrames } from './timeline';
import { DEFAULT_DIRECTOR_CAMERA, type DirectorCamera, type Direction } from './types';

const ASPECT = 464 / 832;
const stand = standingFigure('female');

function frames(moves: Parameters<typeof moveBeat>[0][]): PoseRig3dFigure[] {
  const d: Direction = {
    version: 1,
    body: 'female',
    beats: [poseBeat('Stand', stand, { first: true }), ...moves.map(m => moveBeat(m))],
    camera: DEFAULT_DIRECTOR_CAMERA,
  };
  return directionFrames(d);
}

/** The picture-space box of every frame's joints (and head top), camera move included. */
function box(list: PoseRig3dFigure[], start: PoseRig3dCamera, end: PoseRig3dCamera) {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  list.forEach((figure, i) => {
    const cam = makeCamera(cameraAt(start, end, i / (list.length - 1)), ASPECT);
    for (const point of openPoseWorld(figure)) {
      const p = projectPoint(cam, point);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  });
  return { minX, maxX, minY, maxY };
}

const camera = (patch: Partial<DirectorCamera> = {}): DirectorCamera => ({
  ...DEFAULT_DIRECTOR_CAMERA,
  ...patch,
});

/** A still where she stands filling the frame: neck high, hips mid, feet at the bottom. */
const STILL_BODY: NormalizedBody = Array.from({ length: 18 }, () => null);
STILL_BODY[1] = { x: 0.5, y: 0.24 };
STILL_BODY[8] = { x: 0.47, y: 0.5 };
STILL_BODY[11] = { x: 0.53, y: 0.5 };
STILL_BODY[10] = { x: 0.47, y: 0.87 };
STILL_BODY[13] = { x: 0.53, y: 0.87 };

describe('director: framing', () => {
  it('reads the still: neck, hips and how much of her is in it', () => {
    const framing = readStillFraming(STILL_BODY)!;
    assert.equal(framing.neckY, 0.24);
    assert.ok(Math.abs(framing.hipY! - 0.5) < 1e-9);
    assert.equal(framing.shot, 'full');
    const waist = STILL_BODY.map((p, i) => (i === 10 || i === 13 ? null : p));
    assert.equal(readStillFraming(waist)!.shot, 'waist');
    assert.equal(readStillFraming(Array(18).fill(null)), null);
  });

  it('frames her like the still: neck and hips where the still has them', () => {
    const list = frames(['nod']);
    const still = readStillFraming(STILL_BODY);
    const fit = frameDirection({ frames: list, camera: camera(), aspect: ASPECT, still });
    const cam = makeCamera(fit.start, ASPECT);
    const points = openPoseWorld(list[0]!);
    const neck = projectPoint(cam, points[1]!);
    const hip = projectPoint(cam, points[8]!.clone().lerp(points[11]!, 0.5));
    assert.ok(Math.abs(neck.y - 0.24) < 0.01, `neck at ${neck.y}`);
    assert.ok(Math.abs(hip.y - 0.5) < 0.01, `hips at ${hip.y}`);
    assert.ok(fit.pulledBack < 1.05, 'a nod fits as it is');
  });

  it('pulls back so a walk toward the camera with a push-in stays in frame', () => {
    const list = frames(['walk', 'wave']);
    const still = readStillFraming(STILL_BODY);
    for (const move of ['none', 'push-in', 'pan-left'] as const) {
      const fit = frameDirection({ frames: list, camera: camera({ move }), aspect: ASPECT, still });
      const b = box(list, fit.start, fit.end);
      assert.ok(b.minX >= 0 && b.maxX <= 1 && b.minY >= 0 && b.maxY <= 1, `${move}: ${JSON.stringify(b)}`);
      assert.ok(fit.pulledBack > 1.05, `${move}: stepped back`);
    }
  });

  it('frames the picked shot without a still, from the picked side', () => {
    const list = frames(['wave']);
    const fit = frameDirection({
      frames: list,
      camera: camera({ shot: 'full', direction: 'side', side: -1 }),
      aspect: ASPECT,
    });
    // Her right is −x when she faces +z: the camera stands there.
    assert.ok(fit.start.position[0] < -1, `camera at ${fit.start.position}`);
    const b = box(list, fit.start, fit.end);
    assert.ok(b.minY >= 0 && b.maxY <= 1);
  });

  it('a push-in ends closer, a pull-out further, a pan to the side', () => {
    const start: PoseRig3dCamera = { position: [0, 1, 4], target: [0, 1, 0], fov: 30 };
    assert.ok(Math.abs(cameraMoveEnd(start, 'push-in', ASPECT).position[2] - 3.2) < 1e-9);
    assert.ok(Math.abs(cameraMoveEnd(start, 'pull-out', ASPECT).position[2] - 5) < 1e-9);
    const pan = cameraMoveEnd(start, 'pan-right', ASPECT);
    assert.ok(pan.position[0] > 0.1 && Math.abs(pan.target[0] - pan.position[0]) < 1e-9);
    assert.deepEqual(cameraAt(start, pan, 0).position, start.position);
    assert.deepEqual(cameraAt(start, pan, 1).position, pan.position);
  });
});
