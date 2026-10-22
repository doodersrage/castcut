/**
 * Director: start poses and pose beats — a starter (Stand, Sit, Kneel…) or her pose as read from
 * the still, lifted into the 3D body, turned to face the camera (starters) and set on the floor
 * in her own frame; and a pose from the 3D editor turned into a beat.
 */

import type { NormalizedBody } from '@/lib/pose/library';
import type { PoseRig3d, PoseRig3dCamera, PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { RIG3D_VERSION } from '@/lib/pose/rig3d';
import { Quaternion, Vector3 } from 'three';
import {
  aimAtFigures,
  faceWorld,
  refitLimbs,
  DEFAULT_CAMERA,
  figureWorld,
  liftBody,
  projectRig,
  setBoneWorldRotation,
} from '@/lib/pose/rig3d-pose';
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
  // (A starter is drawn for the base body: her own proportions are a still's.)
  const figure = liftBody(poseStarterBody(id), 2 / 3, { body: kind, proportions: false });
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
 * A face read as looking up, tipped down until it looks no higher than `maxUp` degrees above
 * level; anything else (a turn, a tilt, a look down) stays as the still has it. The lift reads
 * the head from a few face points and often tipped it back (the render's first frames looked
 * up); setting the head level outright turned the face away from where the still has it.
 */
export function untipHead(figure: PoseRig3dFigure, maxUp = 8): void {
  const forward = faceWorld(figure).forward.normalize();
  const limit = Math.sin((maxUp * Math.PI) / 180);
  if (forward.y <= limit) return;
  const flat = new Vector3(forward.x, 0, forward.z);
  if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1);
  flat.normalize();
  const want = flat.multiplyScalar(Math.sqrt(1 - limit * limit)).add(new Vector3(0, limit, 0));
  const turn = new Quaternion().setFromUnitVectors(forward, want);
  const world = figureWorld(figure);
  setBoneWorldRotation(figure, 'head', turn.multiply(world.quat.head!));
}

/**
 * Standing in the still: her back set straight along the camera's line of sight. A photo cannot
 * show how far she leans toward or away from the camera, and the lift often guessed a lean back
 * of 15–20° — shorter in the picture than she is, so she grew as the first move straightened
 * her (and the face looked up). Leans across the picture stay; a bend over (more than 35°) too.
 */
export function straightenInDepth(figure: PoseRig3dFigure, camera: PoseRig3dCamera): void {
  // The spine turns about its own joint, a little above the hips: twice gets it straight.
  for (let pass = 0; pass < 3; pass += 1) {
    if (!straightenOnce(figure, camera, pass === 0)) return;
  }
}

function straightenOnce(figure: PoseRig3dFigure, camera: PoseRig3dCamera, first: boolean) {
  const world = figureWorld(figure);
  const restHips = restOf(figure.body).world.pos.hips!.y;
  if (world.pos.hips!.y < restHips * 0.75) return false;
  const up = new Vector3(0, 1, 0);
  const depth = new Vector3(...camera.position).sub(world.pos.hips!).setY(0);
  if (depth.lengthSq() < 1e-6) return false;
  depth.normalize();
  const spine = world.pos.neck!.clone().sub(world.pos.hips!);
  const angle = Math.atan2(spine.dot(depth), spine.dot(up));
  if (Math.abs(angle) < (first ? 3 : 0.2) * (Math.PI / 180)) return false;
  if (first && Math.abs(angle) > (35 * Math.PI) / 180) return false;
  // Turn the spine (and everything above it) about the picture's horizontal axis.
  const axis = up.clone().cross(depth).normalize();
  const turn = new Quaternion().setFromAxisAngle(axis, angle);
  if (spine.clone().applyQuaternion(turn).dot(depth) ** 2 > spine.dot(depth) ** 2) turn.invert();
  setBoneWorldRotation(figure, 'spine', turn.multiply(world.quat.spine!));
  return true;
}

/**
 * Her pose as read from the still, lifted the way it looks: her turn toward the camera is kept,
 * so the returned camera direction (relative to her) is the still's — and `view` is the still's
 * camera itself, in her frame, so the Director shows her as the still does.
 */
export function stillPoseFigure(
  body: NormalizedBody,
  aspect: number,
  kind: Rig3dBodyKind
): { figure: PoseRig3dFigure; side: 1 | -1; turned: number; view: PoseRig3dCamera } {
  const lifted = liftBody(body, aspect, { body: kind });
  straightenInDepth(lifted, DEFAULT_CAMERA);
  // The arms back where the still has them (straightening swung them with the chest).
  refitLimbs(lifted, body, aspect, DEFAULT_CAMERA, ['arm']);
  // Not looking up, but otherwise the head as the still has it (levelHead turned it away).
  untipHead(lifted);
  const at = placementOf(lifted);
  const local = toLocal(lifted, at);
  const figure = groundFigure(local);
  const drop = figure.position[1] - local.position[1];
  // The lift's camera, moved with her into her own frame.
  const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -at.yaw);
  const inFrame = (p: readonly number[]) =>
    new Vector3(p[0]! - at.x, p[1]!, p[2]! - at.z)
      .applyQuaternion(turn)
      .add(new Vector3(0, drop, 0))
      .toArray() as [number, number, number];
  // Aimed at her (same picture): framing dollies and shifts about the target.
  const view = aimAtFigures(
    {
      position: inFrame(DEFAULT_CAMERA.position),
      target: inFrame(DEFAULT_CAMERA.target),
      fov: DEFAULT_CAMERA.fov,
    },
    [figure]
  );
  // Where the editor's camera stood, seen from her (her facing is +z now).
  const toCamera = Math.atan2(DEFAULT_CAMERA.position[0] - at.x, DEFAULT_CAMERA.position[2] - at.z);
  const turned = Math.atan2(Math.sin(toCamera - at.yaw), Math.cos(toCamera - at.yaw));
  return { figure, side: turned < 0 ? -1 : 1, turned: Math.abs((turned * 180) / Math.PI), view };
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
