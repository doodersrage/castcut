import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Quaternion } from 'three';
import { figureWorld, restFigure } from '@/lib/pose/rig3d-pose';
import { floorGap, mixFigures, placementOf, transformFigure } from './figure-ops';
import { moveBeat } from './edit';
import { ease, monotone } from './motion';
import { DIRECTOR_MOVE_IDS, DIRECTOR_MOVES, moveFrames } from './moves';
import { poseBeat, standingFigure, starterFigure } from './poses';
import {
  beatIndexAt,
  buildTimeline,
  directionFrames,
  directionFramesAt,
  endOfBeats,
  sampleTimeline,
} from './timeline';
import { DEFAULT_DIRECTOR_CAMERA, DIRECTOR_FPS, directionFrameCount, type Direction } from './types';

const stand = standingFigure('female');
const kneel = starterFigure('kneel', 'female');

function direction(beats: Direction['beats']): Direction {
  return { version: 1, body: 'female', beats, camera: DEFAULT_DIRECTOR_CAMERA };
}

const angle = (a: number[], b: number[]) =>
  new Quaternion(...(a as [number, number, number, number])).angleTo(
    new Quaternion(...(b as [number, number, number, number]))
  );

describe('director: interpolation', () => {
  it('eases in and out, and the monotone curve never overshoots its keys', () => {
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
    assert.equal(ease(0.5), 0.5);
    assert.ok(ease(0.1) < 0.1);
    const curve = monotone([
      [0, 0],
      [1, 10],
      [2, 10],
      [3, 0],
    ]);
    for (let t = 0; t <= 3; t += 0.05) {
      assert.ok(curve(t) >= -1e-9 && curve(t) <= 10 + 1e-9, `t=${t}`);
    }
    assert.equal(curve(1.5), 10);
  });

  it('blends two figures bone by bone: ends exact, the middle halfway round', () => {
    const a = stand;
    const b = kneel;
    assert.deepEqual(mixFigures(a, b, 0).bones, a.bones);
    assert.deepEqual(mixFigures(a, b, 1).bones, b.bones);
    const mid = mixFigures(a, b, 0.5);
    for (const bone of ['spine', 'thigh_L', 'shin_R', 'upperarm_L']) {
      const whole = angle(a.bones[bone]!, b.bones[bone]!);
      assert.ok(Math.abs(angle(a.bones[bone]!, mid.bones[bone]!) - whole / 2) < 1e-6, bone);
    }
  });

  it('keeps the feet on the floor mid-way (no sinking)', () => {
    for (const s of [0.25, 0.5, 0.75]) {
      const mid = mixFigures(stand, kneel, s);
      assert.ok(floorGap(mid) > -0.005, `s=${s}: ${floorGap(mid)}`);
    }
  });

  it('moves a figure rigidly from one placement to another', () => {
    const moved = transformFigure(stand, placementOf(stand), { x: 1, z: -2, yaw: Math.PI / 2 });
    const at = placementOf(moved);
    assert.ok(Math.abs(at.x - 1) < 1e-6 && Math.abs(at.z + 2) < 1e-6);
    assert.ok(Math.abs(at.yaw - Math.PI / 2) < 1e-4);
    const before = figureWorld(stand).pos.hand_L!.distanceTo(figureWorld(stand).pos.foot_R!);
    const after = figureWorld(moved).pos.hand_L!.distanceTo(figureWorld(moved).pos.foot_R!);
    assert.ok(Math.abs(before - after) < 1e-6);
  });
});

