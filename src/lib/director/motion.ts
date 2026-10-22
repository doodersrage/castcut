/**
 * Director: the body's motion maths, without WebGL (from the director test's motion.ts). A move
 * is a set of scalar channels (hips place and turn, spine, chest, neck, head and arm rotations in
 * degrees, body axes: x = pitch forward +, y = yaw to her left +, z = roll) keyed over time with a
 * monotone cubic, plus a footstep plan the legs reach with the rig's two-bone IK.
 *
 * Each bone's rotation is applied in its parent's carried rest frame:
 * local = restWorld(parent)⁻¹ · R · restWorld(bone), so R reads the same on every bone.
 */

import { Euler, Quaternion, Vector3 } from 'three';
import {
  figureWorld,
  lookAt,
  restFigure,
  setBoneWorldRotation,
  solveLimbIK,
  type FigureWorld,
  type Side,
} from '@/lib/pose/rig3d-pose';
import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { RIG3D_SKELETONS } from '@/lib/pose/rig3d-skeleton';

export const D = Math.PI / 180;
export const SIDES: Side[] = ['L', 'R'];

// ── Rest skeleton, per body ───────────────────────────────────────────────────────────────

type Rest = {
  world: FigureWorld;
  parent: Map<string, string | null>;
  legLength: number;
  /** Ankle height above the floor with the foot flat (floor at y = 0). */
  ankleH: number;
  ball: Vector3;
  heel: Vector3;
  elbowAxis: Record<Side, Vector3>;
};

const rests = new Map<Rig3dBodyKind, Rest>();

export function restOf(kind: Rig3dBodyKind): Rest {
  const cached = rests.get(kind);
  if (cached) return cached;
  const world = figureWorld(restFigure(kind));
  const bones = new Map(RIG3D_SKELETONS[kind].bones.map(b => [b.name, b]));
  const ankleH = world.pos.foot_L!.y;
  const elbow = (side: Side) =>
    world.pos[`hand_${side}`]!.clone()
      .sub(world.pos[`forearm_${side}`]!)
      .normalize()
      .cross(new Vector3(0, 0, 1))
      .normalize();
  const rest: Rest = {
    world,
    parent: new Map(RIG3D_SKELETONS[kind].bones.map(b => [b.name, b.parent])),
    legLength:
      new Vector3(...bones.get('shin_L')!.p).length() +
      new Vector3(...bones.get('foot_L')!.p).length(),
    ankleH,
    ball: new Vector3(0, -ankleH, 0.125),
    heel: new Vector3(0, -ankleH, -0.045),
    elbowAxis: { L: elbow('L'), R: elbow('R') },
  };
  rests.set(kind, rest);
  return rest;
}

// ── Channels ──────────────────────────────────────────────────────────────────────────────

/** A frame's channels by name (degrees for rotations, metres for hx / hy / hz). */
export type Channels = Record<string, number>;

/** Standing, relaxed: what every channel is unless a move keys it. */
export const BASE: Channels = {
  hx: 0,
  hy: 0.93,
  hz: 0,
  yaw: 0,
  hp: 0,
  hr: 0,
  sx: 0,
  sy: 0,
  sz: 0,
  cx: 0,
  cy: 0,
  cz: 0,
  nx: 0,
  ny: 0,
  nz: 0,
  kx: 0,
  ky: 0,
  kz: 0,
  // Arms, each in its own side's convention (z = away from the body, y = turned outward):
  // clavicle raise, upper arm swing (x, back +) / out (z) / twist (y), elbow bend, wrist.
  Lcz: 0,
  Lux: 0,
  Luy: 0,
  Luz: -9,
  Le: 14,
  Lhx: 0,
  Lhz: 0,
  Rcz: 0,
  Rux: 0,
  Ruy: 0,
  Ruz: -9,
  Re: 14,
  Rhx: 0,
  Rhz: 0,
  // Look-at blend (0 = the keyed neck / head) and its target.
  lw: 0,
  lx: 0,
  ly: 1.5,
  lz: 6,
  // Heels raised on planted feet (degrees, pivoting on the balls).
  Lheel: 0,
  Rheel: 0,
};

export type Key = { t: number } & Channels;

