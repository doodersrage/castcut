import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blockingPlan } from './blocking';

describe('blocking plan', () => {
  it('front-on: the camera below the people, pointing up at them; wider is further', () => {
    const near = blockingPlan({ camera: { direction: 'front', shot: 'head' } });
    const far = blockingPlan({ camera: { direction: 'front', shot: 'full' } });
    assert.equal(near.camera.x, 50);
    assert.ok(near.camera.y > 50 && far.camera.y > near.camera.y);
    assert.equal(near.camera.angleDeg, -90);
  });

  it('two people, the lead on her side; side-on puts the camera beside them', () => {
    const plan = blockingPlan({ camera: { direction: 'side' }, leadSide: 'right', people: 2 });
    assert.deepEqual(plan.people.map(p => [p.x, p.lead]), [[43, false], [57, true]]);
    assert.ok(plan.camera.x > 70);
    assert.equal(plan.camera.y, 50);
  });
});
