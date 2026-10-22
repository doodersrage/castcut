/**
 * Director: feet that stay put. Between two beats every bone is slerped (figure-ops mixFigures),
 * which slides a foot that is on the floor at both ends across it. Here a foot on the floor in
 * both is planted instead: the later pose is set down so one foot stays where it was (the hips
 * travel, not the foot), a foot that ends up within a few centimetres stays planted, and one that
 * has further to go takes a step (lifted, set down) while the other holds her weight. The legs
 * reach their feet with the rig's two-bone IK; the hips come down a little when a planted foot
 * would be out of reach.
 */

import { Quaternion, Vector3 } from 'three';
import type { PoseRig3dFigure } from '@/lib/pose/rig3d';
import {
  cloneFigure,
  figureWorld,
  setBoneWorldRotation,
  solveLimbIK,
  type FigureWorld,
  type Side,
} from '@/lib/pose/rig3d-pose';
import { ease, restOf, SIDES } from './motion';

/** A foot: its ankle and its world rotation. */
export type FootPose = { ankle: Vector3; q: Quaternion };
/** …and the ball of the foot, and whether it stands on the floor (flat, or up on the ball). */
export type FootContact = FootPose & { ball: Vector3; down: boolean };

/** How one foot gets from one beat to the next. */
export type FootMove = {
  kind: 'plant' | 'step';
  from: FootPose;
  to: FootPose;
  /** For a step: when it lifts and lands (0–1 of the transition). */
  window: [number, number];
};
export type FeetPlan = Partial<Record<Side, FootMove>>;

/** The ball of the foot this near the floor stands on it; the ankle no higher than this over
 * its flat height (up on the ball, not kneeling on the toes) (m). */
const DOWN = { ball: 0.05, ankle: 0.12 };
/** A foot that ends within this of where it was stays planted; further, it steps (m). */
const SAME_SPOT = 0.05;
/** The furthest the later pose is moved to keep a foot planted (m). */
const MAX_ANCHOR = 0.6;
const STEP_LIFT = 0.06;
/** Hips at least this share of their standing height: she is on her feet. */
const UPRIGHT = 0.75;

/** Where a foot is, and whether it stands on the floor. */
export function footContact(
  figure: PoseRig3dFigure,
  side: Side,
  world: FigureWorld = figureWorld(figure)
): FootContact {
  const rest = restOf(figure.body);
  const q = world.quat[`foot_${side}`]!.clone();
  const ankle = world.pos[`foot_${side}`]!.clone();
  // rest.ball / rest.heel are in the foot's turn without its rest rotation.
  const turn = q.clone().multiply(rest.world.quat[`foot_${side}`]!.clone().invert());
  const ball = rest.ball.clone().applyQuaternion(turn).add(ankle);
  // Sole down (not a foot on its side, lying), the ball on the floor, the heel no higher than
  // standing on the ball.
  const up = new Vector3(0, 1, 0).applyQuaternion(turn).y;
  const down = up > 0.5 && ball.y < DOWN.ball && ankle.y < rest.ankleH + DOWN.ankle;
  return { ankle, q, ball, down };
}

const flat = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * How far (x, z) to move `to` so that a foot on the floor in both figures stays where it was —
 * the one that would move least. Zero when no foot is down in both, or it would take too far.
 */
export function feetAnchor(from: PoseRig3dFigure, to: PoseRig3dFigure): { x: number; z: number } {
  const a = figureWorld(from);
  const b = figureWorld(to);
  let best: { x: number; z: number } | null = null;
  for (const side of SIDES) {
    const fa = footContact(from, side, a);
    const fb = footContact(to, side, b);
    if (!fa.down || !fb.down) continue;
    const shift = { x: fa.ball.x - fb.ball.x, z: fa.ball.z - fb.ball.z };
    if (!best || Math.hypot(shift.x, shift.z) < Math.hypot(best.x, best.z)) best = shift;
  }
  if (!best || Math.hypot(best.x, best.z) > MAX_ANCHOR) return { x: 0, z: 0 };
  return best;
}

/** A figure moved along the floor. */
export function shiftFigure(
  figure: PoseRig3dFigure,
  by: { x: number; z: number }
): PoseRig3dFigure {
  if (!by.x && !by.z) return figure;
  const out = cloneFigure(figure);
  out.position = [figure.position[0] + by.x, figure.position[1], figure.position[2] + by.z];
  return out;
}