/**
 * Monotone cubic (Fritsch–Carlson) through each channel's own keys: smooth through the keys,
 * flat at turning points and ends (ease in / out), no overshoot. Missing channels hold BASE.
 */
export function keyed(keys: Key[]): (t: number) => Channels {
  const names = new Set<string>();
  keys.forEach(k => Object.keys(k).forEach(n => n !== 't' && names.add(n)));
  const curves = new Map<string, (t: number) => number>();
  for (const name of names) {
    const pts = keys.filter(k => name in k).map(k => [k.t, k[name]!] as const);
    curves.set(name, monotone(pts));
  }
  return t => {
    const out: Channels = { ...BASE };
    for (const [name, curve] of curves) out[name] = curve(t);
    return out;
  };
}

export function monotone(pts: ReadonlyArray<readonly [number, number]>): (t: number) => number {
  const n = pts.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => pts[0]![1];
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(Math.max(1e-6, pts[i + 1]![0] - pts[i]![0]));
    slope.push((pts[i + 1]![1] - pts[i]![1]) / dx[i]!);
  }
  const m = [0];
  for (let i = 1; i < n - 1; i += 1) {
    const a = slope[i - 1]!;
    const b = slope[i]!;
    if (a * b <= 0) m.push(0);
    else {
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      m.push((w1 + w2) / (w1 / a + w2 / b));
    }
  }
  m.push(0);
  return t => {
    if (t <= pts[0]![0]) return pts[0]![1];
    if (t >= pts[n - 1]![0]) return pts[n - 1]![1];
    let i = 0;
    while (t > pts[i + 1]![0]) i += 1;
    const h = dx[i]!;
    const s = (t - pts[i]![0]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * pts[i]![1] +
      (s3 - 2 * s2 + s) * h * m[i]! +
      (-2 * s3 + 3 * s2) * pts[i + 1]![1] +
      (s3 - s2) * h * m[i + 1]!
    );
  };
}

/** Smoothstep: eases in and out, 0 → 1. */
export const ease = (s: number) => {
  const x = Math.min(1, Math.max(0, s));
  return x * x * (3 - 2 * x);
};
export const clamp01 = (s: number) => Math.min(1, Math.max(0, s));

/** Small life on a standing figure: breathing and a slow sway. */
export function idle(t: number, ch: Channels, amount = 1): Channels {
  ch.cx! += 1.2 * amount * Math.sin((2 * Math.PI * t) / 3.6);
  ch.hx! += 0.006 * amount * Math.sin((2 * Math.PI * t) / 4.8);
  ch.hr! += 0.8 * amount * Math.sin((2 * Math.PI * t) / 4.8);
  return ch;
}

// ── Feet ──────────────────────────────────────────────────────────────────────────────────

export type Plant = { x: number; z: number; yaw: number };
export type Step = {
  /** Toe off and heel strike (s). */
  off: number;
  on: number;
  to: Plant;
  /** Ankle lift at mid-swing (m), toe-off and heel-strike pitch (deg), heel rise before off (s). */
  lift?: number;
  toe?: number;
  heel?: number;
  rise?: number;
  roll?: number;
};
export type FootPlan = { start: Plant; steps: Step[] };
export type FootPose = { ankle: Vector3; q: Quaternion; forward: Vector3 };

export const yawQ = (deg: number) =>
  new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), deg * D);

/** The ankle and the foot's world turn for a foot on the ground at `p`, pitched on ball / heel. */
function groundFoot(rest: Rest, p: Plant, pitch: number): FootPose {
  const turn = yawQ(p.yaw);
  const q = turn
    .clone()
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch * D));
  const flatAnkle = new Vector3(p.x, rest.ankleH, p.z);
  const pivot = (pitch >= 0 ? rest.ball : rest.heel).clone();
  const pivotWorld = pivot.clone().applyQuaternion(turn).add(flatAnkle);
  const ankle = pivot.clone().negate().applyQuaternion(q).add(pivotWorld);
  return { ankle, q, forward: new Vector3(0, 0, 1).applyQuaternion(turn) };
}

export function lerpPlant(a: Plant, b: Plant, s: number): Plant {
  return { x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s, yaw: a.yaw + (b.yaw - a.yaw) * s };
}

