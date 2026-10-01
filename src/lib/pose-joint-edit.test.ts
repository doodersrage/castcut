import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  bendBody,
  bodyFacing,
  liftBodyDepth,
  moveJointRigid,
  moveWholeBody,
  rotateBody,
} from './pose-joint-edit';
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
    const moved = moveJointRigid([stand], 0, 3, { x: stand[2]!.x - 0.05, y: stand[2]!.y }, ASPECT)[0]!;
    assert.deepEqual(moved[2], stand[2]);
    close(moved[3]!.y, stand[2]!.y);
    assert.notDeepEqual(moved[4], stand[4]);
    assert.deepEqual(moved[6], stand[6]);
  });

  it('pulling a hand bends the elbow: the shoulder stays, the hand lands on the pointer', () => {
    const shoulder = stand[2]!;
    const to = { x: shoulder.x - 0.12, y: shoulder.y + 0.02 };
    const moved = moveJointRigid([stand], 0, 4, to, ASPECT)[0]!;
    assert.deepEqual(moved[2], shoulder);
    close(moved[4]!.x, to.x);
    close(moved[4]!.y, to.y);
    assert.notDeepEqual(moved[3], stand[3]);
    // Out of reach: the arm straightens toward the pointer.
    const far = moveJointRigid([stand], 0, 4, { x: 0.02, y: 0.02 }, ASPECT)[0]!;
    close(length(far, 2, 4), length(stand, 2, 3) + length(stand, 3, 4), 1e-4);
  });

  it('pulling a hand or knee past full stretch drags the whole body after it', () => {
    const pulledHand = moveJointRigid([stand], 0, 4, { x: 0.1, y: 0.5 }, ASPECT)[0]!;
    assert.ok(pulledHand[2]!.x < stand[2]!.x - 0.05, 'shoulder follows');
    assert.ok(pulledHand[10]!.x < stand[10]!.x - 0.05, 'feet follow');
    for (const [a, b] of BONES) close(length(pulledHand, a, b), length(stand, a, b), 1e-4);
    const pulledKnee = moveJointRigid([stand], 0, 9, { x: 0.15, y: 0.75 }, ASPECT)[0]!;
    assert.ok(pulledKnee[1]!.x < stand[1]!.x - 0.03, 'neck follows');
    // Within reach nothing else moves.
    const near = moveJointRigid([stand], 0, 4, { x: stand[4]!.x - 0.03, y: stand[4]!.y - 0.05 }, ASPECT)[0]!;
    assert.deepEqual(near[10], stand[10]);
  });

  it('the whole figure slides, stopping at the frame edge without squashing', () => {
    const moved = moveWholeBody([stand], 0, 5, 0)[0]!;
    assert.ok(Math.max(...moved.map(p => p!.x)) <= 0.99 + 1e-9);
    for (const [a, b] of BONES) close(length(moved, a, b), length(stand, a, b));
    assert.ok(moved[1]!.x > stand[1]!.x);
  });

  it('dragging the neck bends at the waist: the legs stay, the upper body swings', () => {
    const hipY = (stand[8]!.y + stand[11]!.y) / 2;
    const bent = moveJointRigid([stand], 0, 1, { x: 0.95, y: hipY }, ASPECT)[0]!;
    for (const leg of [8, 9, 10, 11, 12, 13]) assert.deepEqual(bent[leg], stand[leg]);
    close(bent[1]!.y, hipY, 1e-6);
    assert.ok(bent[0]!.x > bent[1]!.x, 'head leads past the neck');
    for (const [a, b] of [[1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [1, 0]] as const)
      close(length(bent, a, b), length(stand, a, b));
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

  it('bends forward at the waist in 3D: toward the camera when facing it, a bow when side-on', () => {
    const front = bendBody(stand, depth, Math.PI / 3, ASPECT);
    assert.ok(front.depth[1]! > 0.05, 'neck comes toward the camera');
    assert.ok(length(front.body, 1, 8) < length(stand, 1, 8) * 0.75, 'torso foreshortens');
    for (const leg of [8, 9, 10, 11, 12, 13]) assert.deepEqual(front.body[leg], stand[leg]);
    const side = rotateBody(stand, depth, { turn: Math.PI / 2 }, ASPECT);
    const bow = bendBody(side.body, side.depth, Math.PI / 3, ASPECT);
    // Facing your right: the head goes right and down.
    assert.ok(bow.body[0]!.x > side.body[0]!.x + 0.05);
    assert.ok(bow.body[0]!.y > side.body[0]!.y);
  });

  it('says which way the figure faces after turning and tilting', () => {
    assert.equal(bodyFacing(stand, depth, ASPECT)!.label, 'Facing you');
    const right = rotateBody(stand, depth, { turn: Math.PI / 6 }, ASPECT);
    assert.equal(bodyFacing(right.body, right.depth, ASPECT)!.label, 'Facing you, turned 30° to your right');
    const side = rotateBody(stand, depth, { turn: -Math.PI / 2 }, ASPECT);
    assert.equal(bodyFacing(side.body, side.depth, ASPECT)!.label, 'Side-on, facing your left');
    const away = rotateBody(stand, depth, { turn: Math.PI }, ASPECT);
    assert.equal(bodyFacing(away.body, away.depth, ASPECT)!.label, 'Back to you');
    const tilted = rotateBody(stand, depth, { tilt: Math.PI / 6 }, ASPECT);
    assert.match(bodyFacing(tilted.body, tilted.depth, ASPECT)!.label, /^Facing you, leaning forward 30°$/);
  });

  it('spinning keeps every bone length; tilting shortens the figure', () => {
    const spun = rotateBody(stand, depth, { spin: Math.PI / 12 }, ASPECT).body;
    for (const [a, b] of BONES) close(length(spun, a, b), length(stand, a, b), 1e-6);
    const tilted = rotateBody(stand, depth, { tilt: Math.PI / 4 }, ASPECT).body;
    assert.ok(length(tilted, 1, 8) < length(stand, 1, 8) * 0.9);
  });
});
