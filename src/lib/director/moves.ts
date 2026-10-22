/**
 * Director: ready-made moves (walk forward, turn around, sit down, wave…). Each is built in her
 * own frame — hips over the origin, facing +z, standing relaxed at the start — and the timeline
 * (timeline.ts) places it where the previous beat left her. Walk, turn, sit and reach come from
 * the director test (scripts/director-test on the feasibility branch); the walk takes small steps
 * so she stays in frame.
 */

import { Vector3 } from 'three';
import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import type { Side } from '@/lib/pose/rig3d-pose';
import {
  BASE,
  D,
  clamp01,
  idle,
  keyed,
  lerpPlant,
  motionFrames,
  smooth,
  still,
  type Channels,
  type FootPlan,
  type Key,
  type MotionDef,
  type Plant,
} from './motion';

export const DIRECTOR_MOVE_IDS = [
  'walk',
  'turn',
  'sit',
  'stand',
  'wave',
  'reach',
  'look-back',
  'nod',
  'shrug',
  'bow',
] as const;
export type DirectorMoveId = (typeof DIRECTOR_MOVE_IDS)[number];

export type DirectorMove = {
  id: DirectorMoveId;
  label: string;
  /** For the motion line: "she {phrase}". */
  phrase: string;
  /** Natural length (s); a beat may stretch or squeeze it (MOVE_STRETCH). */
  seconds: number;
  /** She ends up sitting on something (the still must have a seat). */
  sits?: boolean;
  /** Only makes sense from sitting. */
  fromSitting?: boolean;
};

export const DIRECTOR_MOVES: Record<DirectorMoveId, DirectorMove> = {
  walk: {
    id: 'walk',
    label: 'Walk forward',
    phrase: 'takes a few small steps forward',
    seconds: 3.4,
  },
  turn: { id: 'turn', label: 'Turn around', phrase: 'turns around', seconds: 2.6 },
  sit: { id: 'sit', label: 'Sit down', phrase: 'sits down', seconds: 3.0, sits: true },
  stand: {
    id: 'stand',
    label: 'Stand up',
    phrase: 'stands up',
    seconds: 2.6,
    fromSitting: true,
  },
  wave: { id: 'wave', label: 'Wave', phrase: 'waves with her right hand', seconds: 2.6 },
  reach: { id: 'reach', label: 'Reach up', phrase: 'reaches up high', seconds: 4.2 },
  'look-back': {
    id: 'look-back',
    label: 'Look over shoulder',
    phrase: 'looks back over her left shoulder',
    seconds: 2.8,
  },
  nod: { id: 'nod', label: 'Nod', phrase: 'nods', seconds: 1.6 },
  shrug: { id: 'shrug', label: 'Shrug', phrase: 'shrugs', seconds: 1.8 },
  bow: { id: 'bow', label: 'Bow', phrase: 'bows', seconds: 2.4 },
};

/** How far a beat may stretch (or squeeze) a move's natural length. */
export const MOVE_STRETCH = { min: 0.6, max: 2 } as const;

export function isDirectorMoveId(value: unknown): value is DirectorMoveId {
  return typeof value === 'string' && (DIRECTOR_MOVE_IDS as readonly string[]).includes(value);
}

/** A beat's length for a move, kept within what the move can stretch to. */
export function clampMoveSeconds(id: DirectorMoveId, seconds: number): number {
  const natural = DIRECTOR_MOVES[id].seconds;
  const value = Number.isFinite(seconds) ? seconds : natural;
  return Math.min(natural * MOVE_STRETCH.max, Math.max(natural * MOVE_STRETCH.min, value));
}

const standing = (lr: number, yaw = 0, spread = 0.1): Plant => ({
  x: lr * spread,
  z: 0,
  yaw: yaw + lr * 5,
});
const standStill = (): Record<Side, FootPlan> => ({
  L: still(standing(1)),
  R: still(standing(-1)),
});

