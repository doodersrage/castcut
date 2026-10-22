/**
 * Director: whole-figure operations — where she stands and faces (a placement), moving a figure
 * from one placement to another, blending two figures (bone slerp, hips lerp), keeping her feet
 * on the floor, and reading whether a pose needs something to rest on.
 */

import { Quaternion, Vector3 } from 'three';
import type { PoseRig3dFigure, Rig3dQuat } from '@/lib/pose/rig3d';
import { cloneFigure, figureWorld, openPoseWorld, type FigureWorld } from '@/lib/pose/rig3d-pose';
import { restOf } from './motion';

/** Where she stands (hips over x, z) and which way her hips face (yaw, radians; 0 = +z). */
export type Placement = { x: number; z: number; yaw: number };

export const ORIGIN: Placement = { x: 0, z: 0, yaw: 0 };

const UP = new Vector3(0, 1, 0);

/** The hips' turn about the vertical, from rest (0 = facing +z). */
export function hipsYaw(figure: PoseRig3dFigure, world: FigureWorld = figureWorld(figure)): number {
  const rest = restOf(figure.body).world.quat.hips!;
  const turn = world.quat.hips!.clone().multiply(rest.clone().invert());
  const forward = new Vector3(0, 0, 1).applyQuaternion(turn);
  if (Math.hypot(forward.x, forward.z) < 0.2) {
    // Lying flat: read the turn from her head end instead.
    const up = new Vector3(0, 1, 0).applyQuaternion(turn);
    return Math.atan2(up.x, up.z);
  }
  return Math.atan2(forward.x, forward.z);
}

export function placementOf(figure: PoseRig3dFigure): Placement {
  const world = figureWorld(figure);
  return { x: world.pos.hips!.x, z: world.pos.hips!.z, yaw: hipsYaw(figure, world) };
}

/** The figure moved rigidly so that `from` lands on `to` (turned about the vertical). */
export function transformFigure(
  figure: PoseRig3dFigure,
  from: Placement,
  to: Placement
): PoseRig3dFigure {
  const out = cloneFigure(figure);
  const turn = to.yaw - from.yaw;
  const q = new Quaternion().setFromAxisAngle(UP, turn);
  const p = new Vector3(
    figure.position[0] - from.x,
    figure.position[1],
    figure.position[2] - from.z
  )
    .applyQuaternion(q)
    .add(new Vector3(to.x, 0, to.z));
  out.position = [p.x, p.y, p.z];
  const hips = q.multiply(new Quaternion(...figure.bones.hips!)).normalize();
  out.bones.hips = [hips.x, hips.y, hips.z, hips.w];
  return out;
}

/** A figure into her own frame (placement → origin), or back out (origin → placement). */
export const toLocal = (figure: PoseRig3dFigure, at: Placement) =>
  transformFigure(figure, at, ORIGIN);
export const fromLocal = (figure: PoseRig3dFigure, at: Placement) =>
  transformFigure(figure, ORIGIN, at);

/** How far her lowest resting point is above the floor (feet, else knees, else hips). */
export function floorGap(
  figure: PoseRig3dFigure,
  world: FigureWorld = figureWorld(figure)
): number {
  const ankleH = restOf(figure.body).ankleH;
  const p = world.pos;
  return Math.min(
    p.foot_L!.y - ankleH,
    p.foot_R!.y - ankleH,
    p.shin_L!.y - 0.06,
    p.shin_R!.y - 0.06,
    p.hips!.y - 0.1,
    p.hand_L!.y - 0.03,
    p.hand_R!.y - 0.03
  );
}

/** The figure raised or lowered so her lowest resting point is on the floor. */
export function groundFigure(figure: PoseRig3dFigure): PoseRig3dFigure {
  const out = cloneFigure(figure);
  out.position[1] -= floorGap(figure);
  return out;
}

function slerpQ(a: Rig3dQuat, b: Rig3dQuat, s: number): Rig3dQuat {
  const q = new Quaternion(...a).slerp(new Quaternion(...b), s);
  return [q.x, q.y, q.z, q.w];
}

/**
 * Between two figures: every bone slerped, the hips moved in a straight line; then lifted or
 * lowered so the feet stay on the floor as they were at the ends (no sinking mid-way).
 */
export function mixFigures(a: PoseRig3dFigure, b: PoseRig3dFigure, s: number): PoseRig3dFigure {
  if (s <= 0) return cloneFigure(a);
  if (s >= 1) return cloneFigure(b);
  const out = cloneFigure(a);
  for (const [name, qb] of Object.entries(b.bones)) {
    const qa = a.bones[name];
    out.bones[name] = qa ? slerpQ(qa, qb, s) : [...qb];
  }
  out.position = [0, 1, 2].map(i => a.position[i]! + (b.position[i]! - a.position[i]!) * s) as [
    number,
    number,
    number,
  ];
  const want = floorGap(a) + (floorGap(b) - floorGap(a)) * s;
  out.position[1] += want - floorGap(out);
  return out;
}

/** A gentle breath: the chest tips back and forth by `degrees` about her left-right axis. */
export function breathe(figure: PoseRig3dFigure, degrees: number): PoseRig3dFigure {
  if (Math.abs(degrees) < 1e-3) return figure;
  const out = cloneFigure(figure);
  const world = figureWorld(out);
  const rest = restOf(out.body).world.quat;
  const left = new Vector3(1, 0, 0).applyQuaternion(
    world.quat.hips!.clone().multiply(rest.hips!.clone().invert())
  );
  const tip = new Quaternion().setFromAxisAngle(left, (degrees * Math.PI) / 180);
  // Rotate the chest in its parent's frame: local' = parentWorld⁻¹ · tip · chestWorld.
  const parent = world.quat.spine!.clone();
  const local = parent.invert().multiply(tip).multiply(world.quat.chest!).normalize();
  out.bones.chest = [local.x, local.y, local.z, local.w];
  return out;
}

export type PoseSupport = 'sit' | 'lean' | null;

/**
 * Whether a pose needs something under or beside her: sitting with her hips off the floor and
 * her feet down (a seat), or her upper body well outside her feet without a hand down (a wall,
 * a counter). Kneeling, sitting on the floor and lying need nothing.
 */
export function poseSupport(figure: PoseRig3dFigure): PoseSupport {
  const world = figureWorld(figure);
  const gap = floorGap(figure, world);
  const p = world.pos;
  const hipsUp = p.hips!.y - gap;
  // A knee near the floor, or barely above its own ankle (kneeling on the shins).
  const kneesDown =
    Math.min(p.shin_L!.y, p.shin_R!.y) - gap < 0.16 ||
    Math.min(p.shin_L!.y - p.foot_L!.y, p.shin_R!.y - p.foot_R!.y) < 0.2;
  const rest = restOf(figure.body).world.pos.hips!.y;
  if (!kneesDown && hipsUp > 0.28 && hipsUp < rest * 0.78) return 'sit';
  const points = openPoseWorld(figure, world);
  const neck = points[1]!;
  const feet = p.foot_L!.clone().add(p.foot_R!).multiplyScalar(0.5);
  const handDown = Math.min(p.hand_L!.y, p.hand_R!.y) - gap < 0.12;
  const offset = Math.hypot(neck.x - feet.x, neck.z - feet.z);
  if (!kneesDown && !handDown && hipsUp >= rest * 0.78 && offset > 0.38) return 'lean';
  return null;
}