/** Which feet stay planted (or step) between two figures. */
export function planFeet(from: PoseRig3dFigure, to: PoseRig3dFigure): FeetPlan {
  const a = figureWorld(from);
  const b = figureWorld(to);
  // Standing at both ends: a foot that leaves (or comes down on) the floor steps there too.
  const hipsUp = restOf(from.body).world.pos.hips!.y * UPRIGHT;
  const upright = a.pos.hips!.y > hipsUp && b.pos.hips!.y > hipsUp;
  const plan: FeetPlan = {};
  const steps: { side: Side; distance: number }[] = [];
  for (const side of SIDES) {
    const fa = footContact(from, side, a);
    const fb = footContact(to, side, b);
    const distance = flat(fa.ball, fb.ball);
    if (!(fa.down && fb.down) && !(upright && (fa.down || fb.down) && distance >= SAME_SPOT)) {
      continue;
    }
    const kind = fa.down && fb.down && distance < SAME_SPOT ? 'plant' : 'step';
    plan[side] = { kind, from: fa, to: fb, window: [0, 1] };
    if (kind === 'step') steps.push({ side, distance });
  }
  // One foot steps while the other stands; two step one after the other, the longer first.
  steps.sort((x, y) => y.distance - x.distance);
  if (steps.length === 1) plan[steps[0]!.side]!.window = [0.12, 0.88];
  if (steps.length === 2) {
    plan[steps[0]!.side]!.window = [0.05, 0.52];
    plan[steps[1]!.side]!.window = [0.48, 0.95];
  }
  return plan;
}

/** Where a planned foot is at `u` (0–1 of the transition; `s` its eased progress). */
export function plannedFoot(move: FootMove, u: number, s: number, to?: FootPose): FootPose {
  const end = to ?? move.to;
  if (move.kind === 'plant') {
    return {
      ankle: move.from.ankle.clone().lerp(end.ankle, s),
      q: move.from.q.clone().slerp(end.q, s),
    };
  }
  const [w0, w1] = move.window;
  const v = Math.min(1, Math.max(0, (u - w0) / Math.max(1e-6, w1 - w0)));
  const along = ease(v);
  const ankle = move.from.ankle.clone().lerp(end.ankle, along);
  ankle.y += STEP_LIFT * Math.sin(Math.PI * v);
  return { ankle, q: move.from.q.clone().slerp(end.q, along) };
}

/**
 * The legs of `figure` (a blend between two beats) reaching their planned feet: the hips come
 * down if a foot would be out of reach, then each leg is solved to its foot (the knee bending
 * the way it already does) and the foot turned as planned.
 */
export function placeFeet(
  figure: PoseRig3dFigure,
  plan: FeetPlan,
  u: number,
  s: number,
  to?: Partial<Record<Side, FootPose>>
): PoseRig3dFigure {
  const sides = SIDES.filter(side => plan[side]);
  if (!sides.length) return figure;
  const out = cloneFigure(figure);
  const feet = Object.fromEntries(
    sides.map(side => [side, plannedFoot(plan[side]!, u, s, to?.[side])])
  ) as Partial<Record<Side, FootPose>>;
  const rest = restOf(out.body);
  let world = figureWorld(out);
  let drop = 0;
  for (const side of sides) {
    const hip = world.pos[`thigh_${side}`]!;
    const ankle = feet[side]!.ankle;
    // Her own leg's length (the base body's, unless the still gave her her own proportions).
    const knee = world.pos[`shin_${side}`]!;
    const reach = (hip.distanceTo(knee) + knee.distanceTo(world.pos[`foot_${side}`]!)) * 0.985;
    const across = flat(hip, ankle);
    const up = Math.sqrt(Math.max(0, reach * reach - across * across));
    drop = Math.max(drop, hip.y - ankle.y - up);
  }
  if (drop > 0) out.position[1] -= Math.min(0.25, drop);
  world = figureWorld(out);
  for (const side of sides) {
    // The knee bends the way it already does, and toward the toes when the leg is straight.
    const foot = feet[side]!;
    const toes = new Vector3(0, 0, 0.1).applyQuaternion(
      foot.q.clone().multiply(rest.world.quat[`foot_${side}`]!.clone().invert())
    );
    const knee = world.pos[`shin_${side}`]!.clone().add(toes);
    solveLimbIK(out, side, 'leg', foot.ankle, knee);
    world = setBoneWorldRotation(out, `foot_${side}`, foot.q);
  }
  return out;
}
