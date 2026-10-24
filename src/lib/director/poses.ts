/**
 * Director: start poses and pose beats — a starter (Stand, Sit, Kneel…), a real pose from motion
 * capture (built from its own 3D), or her pose as read from the still (from the 3D pose the
 * still was posed with when it still matches, else lifted), turned to face the camera
 * (starters) and set on the floor in her own frame; and a pose from the 3D editor as a beat.
 */

import type { NormalizedBody } from '@/lib/pose/library';
import type { PoseRig3d, PoseRig3dCamera, PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { RIG3D_VERSION } from '@/lib/pose/rig3d';
import { Quaternion, Vector3 } from 'three';
import {
  aimAtFigures,
  cloneFigure,
  faceWorld,
  refitLimbs,
  DEFAULT_CAMERA,
  figureWorld,
  liftBody,
  cachedLiftWithCamera,
  liftBodyWithCamera,
  projectFigure,
  projectRig,
  setBoneWorldRotation,
} from '@/lib/pose/rig3d-pose';
import { faceCamera } from '@/lib/pose/rig3d-camera';
import type { PoseReference, PoseReferenceWorld } from '@/lib/pose/references';
import { mirrorWorldReference, rigFromWorldReference } from '@/lib/pose/rig3d-world';
import { liftBodyWithCameraAsync } from '@/lib/pose/rig3d-lift-async';
import type { Posture } from '@/lib/pose/rig3d-posture-points';
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
 * A motion-capture pose as captured (no lift: its own 3D, rig3d-world.ts), the lead only,
 * settled in her own frame — a real bend, kneel or stretch to move through.
 */
export function realPoseFigure(world: PoseReferenceWorld, kind: Rig3dBodyKind): PoseRig3dFigure {
  const rig = rigFromWorldReference({ ...world, people: [world.people[0]!] }, 2 / 3, [kind]);
  return settle(rig.figures[0]!);
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

const stillLiftOptions = (kind: Rig3dBodyKind, postures?: Posture[]) => ({
  body: kind,
  ...(postures ? { postures } : {}),
});

/** Whether the still's camera is read already (stillPoseFigure with 'known' gives it). */
export function stillCameraKnown(
  body: NormalizedBody,
  aspect: number,
  kind: Rig3dBodyKind,
  postures?: Posture[]
): boolean {
  return cachedLiftWithCamera(body, aspect, stillLiftOptions(kind, postures)) !== null;
}

/**
 * Read the still's camera off the page's thread (the lift worker): once it resolves,
 * stillPoseFigure with 'known' sees the still through it. Aborted, it never settles.
 */
export async function readStillCamera(
  body: NormalizedBody,
  aspect: number,
  kind: Rig3dBodyKind,
  postures?: Posture[],
  signal?: AbortSignal
): Promise<void> {
  await liftBodyWithCameraAsync(body, aspect, stillLiftOptions(kind, postures), signal);
}

/**
 * Her pose as read from the still, lifted the way it looks: her turn toward the camera is kept,
 * so the returned camera direction (relative to her) is the still's — and `view` is the still's
 * camera itself, in her frame, so the Director shows her as the still does.
 *
 * `camera`: 'read' reads the still's camera here (~0.3 s, cached per still); 'known' uses it
 * when it is read already (readStillCamera), else eye level — quick enough to draw at once.
 */
export function stillPoseFigure(
  body: NormalizedBody,
  aspect: number,
  kind: Rig3dBodyKind,
  /** Her posture when it is known from outside the joints (the pose she was picked in). */
  postures?: Posture[],
  camera: 'read' | 'known' = 'read'
): {
  figure: PoseRig3dFigure;
  side: 1 | -1;
  turned: number;
  view: PoseRig3dCamera;
} {
  const options = stillLiftOptions(kind, postures);
  // Lifted through the camera the still reads as taken with (from above, below, or eye level).
  const estimated =
    camera === 'read'
      ? liftBodyWithCamera(body, aspect, options)
      : (cachedLiftWithCamera(body, aspect, options) ?? {
          figure: liftBody(body, aspect, { ...options, camera: DEFAULT_CAMERA }),
          camera: DEFAULT_CAMERA,
        });
  const { error, ...read } = posedFromLift(
    body,
    aspect,
    estimated.figure,
    estimated.camera,
    postures
  );
  if (estimated.camera === DEFAULT_CAMERA) return read;
  // Straightened, she may no longer draw the still through that camera (a lean that read a
  // stride from below): then the eye-level camera, when it draws her clearly closer.
  const { error: levelError, ...level } = posedFromLift(
    body,
    aspect,
    liftBody(body, aspect, { ...options, camera: DEFAULT_CAMERA }),
    DEFAULT_CAMERA,
    postures
  );
  return levelError + STILL_CAMERA_SLACK < error ? level : read;
}

/**
 * Her pose in the still from the 3D pose it was posed with (a custom pose made in the 3D editor),
 * not lifted from the still: a pose seen from behind or the side keeps its real depth. Only when
 * the still still shows that pose — the model may have drawn another — measured shape to shape
 * (position and size aside, the editor's framing is not the still's); else null (lift instead).
 */
export function knownStillPoseFigure(
  rig: PoseRig3d,
  body: NormalizedBody,
  aspect: number,
  kind: Rig3dBodyKind
): { figure: PoseRig3dFigure; side: 1 | -1; turned: number; view: PoseRig3dCamera } | null {
  const lead = rig.figures[0];
  if (!lead || lead.body !== kind) return null;
  const { error: _error, ...placed } = placedWithCamera(
    body,
    aspect,
    cloneFigure(lead),
    rig.camera
  );
  const shown = projectFigure(placed.figure, placed.view, aspect);
  return shapeError(body, shown, aspect) <= KNOWN_POSE_SHAPE_ERROR ? placed : null;
}

/**
 * Her pose in the still from a real pose's own 3D, when the still was made from one of the pose
 * it was picked as (a Day slot's or Story beat's "Try another" variant): each of that pose's
 * references with 3D, as captured and mirrored, measured against the still; the closest that
 * passes, else null (lift instead).
 */
export function referenceStillPoseFigure(
  references: readonly PoseReference[],
  poseId: string | null | undefined,
  body: NormalizedBody,
  aspect: number,
  kind: Rig3dBodyKind
): { figure: PoseRig3dFigure; side: 1 | -1; turned: number; view: PoseRig3dCamera } | null {
  const id = poseId?.trim();
  if (!id) return null;
  let best: { placed: NonNullable<ReturnType<typeof knownStillPoseFigure>>; error: number } | null =
    null;
  for (const ref of references) {
    if (ref.pose !== id || !ref.world) continue;
    for (const world of [ref.world, mirrorWorldReference(ref.world)]) {
      const lead = { ...world, people: [world.people[0]!] };
      const placed = knownStillPoseFigure(
        rigFromWorldReference(lead, aspect, [kind]),
        body,
        aspect,
        kind
      );
      if (!placed) continue;
      const error = shapeError(body, projectFigure(placed.figure, placed.view, aspect), aspect);
      if (!best || error < best.error) best = { placed, error };
    }
  }
  return best?.placed ?? null;
}

/** How far (share of her size) the still's pose may be from the 3D pose's and still be it. */
export const KNOWN_POSE_SHAPE_ERROR = 0.12;

/**
 * Mean distance between two bodies' joints once each is centred and scaled to unit size: the
 * same pose framed differently scores 0.
 */
export function shapeError(a: NormalizedBody, b: NormalizedBody, aspect: number): number {
  const both: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 14; i += 1) {
    const p = a[i];
    const q = b[i];
    if (p && q) both.push([p.x * aspect, p.y, q.x * aspect, q.y]);
  }
  if (both.length < 6) return Infinity;
  const norm = (pick: 0 | 2) => {
    const cx = both.reduce((s, v) => s + v[pick]!, 0) / both.length;
    const cy = both.reduce((s, v) => s + v[pick + 1]!, 0) / both.length;
    const size =
      Math.sqrt(
        both.reduce((s, v) => s + (v[pick]! - cx) ** 2 + (v[pick + 1]! - cy) ** 2, 0) / both.length
      ) || 1;
    return both.map(v => [(v[pick]! - cx) / size, (v[pick + 1]! - cy) / size] as const);
  };
  const pa = norm(0);
  const pb = norm(2);
  return pa.reduce((s, p, i) => s + Math.hypot(p[0] - pb[i]![0], p[1] - pb[i]![1]), 0) / pa.length;
}

/** How much closer the eye-level camera must draw her before it wins over the still's own. */
const STILL_CAMERA_SLACK = 0.003;

function pictureError(a: NormalizedBody, b: NormalizedBody, aspect: number): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < 14; i += 1) {
    const p = a[i];
    const q = b[i];
    if (!p || !q) continue;
    sum += Math.hypot((p.x - q.x) * aspect, p.y - q.y);
    count += 1;
  }
  return count ? sum / count : 0;
}

