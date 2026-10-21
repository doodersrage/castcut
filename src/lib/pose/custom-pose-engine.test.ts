import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { customPoseOffPlate } from './custom-pose-engine';
import type { NormalizedBody } from './library';
import type { PhotoPose } from './types';

type Ref = { id: string; aspect: number; people: NormalizedBody[] };
const REFS: Ref[] = JSON.parse(
  readFileSync(new URL('../../../public/pose-references.json', import.meta.url), 'utf8')
).references;
const asPose = (id: string, over: Partial<PhotoPose> = {}): PhotoPose => {
  const ref = REFS.find(entry => entry.id === id);
  assert.ok(ref, id);
  return { aspect: ref.aspect, people: [ref.people[0]!], source: 'edited', ...over };
};

describe('customPoseOffPlate: the custom poses Edit 2511 redraws from its plate', () => {
  it('reads the pose bench references the way 2511 missed them', () => {
    for (const id of ['lie-3', 'lie_side-1', 'lie_front-2']) {
      assert.equal(customPoseOffPlate(asPose(id)), 'lying', id);
    }
    // The plank's torso is level, so it reads as lying or horizontal — either hands it off.
    assert.ok(customPoseOffPlate(asPose('sport_plank-1')), 'plank');
    for (const id of ['look_back-1', 'wave-3']) {
      assert.equal(customPoseOffPlate(asPose(id)), 'back-view', id);
    }
    for (const id of ['hands_hips-1', 'arms_up-1', 'sit-4', 'kneel-2', 'sport_lunge-2', 'crouch-2']) {
      assert.equal(customPoseOffPlate(asPose(id)), null, id);
    }
  });

  it("takes the vision read and a named pose's words when the joints can't say", () => {
    const standing = asPose('hands_hips-1');
    assert.equal(customPoseOffPlate({ ...standing, posture: { posture: 'reclining' } }), 'lying');
    assert.equal(
      customPoseOffPlate({ ...standing, posture: { posture: 'all-fours' } }),
      'horizontal'
    );
    assert.equal(
      customPoseOffPlate({ ...standing, words: 'holding a plank on the mat' }),
      'horizontal'
    );
    assert.equal(customPoseOffPlate({ ...standing, words: 'her back to the camera' }), 'back-view');
    assert.equal(customPoseOffPlate(null), null);
    assert.equal(customPoseOffPlate({ aspect: 1, people: [] }), null);
  });
});