// 1. Walk: small steps straight ahead (toward the camera when she faces it), back to standing.
function walk(): MotionDef {
  const half = 0.095;
  const at = (s: number, lr: number): Plant => ({
    x: lr * half,
    z: s,
    yaw: 4 * (lr > 0 ? 1 : -1),
  });
  const L = 0.3;
  const T = 0.56;
  const swing = 0.42;
  const t0 = 0.4;
  const n = 5;
  const plans: Record<Side, FootPlan> = {
    L: { start: at(0, 1), steps: [] },
    R: { start: at(0, -1), steps: [] },
  };
  for (let i = 0; i < n; i += 1) {
    const sideOf: Side = i % 2 === 0 ? 'R' : 'L';
    // Each foot lands a stride past the other (the first a half stride); the last step brings
    // the feet together.
    const last = i === n - 1;
    const first = i === 0;
    const pos = last ? L * (i - 0.5) : L * (i + 0.5);
    const off = t0 + i * T;
    plans[sideOf].steps.push({
      off,
      on: off + (first || last ? swing * 0.95 : swing),
      to: at(pos, sideOf === 'L' ? 1 : -1),
      lift: first || last ? 0.045 : 0.055,
      toe: first ? 16 : last ? 18 : 26,
      heel: last ? 5 : 12,
      rise: first ? 0.18 : 0.22,
    });
  }
  const progress = (plan: FootPlan, t: number) => {
    let a = plan.start;
    for (const st of plan.steps) {
      if (t < st.off) break;
      if (t < st.on) {
        const u = (t - st.off) / (st.on - st.off);
        return lerpPlant(a, st.to, 0.5 - 0.5 * Math.cos(Math.PI * u)).z;
      }
      a = st.to;
    }
    return a.z;
  };
  // The hips travel smoothly: the feet's average, smoothed over time.
  const fps = 16;
  const dt = 1 / fps;
  const span = Math.ceil(4 * fps) + 40;
  const fine = Array.from({ length: span }, (_, i) => (i - 20) * dt);
  const avg = fine.map(t => (progress(plans.L, t) + progress(plans.R, t)) / 2);
  const support = fine.map(t => {
    const inAir = (plan: FootPlan) => plan.steps.some(st => t >= st.off - 0.05 && t < st.on + 0.05);
    return inAir(plans.R) ? 1 : inAir(plans.L) ? -1 : 0;
  });
  const sAvg = smooth(avg, 3.2);
  const sway = smooth(support, 2.5);
  const sample = (arr: number[], t: number) => {
    const f = t / dt + 20;
    const i = Math.max(0, Math.min(arr.length - 2, Math.floor(f)));
    return arr[i]! + (arr[i + 1]! - arr[i]!) * (f - i);
  };
  const tEnd = t0 + (n - 1) * T + swing;
  return {
    seconds: DIRECTOR_MOVES.walk.seconds,
    feet: plans,
    hipsSmooth: 1.2,
    channels: t => {
      const walking = clamp01((t - t0 + 0.1) / 0.5) * (1 - clamp01((t - tEnd + 0.3) / 0.5));
      const ch: Channels = { ...BASE };
      ch.hx = 0.018 * sample(sway, t);
      ch.hz = sample(sAvg, t) + 0.02 * walking;
      ch.hy = 0.92;
      const diff = progress(plans.L, t) - progress(plans.R, t);
      ch.yaw = -12 * diff * walking;
      ch.hr = -2 * sample(sway, t) * walking;
      ch.sy = 5 * diff * walking;
      ch.cy = 9 * diff * walking;
      ch.hp = 1.5 * walking;
      ch.sx = 1.5 * walking;
      ch.cx = 1 * walking;
      ch.ky = -2 * diff * walking;
      ch.kz = 1 * sample(sway, t) * walking;
      const armSwing = 34 * diff * walking;
      ch.Lux = armSwing;
      ch.Rux = -armSwing;
      ch.Le = 16 + Math.max(0, -armSwing) * 0.7 + 4 * walking;
      ch.Re = 16 + Math.max(0, armSwing) * 0.7 + 4 * walking;
      ch.Luz = -11;
      ch.Ruz = -11;
      ch.Luy = 6;
      ch.Ruy = 6;
      return idle(t, ch, 1 - walking);
    },
  };
}

