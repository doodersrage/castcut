import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { liftBodyDepth, moveJointRigid, rotateBody } from './pose-joint-edit';
import type { NormalizedBody } from './pose-library';
import { poseStarterBody } from './pose-starters';

const ASPECT = 2 / 3;
const length = (body: NormalizedBody, a: number, b: number) =>
  Math.hypot((body[a]!.x - body[b]!.x) * ASPECT, body[a]!.y - body[b]!.y);
const BONES: Array<[number, number]> = [
  [1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0],
];
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

describe('pose joint editor: keep proportions', () => {
  const stand = poseStarterBody('stand');

  it('dragging a wrist, elbow, knee or shoulder never changes a bone length', () => {
    for (const joint of [4, 3, 9, 2, 0, 13]) {
      const moved = moveJointRigid([stand], 0, joint, { x: 0.8, y: 0.3 }, ASPECT)[0]!;
      for (const [a, b] of BONES) close(length(moved, a, b), length(stand, a, b));
    }
  });

  it('an elbow swings around the shoulder and the wrist comes with it', () => {
    const moved = moveJointRigid([stand], 0, 3, { x: 0.05, y: stand[2]!.y }, ASPECT)[0]!;
    assert.deepEqual(moved[2], stand[2]);
    close(moved[3]!.y, stand[2]!.y);
    assert.notDeepEqual(moved[4], stand[4]);
    assert.deepEqual(moved[6], stand[6]);
  });

  it('the neck moves the whole figure, stopping at the frame edge without squashing it', () => {
    const moved = moveJointRigid([stand], 0, 1, { x: 5, y: stand[1]!.y }, ASPECT)[0]!;
    assert.ok(Math.max(...moved.map(p => p!.x)) <= 0.99 + 1e-9);
    for (const [a, b] of BONES) close(length(moved, a, b), length(stand, a, b));
    assert.ok(moved[1]!.x > stand[1]!.x);
  });
});

describe('pose joint editor: 3D rotation', () => {
  const stand = poseStarterBody('stand');
  const depth = liftBodyDepth(stand, stand, ASPECT);

  it('a standing figure is flat; a shortened forearm points at the camera', () => {
    assert.ok(depth.every(z => z === 0));
    const reaching = stand.map((p, i) => (i === 4 ? { ...stand[3]! } : p));
    assert.ok(liftBodyDepth(reaching, stand, ASPECT)[4]! > 0.05);
  });

  it('turning narrows the shoulders and keeps heights; turning back restores the figure', () => {
    const turned = rotateBody(stand, depth, { turn: Math.PI / 3 }, ASPECT);
    close(Math.abs(turned.body[2]!.x - turned.body[5]!.x), Math.abs(stand[2]!.x - stand[5]!.x) / 2, 1e-6);
    close(turned.body[0]!.y, stand[0]!.y);
    const back = rotateBody(turned.body, turned.depth, { turn: -Math.PI / 3 }, ASPECT);
    back.body.forEach((p, i) => {
      close(p!.x, stand[i]!.x, 1e-6);
      close(p!.y, stand[i]!.y, 1e-6);
    });
  });

  it('spinning keeps every bone length; tilting shortens the figure', () => {
    const spun = rotateBody(stand, depth, { spin: Math.PI / 12 }, ASPECT).body;
    for (const [a, b] of BONES) close(length(spun, a, b), length(stand, a, b), 1e-6);
    const tilted = rotateBody(stand, depth, { tilt: Math.PI / 4 }, ASPECT).body;
    assert.ok(length(tilted, 1, 8) < length(stand, 1, 8) * 0.9);
  });
});