describe('director: timeline', () => {
  it('reaches each pose at the end of its move-in and holds it', () => {
    const second = { ...poseBeat('Kneel', kneel), seconds: 1, hold: 1 };
    const d = direction([{ ...poseBeat('Stand', stand, { first: true }), hold: 0.5 }, second]);
    const timeline = buildTimeline(d);
    assert.equal(timeline.length, 2.5);
    const at = (t: number) => sampleTimeline(timeline, t);
    assert.ok(angle(at(0).bones.thigh_L!, stand.bones.thigh_L!) < 0.03);
    assert.ok(angle(at(1.5).bones.thigh_L!, kneel.bones.thigh_L!) < 0.03);
    assert.ok(angle(at(2.4).bones.thigh_L!, kneel.bones.thigh_L!) < 0.03);
    // Half way through the move-in, the leg is between the two.
    const whole = angle(stand.bones.thigh_L!, kneel.bones.thigh_L!);
    const part = angle(at(1).bones.thigh_L!, stand.bones.thigh_L!);
    assert.ok(part > whole * 0.3 && part < whole * 0.7);
    assert.equal(beatIndexAt(d, 0.2), 0);
    assert.equal(beatIndexAt(d, 1.2), 1);
  });

  it('has one frame per 1/16 s, both ends included', () => {
    const d = direction([
      { ...poseBeat('Stand', stand, { first: true }), hold: 0.5 },
      moveBeat('wave'),
    ]);
    const frames = directionFrames(d);
    assert.equal(frames.length, directionFrameCount(d));
    assert.equal(frames.length, Math.round((0.5 + DIRECTOR_MOVES.wave.seconds) * DIRECTOR_FPS) + 1);
  });

  it('places a move where the previous beat left her, and the next beat after it', () => {
    const d = direction([
      poseBeat('Stand', stand, { first: true }),
      moveBeat('walk'),
      moveBeat('turn'),
      moveBeat('nod'),
    ]);
    const afterWalk = placementOf(endOfBeats(d, 2));
    assert.ok(afterWalk.z > 0.8, `walked ${afterWalk.z}`);
    const afterTurn = placementOf(endOfBeats(d, 3));
    assert.ok(Math.abs(afterTurn.z - afterWalk.z) < 0.15, 'turns where she stopped');
    assert.ok(Math.abs(Math.abs(afterTurn.yaw) - Math.PI) < 0.1, 'faces back');
    // The nod plays facing away too, without a jump.
    const frames = directionFrames(d);
    for (let i = 1; i < frames.length; i += 1) {
      const step = figureWorld(frames[i]!).pos.hips!.distanceTo(figureWorld(frames[i - 1]!).pos.hips!);
      assert.ok(step < 0.08, `frame ${i} jumps ${step.toFixed(3)} m`);
    }
  });

  it('carries a later pose along when an earlier beat moves her', () => {
    const pose = poseBeat('Kneel', kneel);
    const still = direction([poseBeat('Stand', stand, { first: true }), pose]);
    const walked = direction([poseBeat('Stand', stand, { first: true }), moveBeat('walk'), pose]);
    const a = placementOf(endOfBeats(still, 2));
    const b = placementOf(endOfBeats(walked, 3));
    assert.ok(b.z - a.z > 0.8);
  });

  it('every ready-made move starts standing at the origin facing +z and stays on the floor', () => {
    for (const id of DIRECTOR_MOVE_IDS) {
      const frames = moveFrames(id, 'female', DIRECTOR_MOVES[id].seconds, DIRECTOR_FPS);
      const start = placementOf(frames[0]!);
      if (id !== 'stand') {
        assert.ok(Math.hypot(start.x, start.z) < 0.02, `${id} starts at the origin`);
        assert.ok(Math.abs(start.yaw) < 0.05, `${id} starts facing +z`);
      }
      for (const frame of frames) assert.ok(Math.abs(floorGap(frame)) < 0.07, id);
    }
  });
});

describe('director: filming rate and her proportions', () => {
  it('films a direction at another rate (a continued clip at 24 fps), the same length', () => {
    const d = direction([
      { id: 's', kind: 'pose', name: 'Stand', figure: restFigure('female'), seconds: 0, hold: 0.5 },
      { id: 'w', kind: 'move', move: 'wave', seconds: 2.5, hold: 0 },
    ]);
    assert.equal(directionFramesAt(d, 24).length, Math.round(3 * 24) + 1);
    assert.equal(directionFrames(d).length, Math.round(3 * DIRECTOR_FPS) + 1);
  });

  it('keeps her own proportions (read from the still) through a ready-made move', () => {
    const figure = { ...restFigure('female'), scale: { upperarm: 0.9, forearm: 0.9 } };
    const d = direction([
      { id: 's', kind: 'pose', name: 'Her pose in the picture', figure, seconds: 0, hold: 0.3 },
      { id: 'w', kind: 'move', move: 'wave', seconds: 2.5, hold: 0 },
    ]);
    const frames = directionFrames(d);
    for (const frame of frames.slice(-10)) assert.deepEqual(frame.scale, figure.scale);
  });
});