/** A lifted figure as the Director starts from it: straightened, on the floor, with its camera. */
function posedFromLift(
  body: NormalizedBody,
  aspect: number,
  lifted: PoseRig3dFigure,
  camera: PoseRig3dCamera,
  postures: Posture[] | undefined
) {
  // (A pose known to be bent over or down keeps the lean the lift found for it.)
  if (!postures || postures.includes('stand')) straightenInDepth(lifted, camera);
  // The arms back where the still has them (straightening swung them with the chest).
  refitLimbs(lifted, body, aspect, camera, ['arm']);
  // Not looking up, but otherwise the head as the still has it (levelHead turned it away).
  untipHead(lifted);
  return placedWithCamera(body, aspect, lifted, camera);
}

/** A figure and the camera it was seen through, moved into her own frame on the floor. */
function placedWithCamera(
  body: NormalizedBody,
  aspect: number,
  lifted: PoseRig3dFigure,
  camera: PoseRig3dCamera
) {
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
      position: inFrame(camera.position),
      target: inFrame(camera.target),
      fov: camera.fov,
    },
    [figure]
  );
  // Where the still's camera stood, seen from her (her facing is +z now).
  const toCamera = Math.atan2(camera.position[0] - at.x, camera.position[2] - at.z);
  const turned = Math.atan2(Math.sin(toCamera - at.yaw), Math.cos(toCamera - at.yaw));
  return {
    figure,
    side: (turned < 0 ? -1 : 1) as 1 | -1,
    turned: Math.abs((turned * 180) / Math.PI),
    view,
    error: pictureError(body, projectFigure(figure, view, aspect), aspect),
  };
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
