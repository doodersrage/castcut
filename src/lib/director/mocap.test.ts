import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Quaternion } from 'three';
import { figureWorld } from '@/lib/pose/rig3d-pose';
import { floorGap, placementOf } from './figure-ops';
import { MOCAP_CLIPS, mocapFrames, mocapSeconds, retargetMocap } from './mocap';
import { DIRECTOR_MOVE_IDS, DIRECTOR_MOVES, moveFrames } from './moves';
import { footContact } from './plant';
import { DIRECTOR_FPS } from './types';

const CAPTURED = DIRECTOR_MOVE_IDS.filter(id => id !== 'nod');

describe('director: motion-captured moves', () => {
  it('has a capture for every move but the nod, each with its credit and rest pose', () => {
    for (const id of CAPTURED) {
      const clip = MOCAP_CLIPS[id];
      assert.ok(clip, id);
      assert.match(clip.trial, /^\d+_\d+$/, `${id}: a CMU trial`);
      assert.ok(clip.frames.length > clip.fps, `${id}: over a second`);
      assert.ok(clip.rest.hipsHeight > 0.5, id);
      for (const frame of clip.frames) {
        for (const [bone, q] of Object.entries(frame.rot)) {
          assert.ok(Math.abs(Math.hypot(...q) - 1) < 2e-3, `${id} ${bone}: a unit turn`);
        }
      }
    }
    assert.equal(MOCAP_CLIPS.nod, undefined);
    assert.equal(mocapFrames('nod', 'female', 1.6, DIRECTOR_FPS), null);
  });

  it('takes its natural length from the capture', () => {
    for (const id of CAPTURED) {
      assert.equal(DIRECTOR_MOVES[id].seconds, Math.round(mocapSeconds(id)! * 10) / 10, id);
    }
    assert.equal(DIRECTOR_MOVES.nod.seconds, 1.6);
  });

  it('poses both bodies: finite, on the floor, starting at the origin facing +z', () => {
    for (const kind of ['female', 'male'] as const) {
      for (const id of CAPTURED) {
        const frames = retargetMocap(MOCAP_CLIPS[id]!, kind);
        const start = placementOf(frames[0]!);
        assert.ok(Math.hypot(start.x, start.z) < 0.02, `${kind} ${id} starts at the origin`);
        assert.ok(Math.abs(start.yaw) < 0.05, `${kind} ${id} faces +z`);
        for (const frame of frames) {
          assert.ok(frame.position.every(Number.isFinite), `${kind} ${id}: a finite place`);
          for (const q of Object.values(frame.bones)) assert.ok(q.every(Number.isFinite));
          assert.ok(Math.abs(floorGap(frame)) < 1e-6, `${kind} ${id}: on the floor`);
        }
      }
    }
  });

  it('keeps both feet planted, flat and in the hand-keyed stance through a move in place', () => {
    for (const id of CAPTURED.filter(id => MOCAP_CLIPS[id]!.planted && id !== 'stand')) {
      const frames = moveFrames(id, 'female', DIRECTOR_MOVES[id].seconds, DIRECTOR_FPS);
      for (const side of ['L', 'R'] as const) {
        const start = footContact(frames[0]!, side);
        assert.ok(start.down, `${id} ${side}: down at the start`);
        for (const frame of frames) {
          const foot = footContact(frame, side);
          const moved = Math.hypot(foot.ball.x - start.ball.x, foot.ball.z - start.ball.z);
          assert.ok(moved < 0.01, `${id} ${side}: moved ${moved.toFixed(3)} m`);
        }
      }
      const world = figureWorld(frames[0]!);
      const width = world.pos.foot_L!.x - world.pos.foot_R!.x;
      assert.ok(Math.abs(width - 0.2) < 0.02, `${id}: stance ${width.toFixed(3)} m`);
    }
  });

  it('turns all the way round on the turn, and the walk covers ground', () => {
    const turn = moveFrames('turn', 'female', DIRECTOR_MOVES.turn.seconds, DIRECTOR_FPS);
    assert.ok(Math.abs(Math.abs(placementOf(turn.at(-1)!).yaw) - Math.PI) < 0.1);
    const walk = moveFrames('walk', 'female', DIRECTOR_MOVES.walk.seconds, DIRECTOR_FPS);
    const end = placementOf(walk.at(-1)!);
    assert.ok(end.z > 0.8 && end.z < 1.4, `walked ${end.z.toFixed(2)} m`);
  });

  it('stretches to the beat: twice as long, twice the frames, the same start and end', () => {
    const natural = mocapFrames('wave', 'female', 2, DIRECTOR_FPS)!;
    const slow = mocapFrames('wave', 'female', 4, DIRECTOR_FPS)!;
    assert.equal(natural.length, 33);
    assert.equal(slow.length, 65);
    const angle = (a: number[], b: number[]) =>
      new Quaternion(...(a as [number, number, number, number])).angleTo(
        new Quaternion(...(b as [number, number, number, number]))
      );
    assert.ok(angle(natural[0]!.bones.upperarm_R!, slow[0]!.bones.upperarm_R!) < 1e-6);
    assert.ok(angle(natural.at(-1)!.bones.upperarm_R!, slow.at(-1)!.bones.upperarm_R!) < 1e-6);
  });
});
