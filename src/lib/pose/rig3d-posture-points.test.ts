import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyPostureAngles,
  pickedPostures,
  posturesForPose,
  posturesForReference,
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

  it('a reference whose photo shows another posture than its filing goes by the photo', () => {
    assert.deepEqual(posturesForReference({ id: 'sport_deadlift-5', pose: 'sport_deadlift' }), [
      'stand',
    ]);
    assert.ok(posturesForReference({ id: 'kneel-5', pose: 'kneel' })!.includes('seated'));
    assert.deepEqual(posturesForReference({ id: 'kneel-1', pose: 'kneel' }), ['kneel']);
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

describe('a chair seat or a squat', () => {
  // Level thighs, shins down, knees at a right angle.
  const legs = { thigh: [86, 87] as [number, number], shin: [11, 31] as [number, number] };
  it('upright or leaning a little over the thighs is a seat', () => {
    for (const lean of [0, 30, 50]) {
      assert.equal(
        classifyPostureAngles(
          angles({ ...legs, torso: lean, backLean: -lean, knee: [75, 96], hipHeight: 0.55 })
        ),
        'seated'
      );
    }
  });
  it('the chest down over the thighs (a sumo deadlift setup) is a squat', () => {
    assert.equal(
      classifyPostureAngles(
        angles({ ...legs, torso: 57, backLean: -57, knee: [75, 96], hipHeight: 0.55 })
      ),
      'crouch'
    );
  });
});