// 2. Turn around: turns to her right with three small steps until her back is to where she faced.
function turn(): MotionDef {
  const plantAt = (yaw: number, lr: number, fwd = 0): Plant => {
    const d = new Vector3(Math.sin(yaw * D), 0, Math.cos(yaw * D));
    const left = new Vector3(d.z, 0, -d.x);
    const p = left.multiplyScalar(lr * 0.1).add(d.multiplyScalar(fwd));
    return { x: p.x, z: p.z, yaw: yaw + lr * 5 };
  };
  const plans: Record<Side, FootPlan> = {
    R: {
      start: plantAt(0, -1),
      steps: [
        {
          off: 0.35,
          on: 0.85,
          to: plantAt(-80, -1, -0.04),
          lift: 0.04,
          toe: 14,
          heel: 4,
          rise: 0.2,
        },
        { off: 1.55, on: 1.95, to: plantAt(-180, -1), lift: 0.035, toe: 12, heel: 3, rise: 0.18 },
      ],
    },
    L: {
      start: plantAt(0, 1),
      steps: [
        {
          off: 0.9,
          on: 1.45,
          to: plantAt(-150, 1, 0.02),
          lift: 0.045,
          toe: 16,
          heel: 4,
          rise: 0.2,
        },
      ],
    },
  };
  const ch = keyed([
    { t: 0, yaw: 0, hx: 0, hz: 0, cy: 0, sy: 0, ky: 0 },
    { t: 0.1, yaw: 0, cy: 0, sy: 0, ky: 0 },
    // The head and chest lead the turn; the hips follow the feet.
    { t: 0.45, yaw: -8, cy: -10, sy: -4, ky: -18 },
    { t: 1.0, yaw: -62, cy: -12, sy: -5, ky: -14, hx: 0.01 },
    { t: 1.6, yaw: -130, cy: -8, sy: -4, ky: -6 },
    { t: 2.15, yaw: -180, cy: 0, sy: 0, ky: 0, hx: 0 },
  ]);
  return {
    seconds: DIRECTOR_MOVES.turn.seconds,
    feet: plans,
    channels: t => {
      const c = ch(t);
      c.hy = 0.925;
      return idle(t, c, 0.8);
    },
  };
}

// 3. Sit down on a seat behind her (the still must have one).
function sitKeys(): (t: number) => Channels {
  const k = (t: number, back: number, rest: Channels): Key => ({ t, hx: 0, hz: -back, ...rest });
  return keyed([
    k(0, 0, {
      hy: 0.93,
      hp: 0,
      sx: 0,
      cx: 0,
      kx: 0,
      Lux: 0,
      Rux: 0,
      Le: 14,
      Re: 14,
      Luz: -9,
      Ruz: -9,
    }),
    k(0.2, 0, { hy: 0.93, hp: 0, sx: 0, cx: 0, kx: 0 }),
    // Hinge at the hips, push them back, arms come forward to balance.
    k(0.95, 0.1, { hy: 0.85, hp: 22, sx: 8, cx: 4, kx: -18, Lux: -18, Rux: -18, Le: 26, Re: 26 }),
    k(1.65, 0.24, { hy: 0.66, hp: 34, sx: 10, cx: 4, kx: -24, Lux: -26, Rux: -26, Le: 34, Re: 34 }),
    // Down on the seat.
    k(2.2, 0.33, { hy: 0.565, hp: 22, sx: 6, cx: 2, kx: -14 }),
    k(2.9, 0.35, {
      hy: 0.56,
      hp: -4,
      sx: 2,
      cx: 2,
      kx: -2,
      Lux: -26,
      Rux: -26,
      Le: 28,
      Re: 28,
      Luz: -24,
      Ruz: -24,
      Lhx: 14,
      Rhx: 14,
    }),
  ]);
}

function sit(): MotionDef {
  const ch = sitKeys();
  const foot = (lr: number): Plant => ({ x: lr * 0.105, z: 0.04, yaw: lr * 7 });
  return {
    seconds: DIRECTOR_MOVES.sit.seconds,
    feet: { L: still(foot(1)), R: still(foot(-1)) },
    hipsSmooth: 0,
    channels: t => idle(t, ch(t), 0.6),
  };
}

// 4. Stand up: sitting down, backwards.
function stand(): MotionDef {
  const down = sit();
  const length = DIRECTOR_MOVES.sit.seconds;
  const scale = length / DIRECTOR_MOVES.stand.seconds;
  return {
    seconds: DIRECTOR_MOVES.stand.seconds,
    feet: down.feet,
    hipsSmooth: 0,
    channels: t => down.channels(Math.max(0, length - t * scale)),
  };
}

