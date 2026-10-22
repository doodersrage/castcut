/**
 * Director: start poses and pose beats — a starter (Stand, Sit, Kneel…) or her pose as read from
 * the still, lifted into the 3D body, turned to face the camera (starters) and set on the floor
 * in her own frame; and a pose from the 3D editor turned into a beat.
 */

import type { NormalizedBody } from '@/lib/pose/library';
import type { PoseRig3d, PoseRig3dCamera, PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { RIG3D_VERSION } from '@/lib/pose/rig3d';
import { Quaternion, Vector3 } from 'three';
import { DEFAULT_CAMERA, liftBody, projectRig, setBoneWorldRotation } from '@/lib/pose/rig3d-pose';
import { faceCamera } from '@/lib/pose/rig3d-camera';
import { poseStarterBody, type PoseStarterId } from '@/lib/pose/starters';
import type { PhotoPose } from '@/lib/pose/types';
import { groundFigure, placementOf, toLocal, fromLocal, type Placement } from './figure-ops';
import { buildFigure, BASE, footAt, restOf, still, type Channels } from './motion';
import { HOLD_SECONDS, newBeatId, POSE_MOVE_SECONDS, type DirectorPoseBeat } from './types';

/** A figure in her own frame: hips over the origin, facing +z, on the floor. */
export function settle(figure: PoseRig3dFigure): PoseRig3dFigure {
  return groundFigure(toLocal(figure, placementOf(figure)));
}

/** Standing relaxed, built like the moves start (so a move from it blends in cleanly). */
export function standingFigure(kind: Rig3dBodyKind): PoseRig3dFigure {
  const ch: Channels = { ...BASE };
  const plant = (lr: number) => ({ x: lr * 0.1, z: 0, yaw: lr * 5 });
  return buildFigure(kind, {
    ch,
    feet: { L: footAt(kind, still(plant(1)), 0), R: footAt(kind, still(plant(-1)), 0) },
  });
}

/** A starter lifted into the body, facing the camera, settled. */
export function starterFigure(id: PoseStarterId, kind: Rig3dBodyKind): PoseRig3dFigure {
  if (id === 'stand') return standingFigure(kind);
  const figure = liftBody(poseStarterBody(id), 2 / 3, { body: kind });
  faceCamera(figure, DEFAULT_CAMERA);
  return settle(figure);
}

/**
 * The neck and head upright and facing where her hips face, whatever the chest does. The lift
 * reads the head from a few face points and often tips it back; resetting the neck and head to
 * rest under a chest that leans back still tipped it (the real render's first frames looked up).
 */
export function levelHead(figure: PoseRig3dFigure, yaw: number): void {
  const rest = restOf(figure.body).world.quat;
  const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  for (const bone of ['neck', 'head']) {
    setBoneWorldRotation(figure, bone, turn.clone().multiply(rest[bone]!));
  }
}

/**
 * Her pose as read from the still, lifted the way it looks: her turn toward the camera is kept,
 * so the returned camera direction (relative to her) is the still's.
 */
export function stillPoseFigure(
  body: NormalizedBody,
  aspect: number,
  kind: Rig3dBodyKind
): { figure: PoseRig3dFigure; side: 1 | -1; turned: number } {
  const lifted = liftBody(body, aspect, { body: kind });
  const at = placementOf(lifted);
  levelHead(lifted, at.yaw);
  const figure = groundFigure(toLocal(lifted, at));
  // Where the editor's camera stood, seen from her (her facing is +z now).
  const toCamera = Math.atan2(DEFAULT_CAMERA.position[0] - at.x, DEFAULT_CAMERA.position[2] - at.z);
  const turned = Math.atan2(Math.sin(toCamera - at.yaw), Math.cos(toCamera - at.yaw));
  return { figure, side: turned < 0 ? -1 : 1, turned: Math.abs((turned * 180) / Math.PI) };
}

export function poseBeat(
  name: string,
  figure: PoseRig3dFigure,
  options: { first?: boolean; words?: string } = {}
): DirectorPoseBeat {
  return {
    id: newBeatId(),
    kind: 'pose',
    name,
    ...(options.words ? { words: options.words } : {}),
    figure,
    seconds: options.first ? 0 : POSE_MOVE_SECONDS.default,
    hold: options.first ? HOLD_SECONDS.default : 0.8,
  };
}

/** What the 3D editor opens with for a beat: her placed pose, seen through the camera. */
export function editorRig(
  figure: PoseRig3dFigure,
  at: Placement,
  camera: PoseRig3dCamera,
  aspect: number
): { rig: PoseRig3d; bodies: NormalizedBody[] } {
  const rig: PoseRig3d = {
    version: RIG3D_VERSION,
    figures: [fromLocal(figure, at)],
    camera: { position: [...camera.position], target: [...camera.target], fov: camera.fov },
  };
  return { rig, bodies: projectRig(rig, aspect) };
}

/** The editor's saved pose back into the beat's frame, on the floor. */
export function figureFromEditor(pose: PhotoPose, at: Placement): PoseRig3dFigure | null {
  const placed = pose.rig3d?.figures[0];
  if (!placed) return null;
  return groundFigure(toLocal(placed, at));
}