export function footAt(kind: Rig3dBodyKind, plan: FootPlan, t: number, heelRaise = 0): FootPose {
  const rest = restOf(kind);
  let at = plan.start;
  for (const step of plan.steps) {
    const toe = step.toe ?? 30;
    const heel = step.heel ?? 15;
    const rise = step.rise ?? 0.22;
    const roll = step.roll ?? 0.14;
    if (t < step.off - rise) break;
    if (t < step.off) {
      // Heel rising, on the ball.
      const s = ease((t - (step.off - rise)) / rise);
      return groundFoot(rest, at, Math.max(heelRaise, toe * s));
    }
    if (t < step.on) {
      const s = (t - step.off) / (step.on - step.off);
      const along = 0.5 - 0.5 * Math.cos(Math.PI * s);
      const p = lerpPlant(at, step.to, along);
      const pitch = toe + (-heel - toe) * ease(s * 1.15 - 0.1);
      const a = groundFoot(rest, p, Math.max(0, pitch));
      const b = groundFoot(rest, p, Math.min(0, pitch));
      const ankle = a.ankle.lerp(b.ankle, ease(s));
      ankle.y += (step.lift ?? 0.07) * Math.sin(Math.PI * s) ** 1.2;
      const q = yawQ(p.yaw).multiply(
        new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch * D)
      );
      return { ankle, q, forward: a.forward };
    }
    at = step.to;
    if (t < step.on + roll) {
      const s = ease((t - step.on) / roll);
      return groundFoot(rest, at, -heel * (1 - s) + heelRaise * s);
    }
  }
  return groundFoot(rest, at, heelRaise);
}

// ── Building a figure ─────────────────────────────────────────────────────────────────────

function rotQ(x: number, y: number, z: number): Quaternion {
  return new Quaternion().setFromEuler(new Euler(x * D, y * D, z * D, 'YXZ'));
}

/** An arm rotation in the given side's convention, as a rotation in body axes. */
function armQ(
  side: Side,
  x: number,
  y: number,
  z: number,
  order: 'XZY' | 'YXZ' = 'XZY'
): Quaternion {
  // Out (away from the body) is +z for the left arm, −z for the right; turning out likewise.
  const s = side === 'L' ? 1 : -1;
  return new Quaternion().setFromEuler(new Euler(x * D, y * s * D, z * s * D, order));
}

export type FrameInput = { ch: Channels; feet: Record<Side, FootPose> };

/** Hips height at which both ankles are within reach (legs a hair short of straight). */
export function reachableHipsY(
  kind: Rig3dBodyKind,
  ch: Channels,
  feet: Record<Side, FootPose>
): number {
  const rest = restOf(kind);
  const fig = restFigure(kind);
  fig.position = [ch.hx!, ch.hy!, ch.hz!];
  const local = yawQ(ch.yaw!)
    .multiply(rotQ(ch.hp!, 0, ch.hr!))
    .multiply(rest.world.quat.hips!.clone());
  fig.bones.hips = [local.x, local.y, local.z, local.w];
  const w = figureWorld(fig);
  let y = ch.hy!;
  for (const side of SIDES) {
    const hip = w.pos[`thigh_${side}`]!;
    const ankle = feet[side].ankle;
    const flat = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
    const reach = rest.legLength * 0.985;
    const up = Math.sqrt(Math.max(0, reach * reach - flat * flat));
    y = Math.min(y, ch.hy! - (hip.y - ankle.y - up));
  }
  return y;
}

