import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyPostureAngles,
  pickedPostures,
  posturesForPose,
  posturesForVision,
  type PostureAngles,
} from './rig3d-posture-points';

const angles = (over: Partial<PostureAngles>): PostureAngles => ({
  torso: 0,
  backLean: 0,
  thigh: [5, 5],
  shin: [5, 5],
  knee: [0, 0],
  hipHeight: 1,
  ...over,
});

describe('postures known from outside the picture', () => {
  it('a pose filed or picked by name', () => {
    assert.deepEqual(posturesForPose('kneel'), ['kneel']);
    assert.deepEqual(posturesForPose('lounge_elbows'), ['lying']);
    assert.deepEqual(posturesForPose('sport_deadlift'), ['bend', 'crouch']);
    assert.equal(posturesForPose('hug'), undefined);
    assert.equal(posturesForPose(undefined), undefined);
  });

  it("a slot's photo pose goes by the vision model's read, else the picked pose", () => {
    assert.deepEqual(pickedPostures({ poseLayout: 'sit' }), ['seated', 'crouch']);
    assert.deepEqual(
      pickedPostures({ poseLayout: 'sit', posePhoto: { posture: { posture: 'kneeling' } } }),
      ['kneel']
    );
    // A photo the vision model did not read: nothing known (the flat pose decides).
    assert.equal(pickedPostures({ poseLayout: 'sit', posePhoto: {} }), undefined);
    assert.deepEqual(posturesForVision('reclining'), ['lying', 'seated']);
    assert.equal(posturesForVision(undefined), undefined);
  });
});

describe('reading a reclined figure', () => {
  const lounge = { torso: 50, backLean: 32, thigh: [106, 129] as [number, number] };
  it('propped back on the elbows with the hips on the floor is lying', () => {
    assert.equal(
      classifyPostureAngles(
        angles({ ...lounge, shin: [84, 48], knee: [40, 90], hipHeight: -0.01 })
      ),
      'lying'
    );
  });
  it('a floor sit leaning back on the hands is still seated', () => {
    assert.equal(
      classifyPostureAngles(
        angles({
          torso: 46,
          backLean: 46,
          thigh: [96, 95],
          shin: [73, 58],
          knee: [135, 148],
          hipHeight: 0.21,
        })
      ),
      'seated'
    );
  });
  it('folded forward over the legs is not a recline', () => {
    assert.notEqual(
      classifyPostureAngles(
        angles({ torso: 50, backLean: -50, thigh: [90, 90], knee: [10, 10], hipHeight: 0.05 })
      ),
      'lying'
    );
  });
});
