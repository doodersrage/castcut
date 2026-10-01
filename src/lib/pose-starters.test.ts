import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addPerson,
  describePoseBody,
  poseFirstLine,
  mirrorBodies,
  poseStarterBody,
  POSE_STARTERS,
  removePerson,
} from './pose-starters';

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

  it('describes each starter figure in words', () => {
    assert.equal(describePoseBody(poseStarterBody('stand')), 'standing');
    assert.equal(describePoseBody(poseStarterBody('sit')), 'seated');
    assert.equal(describePoseBody(poseStarterBody('kneel')), 'kneeling');
    assert.equal(describePoseBody(poseStarterBody('lie')), 'lying down');
    assert.equal(describePoseBody(poseStarterBody('walk')), 'walking mid-stride');
  });

  it('reads each leg on its own: a standing high kick is not "kneeling"', () => {
    // The pose a player drew (512×768 guide): right leg planted, left knee at hip height with
    // the foot up by the shoulder. Averaging the legs called it kneeling, and the model knelt.
    const px: Array<[number, number]> = [
      [166, 93], [166, 156], [121, 163], [108, 263], [103, 355], [210, 163], [259, 247], [337, 230],
      [143, 371], [143, 517], [143, 662], [221, 362], [343, 325], [414, 204],
      [157, 87], [174, 87], [148, 94], [183, 94],
    ];
    const kick = px.map(([x, y]) => ({ x: x / 512, y: y / 768 }));
    const words = describePoseBody(kick, { aspect: 512 / 768 });
    assert.match(words, /^standing on her right leg, her left leg kicked up high out to the side/);
    assert.match(words, /knee bent, foot at shoulder height/);
    assert.doesNotMatch(words, /kneeling/);
    const line = poseFirstLine(kick, 'he', 512 / 768);
    assert.match(line, /^POSE FIRST: he is standing on his right leg, his left leg kicked up high/);
    assert.match(line, /never kneeling and never both feet down\.$/);
  });

  it('one knee down with the other foot planted is kneeling on one knee', () => {
    const kneel = poseStarterBody('kneel');
    // Left foot planted in front: the knee up near hip height, the ankle on the floor under it.
    const floor = Math.max(kneel[9]!.y, kneel[10]!.y);
    const genuflect = kneel.map((p, i) =>
      i === 12
        ? { x: kneel[11]!.x + 0.1, y: kneel[11]!.y + 0.06 }
        : i === 13
          ? { x: kneel[11]!.x + 0.1, y: floor }
          : p
    );
    assert.equal(
      describePoseBody(genuflect),
      'kneeling on her right knee, the other foot flat on the floor'
    );
  });
});
