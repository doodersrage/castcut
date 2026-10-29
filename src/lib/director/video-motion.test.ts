import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Quaternion, Vector3 } from 'three';
import type { NormalizedBody } from '@/lib/pose/library';
import type { PoseRig3dFigure } from '@/lib/pose/rig3d';
import {
  DEFAULT_CAMERA,
  figureWorld,
  makeCamera,
  openPoseWorld,
  projectPoint,
  restFigure,
} from '@/lib/pose/rig3d-pose';
import { videoBeat } from './edit';
import { floorGap, placementOf } from './figure-ops';
import { moveFrames } from './moves';
import { directionFrames, endOfBeats } from './timeline';
import { DEFAULT_DIRECTOR_CAMERA, DIRECTOR_FPS, normalizeDirection, type Direction } from './types';
import {
  followLead,
  liftVideoMotion,
  parseVideoPoseFrames,
  removeFlips,
  videoBeatFrames,
  type VideoPoseRead,
} from './video-motion';

/** A motion as a video shows it: each frame's joints through a fixed camera, 0–1 of a 3:4 frame. */
function filmed(frames: PoseRig3dFigure[]): VideoPoseRead {
  const aspect = 3 / 4;
  const cam = makeCamera(DEFAULT_CAMERA, aspect);
  cam.updateMatrixWorld();
  return {
    canvas: { width: 600, height: 800 },
    frames: frames.map(frame => [
      openPoseWorld(frame).map(point => projectPoint(cam, point)) as NormalizedBody,
    ]),
  };
}

const person = (x: number, y: number, tall: number): NormalizedBody => {
  const body: NormalizedBody = Array.from({ length: 18 }, () => null);
  body[0] = { x, y: y - tall * 0.45 };
  body[1] = { x, y: y - tall * 0.35 };
  body[8] = { x: x - 0.02, y };
  body[11] = { x: x + 0.02, y };
  body[10] = { x: x - 0.02, y: y + tall * 0.5 };
  body[13] = { x: x + 0.02, y: y + tall * 0.5 };
  return body;
};