// 5. Wave: the right hand goes up beside her head and waves, then comes down.
function wave(): MotionDef {
  const ch = keyed([
    { t: 0, Rux: 0, Ruz: -9, Re: 14, Rcz: 0, Ruy: 0, Rhz: 0, kz: 0, lw: 0 },
    { t: 0.15, Rux: 0, Ruz: -9, Re: 14 },
    { t: 0.7, Rux: -118, Ruz: 28, Re: 58, Rcz: 10, Ruy: 30, kz: -3 },
    { t: 1.9, Rux: -118, Ruz: 28, Re: 58, Rcz: 10, Ruy: 30, kz: -3 },
    { t: 2.6, Rux: 0, Ruz: -9, Re: 14, Rcz: 0, Ruy: 0, kz: 0 },
  ]);
  return {
    seconds: DIRECTOR_MOVES.wave.seconds,
    feet: standStill(),
    hipsSmooth: 0,
    channels: t => {
      const c = ch(t);
      // The hand waves side to side while it is up.
      const up = clamp01((t - 0.55) / 0.25) * (1 - clamp01((t - 1.85) / 0.25));
      const w = Math.sin(2 * Math.PI * 2.2 * (t - 0.6));
      c.Ruz! += 9 * w * up;
      c.Rhz! += 22 * w * up;
      c.Re! += 8 * w * up;
      c.ky! += 4 * up;
      return idle(t, c, 0.7);
    },
  };
}

// 6. Reach up: her right arm overhead, up on her toes, and back down.
function reach(): MotionDef {
  const hand = new Vector3(-0.15, 2.15, 0.25);
  const ch = keyed([
    {
      t: 0,
      Rux: 0,
      Ruz: -9,
      Re: 14,
      Rcz: 0,
      Ruy: 0,
      Lux: 0,
      Luz: -9,
      Le: 14,
      Lheel: 0,
      Rheel: 0,
      hy: 0.93,
      cx: 0,
      sx: 0,
      lw: 0,
      sz: 0,
      Rhx: 0,
    },
    { t: 0.2, Rux: 0, Ruz: -9, Re: 14, lw: 0 },
    { t: 0.9, Rux: -95, Ruz: 0, Re: 38, Rcz: 6, Ruy: 10, lw: 0.6, Rhx: -10 },
    {
      t: 1.5,
      Rux: -165,
      Ruz: 8,
      Re: 6,
      Rcz: 18,
      Ruy: 20,
      lw: 1,
      cx: -5,
      sx: -3,
      sz: 3,
      Luz: -3,
      Le: 20,
      Rhx: -16,
    },
    { t: 1.7, Lheel: 0, Rheel: 0, hy: 0.93 },
    {
      t: 2.2,
      Lheel: 34,
      Rheel: 34,
      hy: 1.0,
      Rux: -172,
      Rcz: 24,
      Ruz: 9,
      Re: 3,
      cx: -7,
      sz: 4,
      Luz: -1,
    },
    { t: 2.6, Lheel: 34, Rheel: 34, hy: 1.0, Rux: -172, Rcz: 24, Re: 3, cx: -7, sz: 4, Luz: -1 },
    { t: 3.05, Lheel: 0, Rheel: 0, hy: 0.93, Rux: -150, Rcz: 14, cx: -3, sx: -1, sz: 2 },
    {
      t: 3.7,
      Rux: -20,
      Ruz: -6,
      Re: 30,
      Rcz: 0,
      Ruy: 4,
      lw: 0,
      cx: 0,
      sx: 0,
      sz: 0,
      Luz: -9,
      Le: 14,
      Rhx: 0,
    },
    { t: 4.2, Rux: 0, Ruz: -9, Re: 14, Ruy: 0, Lux: 0 },
  ]);
  return {
    seconds: DIRECTOR_MOVES.reach.seconds,
    feet: standStill(),
    hipsSmooth: 0,
    channels: t => {
      const c = ch(t);
      c.lx = hand.x;
      c.ly = hand.y;
      c.lz = hand.z;
      return idle(t, c, 0.7);
    },
  };
}