export function buildFigure(kind: Rig3dBodyKind, { ch, feet }: FrameInput): PoseRig3dFigure {
  const rest = restOf(kind);
  const restQ = (bone: string) => rest.world.quat[bone]!.clone();
  const fig = restFigure(kind);
  const set = (bone: string, R: Quaternion) => {
    const parent = rest.parent.get(bone) ?? null;
    const local = parent
      ? restQ(parent).invert().multiply(R).multiply(restQ(bone))
      : R.clone().multiply(restQ(bone));
    local.normalize();
    fig.bones[bone] = [local.x, local.y, local.z, local.w];
  };
  fig.position = [ch.hx!, ch.hy!, ch.hz!];
  set('hips', yawQ(ch.yaw!).multiply(rotQ(ch.hp!, 0, ch.hr!)));
  set('spine', rotQ(ch.sx!, ch.sy!, ch.sz!));
  set('chest', rotQ(ch.cx!, ch.cy!, ch.cz!));
  set('neck', rotQ(ch.nx!, ch.ny!, ch.nz!));
  set('head', rotQ(ch.kx!, ch.ky!, ch.kz!));
  for (const side of SIDES) {
    const s = side === 'L' ? 1 : -1;
    const c = (n: string) => ch[`${side}${n}`]!;
    set(
      `clavicle_${side}`,
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), c('cz') * s * D)
    );
    set(`upperarm_${side}`, armQ(side, c('ux'), c('uy'), c('uz')));
    set(`forearm_${side}`, new Quaternion().setFromAxisAngle(rest.elbowAxis[side], c('e') * D));
    set(`hand_${side}`, armQ(side, c('hx'), 0, c('hz'), 'YXZ'));
    for (const b of ['thigh', 'shin', 'foot']) set(`${b}_${side}`, new Quaternion());
  }
  // Look-at, blended over the keyed neck / head.
  if (ch.lw! > 0.001) {
    const looked = structuredClone(fig);
    lookAt(looked, new Vector3(ch.lx, ch.ly, ch.lz));
    for (const bone of ['neck', 'head']) {
      const a = new Quaternion(...fig.bones[bone]!);
      const b = new Quaternion(...looked.bones[bone]!);
      a.slerp(b, Math.min(1, ch.lw!));
      fig.bones[bone] = [a.x, a.y, a.z, a.w];
    }
  }
  // Legs: IK to the planted / swinging feet, knees toward the feet's front.
  for (const side of SIDES) {
    const foot = feet[side];
    const w = figureWorld(fig);
    const hip = w.pos[`thigh_${side}`]!;
    const hint = hip
      .clone()
      .add(foot.ankle)
      .multiplyScalar(0.5)
      .add(foot.forward.clone().multiplyScalar(0.4));
    solveLimbIK(fig, side, 'leg', foot.ankle, hint);
    setBoneWorldRotation(fig, `foot_${side}`, foot.q.clone().multiply(restQ(`foot_${side}`)));
  }
  return fig;
}

/** Gaussian smoothing of a per-frame series (sigma in frames), ends held. */
export function smooth(values: number[], sigma: number): number[] {
  if (sigma <= 0) return values.slice();
  const r = Math.ceil(sigma * 3);
  return values.map((_, i) => {
    let sum = 0;
    let wsum = 0;
    for (let k = -r; k <= r; k += 1) {
      const j = Math.min(values.length - 1, Math.max(0, i + k));
      const w = Math.exp(-(k * k) / (2 * sigma * sigma));
      sum += values[j]! * w;
      wsum += w;
    }
    return sum / wsum;
  });
}

/** A move as channels and feet over its own time (seconds from 0 to `seconds`). */
export type MotionDef = {
  seconds: number;
  channels: (t: number) => Channels;
  feet: Record<Side, FootPlan>;
  /** Smooth the hips height (frames); 0 keeps it exactly as keyed / reachable. */
  hipsSmooth?: number;
};

/** Frames of a motion sampled at `times` (its own seconds). */
export function motionFrames(
  kind: Rig3dBodyKind,
  def: MotionDef,
  times: number[]
): PoseRig3dFigure[] {
  const inputs: FrameInput[] = times.map(t => {
    const ch = def.channels(t);
    const feet = {
      L: footAt(kind, def.feet.L, t, ch.Lheel),
      R: footAt(kind, def.feet.R, t, ch.Rheel),
    } as Record<Side, FootPose>;
    return { ch, feet };
  });
  // Hips no higher than both feet allow; smoothed so the clamp leaves no kink.
  const allowed = inputs.map(i => reachableHipsY(kind, i.ch, i.feet));
  const lowered = inputs.map((i, n) => Math.min(i.ch.hy!, allowed[n]! - 0.004));
  const smoothed = smooth(lowered, def.hipsSmooth ?? 1.5);
  inputs.forEach((i, n) => (i.ch.hy = Math.min(smoothed[n]!, allowed[n]!)));
  return inputs.map(input => buildFigure(kind, input));
}

export const still = (p: Plant): FootPlan => ({ start: p, steps: [] });