describe('director: a move from your own video', () => {
  it('reads DWPose frames for a video (pixels or 0–1), every frame its people', () => {
    const frame = (x: number) => ({
      canvas_width: 600,
      canvas_height: 800,
      people: [{ pose_keypoints_2d: [x, 100, 1, x, 200, 1, ...Array(48).fill(0)] }],
    });
    const read = parseVideoPoseFrames(JSON.stringify([frame(300), { people: [] }, frame(330)]));
    assert.ok(read);
    assert.deepEqual(read.canvas, { width: 600, height: 800 });
    assert.equal(read.frames.length, 3);
    assert.equal(read.frames[1]!.length, 0);
    assert.ok(Math.abs(read.frames[2]![0]![0]!.x - 0.55) < 1e-9);
    assert.equal(parseVideoPoseFrames('not json'), null);
    assert.equal(parseVideoPoseFrames('[]'), null);
  });

  it('follows the lead: the tallest at first, then whoever stays where she was', () => {
    const lead = followLead([
      [person(0.2, 0.5, 0.2), person(0.6, 0.5, 0.5)],
      [person(0.62, 0.5, 0.5), person(0.3, 0.5, 0.6)],
      [person(0.95, 0.5, 0.5)],
    ]);
    assert.equal(lead[0]![1]!.x, 0.6);
    assert.equal(lead[1]![1]!.x, 0.62, 'not the taller passer-by');
    assert.equal(lead[2], null, 'no one near where she was');
  });

  it('puts back a limb that flips for a frame', () => {
    const frames = [0, 1, 2, 3, 4].map(() => restFigure('female'));
    const flipped = new Quaternion(...frames[2]!.bones.forearm_R!).multiply(
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI * 0.8)
    );
    frames[2]!.bones.forearm_R = [flipped.x, flipped.y, flipped.z, flipped.w];
    const fixed = removeFlips(frames);
    const angle = new Quaternion(...fixed[2]!.bones.forearm_R!).angleTo(
      new Quaternion(...frames[1]!.bones.forearm_R!)
    );
    assert.ok(angle < 0.01, `forearm back (${angle.toFixed(3)} rad off)`);
  });

  it('lifts a filmed wave back onto the 3D body: the arm up where it was, on the floor', () => {
    const wave = moveFrames('wave', 'female', 2.5, DIRECTOR_FPS);
    const lifted = liftVideoMotion(filmed(wave), 'female');
    assert.equal(lifted.length, wave.length);
    const start = placementOf(lifted[0]!);
    assert.ok(Math.hypot(start.x, start.z) < 0.02 && Math.abs(start.yaw) < 0.05);
    for (const frame of lifted) assert.ok(Math.abs(floorGap(frame)) < 1e-3);
    // The raised forearm (her right) points where the original's did, frame by frame.
    const forearm = (frame: PoseRig3dFigure) => {
      const w = figureWorld(frame);
      return w.pos.hand_R!.clone().sub(w.pos.forearm_R!).normalize();
    };
    const offs = wave.map((frame, i) => forearm(frame).angleTo(forearm(lifted[i]!)) * 57.3);
    offs.sort((a, b) => a - b);
    assert.ok(offs[Math.floor(offs.length / 2)]! < 25, `median forearm off ${offs[Math.floor(offs.length / 2)]!.toFixed(0)}°`);
    const handUp = (frame: PoseRig3dFigure) => figureWorld(frame).pos.hand_R!.y;
    const top = Math.max(...lifted.map(handUp));
    assert.ok(top > figureWorld(lifted[0]!).pos.head!.y, 'the hand goes above her head');
  });

  it('refuses a video with no one followed through most of it', () => {
    const empty: VideoPoseRead = { canvas: { width: 600, height: 800 }, frames: Array(20).fill([]) };
    assert.throws(() => liftVideoMotion(empty, 'female'), /No one could be followed/);
  });

  it('is a beat: kept with the direction, stretched, and placed where the last beat left her', () => {
    const wave = liftVideoMotion(filmed(moveFrames('wave', 'female', 2.5, DIRECTOR_FPS)), 'female');
    const beat = videoBeat(wave, 'my-wave.mp4');
    assert.equal(beat.name, 'From my-wave');
    assert.equal(beat.seconds, 2.5);
    const direction: Direction = {
      version: 1,
      body: 'female',
      camera: DEFAULT_DIRECTOR_CAMERA,
      beats: [
        { id: 'a', kind: 'pose', name: 'Stand', figure: restFigure('female'), seconds: 0, hold: 0.5 },
        { id: 'w', kind: 'move', move: 'walk', seconds: 2.9, hold: 0 },
        { ...beat, seconds: 99 },
      ],
    };
    const kept = normalizeDirection(JSON.parse(JSON.stringify(direction)));
    assert.ok(kept);
    const video = kept.beats[2]!;
    assert.equal(video.kind, 'video');
    assert.equal(video.seconds, 5, 'stretched at most twice its length');
    assert.equal(normalizeDirection({ ...direction, beats: [direction.beats[0], { ...beat, frames: [1, 2] }] })!.beats.length, 1);
    // Played after the walk: it starts where the walk stopped.
    const afterWalk = placementOf(endOfBeats(kept, 2));
    const frames = directionFrames(kept);
    assert.equal(frames.length, Math.round((0.5 + 2.9 + 5) * DIRECTOR_FPS) + 1);
    const videoStart = placementOf(frames[Math.round((0.5 + 2.9) * DIRECTOR_FPS) + 1]!);
    assert.ok(Math.hypot(videoStart.x - afterWalk.x, videoStart.z - afterWalk.z) < 0.1);
    assert.equal(videoBeatFrames(wave, 5, DIRECTOR_FPS).length, 81);
  });
});