// 7. Look over her left shoulder: the chest twists and the head looks behind her, then back.
function lookBack(): MotionDef {
  const ch = keyed([
    { t: 0, cy: 0, sy: 0, lw: 0, hr: 0, kz: 0, Lux: 0, Le: 14 },
    { t: 0.2, cy: 0, sy: 0, lw: 0 },
    { t: 0.6, cy: 10, sy: 4, lw: 0.4 },
    { t: 1.05, cy: 24, sy: 10, lw: 1, hr: 2.5, kz: -6, Lux: 6, Le: 18 },
    { t: 1.9, cy: 25, sy: 10, lw: 1, hr: 2.5, kz: -6, Lux: 6, Le: 18 },
    { t: 2.8, cy: 0, sy: 0, lw: 0, hr: 0, kz: 0, Lux: 0, Le: 14 },
  ]);
  return {
    seconds: DIRECTOR_MOVES['look-back'].seconds,
    feet: standStill(),
    hipsSmooth: 0,
    channels: t => {
      const c = ch(t);
      // Behind her, over her left shoulder.
      c.lx = 2.2;
      c.ly = 1.5;
      c.lz = -3.2;
      return idle(t, c, 0.7);
    },
  };
}

// 8. Nod.
function nod(): MotionDef {
  const ch = keyed([
    { t: 0, kx: 0, nx: 0 },
    { t: 0.15, kx: 0, nx: 0 },
    { t: 0.45, kx: 15, nx: 4 },
    { t: 0.75, kx: -2, nx: 0 },
    { t: 1.05, kx: 13, nx: 3 },
    { t: 1.45, kx: 0, nx: 0 },
  ]);
  return {
    seconds: DIRECTOR_MOVES.nod.seconds,
    feet: standStill(),
    hipsSmooth: 0,
    channels: t => idle(t, ch(t), 0.6),
  };
}

// 9. Shrug: shoulders up, forearms out, head tilts; then down.
function shrug(): MotionDef {
  const up = { Lcz: 16, Rcz: 16, Le: 62, Re: 62, Luz: 4, Ruz: 4, Luy: 40, Ruy: 40, kz: 6 };
  const ch = keyed([
    { t: 0, Lcz: 0, Rcz: 0, Le: 14, Re: 14, Luz: -9, Ruz: -9, Luy: 0, Ruy: 0, kz: 0 },
    { t: 0.15, Lcz: 0, Rcz: 0 },
    { t: 0.6, ...up },
    { t: 1.1, ...up },
    { t: 1.7, Lcz: 0, Rcz: 0, Le: 14, Re: 14, Luz: -9, Ruz: -9, Luy: 0, Ruy: 0, kz: 0 },
  ]);
  return {
    seconds: DIRECTOR_MOVES.shrug.seconds,
    feet: standStill(),
    hipsSmooth: 0,
    channels: t => idle(t, ch(t), 0.6),
  };
}

// 10. Bow: hinge at the hips, head down, arms hang; then up again.
function bow(): MotionDef {
  const down = { hp: 26, sx: 10, cx: 6, kx: 12, hz: -0.07, Lux: -24, Rux: -24 };
  const ch = keyed([
    { t: 0, hp: 0, sx: 0, cx: 0, kx: 0, hz: 0, Lux: 0, Rux: 0 },
    { t: 0.15, hp: 0, sx: 0, cx: 0, kx: 0, hz: 0 },
    { t: 0.85, ...down },
    { t: 1.35, ...down },
    { t: 2.2, hp: 0, sx: 0, cx: 0, kx: 0, hz: 0, Lux: 0, Rux: 0 },
  ]);
  return {
    seconds: DIRECTOR_MOVES.bow.seconds,
    feet: standStill(),
    hipsSmooth: 0,
    channels: t => idle(t, ch(t), 0.5),
  };
}

const MAKERS: Record<DirectorMoveId, () => MotionDef> = {
  walk,
  turn,
  sit,
  stand,
  wave,
  reach,
  'look-back': lookBack,
  nod,
  shrug,
  bow,
};

const frameCache = new Map<string, PoseRig3dFigure[]>();

/**
 * A move's frames in her own frame (hips over the origin, facing +z at the start), `seconds`
 * long at `fps` — the move's natural timing stretched to fit. Frame i is at i / fps.
 */
export function moveFrames(
  id: DirectorMoveId,
  kind: Rig3dBodyKind,
  seconds: number,
  fps: number
): PoseRig3dFigure[] {
  const length = clampMoveSeconds(id, seconds);
  const count = Math.max(2, Math.round(length * fps) + 1);
  const key = `${id}|${kind}|${count}|${fps}`;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const def = MAKERS[id]();
  const scale = def.seconds / ((count - 1) / fps);
  const times = Array.from({ length: count }, (_, i) => (i / fps) * scale);
  const frames = motionFrames(kind, def, times);
  if (frameCache.size > 64) frameCache.clear();
  frameCache.set(key, frames);
  return frames;
}
