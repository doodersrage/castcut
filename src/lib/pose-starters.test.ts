import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addPerson, mirrorBodies, poseStarterBody, POSE_STARTERS, removePerson } from './pose-starters';

describe('pose starters', () => {
  it('every starter is a full figure inside the frame', () => {
    for (const { id } of POSE_STARTERS) {
      const body = poseStarterBody(id);
      assert.ok(body.filter(Boolean).length >= 14, id);
      for (const p of body) if (p) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, id);
    }
  });

  it('mirror flips sides and swaps left/right joints; twice is identity', () => {
    const body = poseStarterBody('walk');
    const [m] = mirrorBodies([body]);
    assert.ok(Math.abs(m![5]!.x - (1 - body[2]!.x)) < 1e-9);
    const [back] = mirrorBodies(mirrorBodies([body]));
    back!.forEach((p, i) => {
      assert.ok(Math.abs(p!.x - body[i]!.x) < 1e-9 && Math.abs(p!.y - body[i]!.y) < 1e-9);
    });
  });

  it('adds a second person and removes back to one', () => {
    const two = addPerson([poseStarterBody('stand')]);
    assert.equal(two.length, 2);
    assert.equal(addPerson(two).length, 2);
    assert.equal(removePerson(two).length, 1);
  });
});
