import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CAMERA, liftBodies } from './rig3d-pose';
import { faceCamera, readCameraChoice } from './rig3d-camera';
import { poseStarterBody } from './starters';

describe('3D starters', () => {
  it('"Stand" opens facing the camera (the lift alone read it as three-quarter)', () => {
    const rig = liftBodies([poseStarterBody('stand')], 2 / 3, ['female'], DEFAULT_CAMERA);
    for (const figure of rig.figures) faceCamera(figure, rig.camera);
    assert.equal(readCameraChoice(rig, 2 / 3).direction, 'front');
  });
});
