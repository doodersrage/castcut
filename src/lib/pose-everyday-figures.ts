/**
 * Hand-placed stick figures for the everyday, duo and gym/skate pose-guide layouts.
 *
 * Joints are x, y as 0–1 of the 512×768 guide canvas (y down). Standing figures keep the house
 * proportions (head ≈0.1, shoulders ≈0.21, pelvis ≈0.5, knees ≈0.7, ankles ≈0.9); horizontal
 * bodies are drawn shorter so they fit the portrait canvas, like the existing lying figures.
 * Every figure gets a little seeded jitter, and asymmetric solo figures mirror by seed, so the
 * same layout doesn't draw an identical mannequin each time.
 */

import type { PoseGuideBase, SocialLayout, StickSkeleton } from '@/lib/day-pose-guide';

type Point = { x: number; y: number };
type Joint = readonly [number, number];
type JointName = Exclude<keyof StickSkeleton, 'facing'>;
export type JointSpec = Record<JointName, Joint>;

const JOINTS: readonly JointName[] = [
  'head',
  'neck',
  'pelvis',
  'lShoulder',
  'rShoulder',
  'lElbow',
  'rElbow',
  'lWrist',
  'rWrist',
  'lHip',
  'rHip',
  'lKnee',
  'rKnee',
  'lAnkle',
  'rAnkle',
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPoint(x: number, y: number): Point {
  return { x: clamp(x, 0.04, 0.96), y: clamp(y, 0.06, 0.94) };
}

function unit(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** A figure from hand-placed joints, shifted by `dx`, with ±1% seeded jitter per joint. */
export function jointFigure(spec: JointSpec, seed: number, salt = 0, dx = 0): StickSkeleton {
  const figure = {} as StickSkeleton;
  JOINTS.forEach((name, index) => {
    const [x, y] = spec[name];
    const jx = (unit(seed, salt * 64 + index * 2) - 0.5) * 0.02;
    const jy = (unit(seed, salt * 64 + index * 2 + 1) - 0.5) * 0.02;
    (figure as Record<JointName, Point>)[name] = toPoint(x + dx + jx, y + jy);
  });
  return figure;
}

/** Mirror left↔right around `cx` (joint names swap so left stays the figure's left). */
export function mirrorFigure(figure: StickSkeleton, cx = 0.5): StickSkeleton {
  const flip = (p: Point) => toPoint(cx * 2 - p.x, p.y);
  return {
    head: flip(figure.head),
    neck: flip(figure.neck),
    pelvis: flip(figure.pelvis),
    lShoulder: flip(figure.rShoulder),
    rShoulder: flip(figure.lShoulder),
    lElbow: flip(figure.rElbow),
    rElbow: flip(figure.lElbow),
    lWrist: flip(figure.rWrist),
    rWrist: flip(figure.lWrist),
    lHip: flip(figure.rHip),
    rHip: flip(figure.lHip),
    lKnee: flip(figure.rKnee),
    rKnee: flip(figure.lKnee),
    lAnkle: flip(figure.rAnkle),
    rAnkle: flip(figure.lAnkle),
  };
}

function maybeMirror(figure: StickSkeleton, seed: number): StickSkeleton {
  return unit(seed, 997) > 0.5 ? mirrorFigure(figure) : figure;
}

/** Standing legs shared by the upright gesture figures (weight on one hip, feet apart). */
const STANDING_LEGS = {
  pelvis: [0.49, 0.5],
  lHip: [0.43, 0.5],
  rHip: [0.55, 0.5],
  lKnee: [0.4, 0.7],
  rKnee: [0.6, 0.69],
  lAnkle: [0.37, 0.9],
  rAnkle: [0.64, 0.88],
} as const satisfies Partial<JointSpec>;

/** Seated legs (hips on a seat, thighs toward camera, feet on the floor). */
const SEATED_LEGS = {
  pelvis: [0.5, 0.72],
  lHip: [0.44, 0.72],
  rHip: [0.56, 0.72],
  lKnee: [0.42, 0.74],
  rKnee: [0.62, 0.72],
  lAnkle: [0.4, 0.92],
  rAnkle: [0.64, 0.9],
} as const satisfies Partial<JointSpec>;

/** Solo everyday figures, plus proper solo drawings for gestures that used to fall through. */
const SOLO_SPECS: Partial<Record<SocialLayout, JointSpec>> = {
  // Floor, cross-legged: knees wide and low, ankles crossed in front, hands in the lap.
  sit_floor: {
    head: [0.5, 0.36],
    neck: [0.5, 0.44],
    lShoulder: [0.38, 0.46],
    rShoulder: [0.62, 0.46],
    lElbow: [0.34, 0.58],
    rElbow: [0.66, 0.58],
    lWrist: [0.44, 0.66],
    rWrist: [0.56, 0.66],
    pelvis: [0.5, 0.76],
    lHip: [0.44, 0.76],
    rHip: [0.56, 0.76],
    lKnee: [0.26, 0.82],
    rKnee: [0.74, 0.82],
    lAnkle: [0.56, 0.88],
    rAnkle: [0.44, 0.88],
  },
  // Lounging back on both elbows (side view): forearms flat, one knee up.
  lounge_elbows: {
    head: [0.18, 0.54],
    neck: [0.24, 0.58],
    lShoulder: [0.25, 0.6],
    rShoulder: [0.27, 0.62],
    lElbow: [0.2, 0.7],
    rElbow: [0.22, 0.71],
    lWrist: [0.3, 0.72],
    rWrist: [0.32, 0.73],
    pelvis: [0.52, 0.72],
    lHip: [0.51, 0.71],
    rHip: [0.53, 0.73],
    lKnee: [0.68, 0.56],
    rKnee: [0.7, 0.7],
    lAnkle: [0.82, 0.7],
    rAnkle: [0.9, 0.72],
  },
  // On the stomach, propped on forearms, feet kicked up behind.
  lie_front: {
    head: [0.16, 0.52],
    neck: [0.22, 0.58],
    lShoulder: [0.24, 0.6],
    rShoulder: [0.26, 0.62],
    lElbow: [0.24, 0.72],
    rElbow: [0.27, 0.73],
    lWrist: [0.12, 0.72],
    rWrist: [0.15, 0.73],
    pelvis: [0.54, 0.7],
    lHip: [0.53, 0.69],
    rHip: [0.55, 0.71],
    lKnee: [0.72, 0.72],
    rKnee: [0.74, 0.73],
    lAnkle: [0.8, 0.56],
    rAnkle: [0.84, 0.58],
  },
  // On one side, head propped on the lower hand, top arm along the hip, knees soft.
  lie_side: {
    head: [0.2, 0.54],
    neck: [0.26, 0.6],
    lShoulder: [0.27, 0.62],
    rShoulder: [0.29, 0.6],
    lElbow: [0.18, 0.74],
    rElbow: [0.4, 0.62],
    lWrist: [0.17, 0.58],
    rWrist: [0.52, 0.64],
    pelvis: [0.56, 0.7],
    lHip: [0.55, 0.68],
    rHip: [0.57, 0.72],
    lKnee: [0.72, 0.76],
    rKnee: [0.7, 0.7],
    lAnkle: [0.88, 0.76],
    rAnkle: [0.86, 0.72],
  },
  // Perched on a counter / wall edge, side view: thighs level out over the edge, shins hanging,
  // hands on the edge by the hips. (Front-on, a perch reads as a short standing figure.)
  perch_edge: {
    head: [0.48, 0.2],
    neck: [0.47, 0.28],
    lShoulder: [0.45, 0.3],
    rShoulder: [0.49, 0.31],
    lElbow: [0.42, 0.44],
    rElbow: [0.46, 0.45],
    lWrist: [0.4, 0.58],
    rWrist: [0.44, 0.59],
    pelvis: [0.46, 0.58],
    lHip: [0.45, 0.57],
    rHip: [0.47, 0.59],
    lKnee: [0.64, 0.58],
    rKnee: [0.66, 0.6],
    lAnkle: [0.62, 0.8],
    rAnkle: [0.68, 0.78],
  },
  hands_behind_head: {
    head: [0.5, 0.1],
    neck: [0.5, 0.18],
    lShoulder: [0.36, 0.21],
    rShoulder: [0.64, 0.21],
    lElbow: [0.22, 0.12],
    rElbow: [0.78, 0.12],
    lWrist: [0.44, 0.07],
    rWrist: [0.56, 0.07],
    ...STANDING_LEGS,
  },
  // Celebration: both arms thrown up in a V.
  arms_up: {
    head: [0.5, 0.12],
    neck: [0.5, 0.2],
    lShoulder: [0.36, 0.22],
    rShoulder: [0.64, 0.22],
    lElbow: [0.26, 0.1],
    rElbow: [0.74, 0.1],
    lWrist: [0.2, 0.06],
    rWrist: [0.8, 0.06],
    pelvis: [0.5, 0.5],
    lHip: [0.44, 0.5],
    rHip: [0.56, 0.5],
    lKnee: [0.4, 0.7],
    rKnee: [0.6, 0.7],
    lAnkle: [0.36, 0.9],
    rAnkle: [0.64, 0.9],
  },
  // Selfie: phone arm up and out, head tilted toward it, free hand on the hip.
  selfie: {
    head: [0.46, 0.11],
    neck: [0.48, 0.19],
    lShoulder: [0.36, 0.22],
    rShoulder: [0.62, 0.21],
    lElbow: [0.3, 0.36],
    rElbow: [0.74, 0.14],
    lWrist: [0.4, 0.46],
    rWrist: [0.86, 0.08],
    ...STANDING_LEGS,
  },
  // Camera to the eye: both hands at the face, elbows out, staggered stance.
  photograph: {
    head: [0.5, 0.11],
    neck: [0.5, 0.19],
    lShoulder: [0.37, 0.22],
    rShoulder: [0.63, 0.22],
    lElbow: [0.28, 0.26],
    rElbow: [0.7, 0.24],
    lWrist: [0.44, 0.13],
    rWrist: [0.57, 0.12],
    pelvis: [0.49, 0.5],
    lHip: [0.43, 0.5],
    rHip: [0.55, 0.5],
    lKnee: [0.38, 0.7],
    rKnee: [0.6, 0.68],
    lAnkle: [0.32, 0.9],
    rAnkle: [0.64, 0.88],
  },
  // At the counter / stove: slight forward lean, hands at counter height, head down.
  cook: {
    head: [0.53, 0.13],
    neck: [0.51, 0.2],
    lShoulder: [0.38, 0.23],
    rShoulder: [0.63, 0.22],
    lElbow: [0.36, 0.36],
    rElbow: [0.66, 0.34],
    lWrist: [0.46, 0.44],
    rWrist: [0.62, 0.42],
    pelvis: [0.48, 0.5],
    lHip: [0.42, 0.5],
    rHip: [0.54, 0.5],
    lKnee: [0.42, 0.7],
    rKnee: [0.56, 0.7],
    lAnkle: [0.41, 0.9],
    rAnkle: [0.58, 0.9],
  },
  // Seated at a laptop: forearms forward to the keys, head a little down.
  laptop: {
    head: [0.5, 0.29],
    neck: [0.5, 0.37],
    lShoulder: [0.38, 0.4],
    rShoulder: [0.62, 0.4],
    lElbow: [0.36, 0.52],
    rElbow: [0.64, 0.52],
    lWrist: [0.45, 0.56],
    rWrist: [0.55, 0.56],
    ...SEATED_LEGS,
  },
  // Hands on hips, elbows out.
  hands_hips: {
    head: [0.5, 0.1],
    neck: [0.5, 0.18],
    lShoulder: [0.36, 0.21],
    rShoulder: [0.64, 0.21],
    lElbow: [0.24, 0.34],
    rElbow: [0.76, 0.34],
    lWrist: [0.4, 0.48],
    rWrist: [0.6, 0.48],
    ...STANDING_LEGS,
  },
  // Bent forward at the hips reaching to the floor (side view), other hand on the knee.
  bend_pick: {
    head: [0.72, 0.5],
    neck: [0.66, 0.44],
    lShoulder: [0.64, 0.43],
    rShoulder: [0.66, 0.46],
    lElbow: [0.56, 0.56],
    rElbow: [0.68, 0.6],
    lWrist: [0.5, 0.64],
    rWrist: [0.7, 0.76],
    pelvis: [0.4, 0.5],
    lHip: [0.38, 0.49],
    rHip: [0.42, 0.51],
    lKnee: [0.44, 0.7],
    rKnee: [0.48, 0.71],
    lAnkle: [0.42, 0.9],
    rAnkle: [0.5, 0.9],
  },
  // One foot up on a step, leaning over it with both hands at the raised foot.
  foot_up: {
    head: [0.61, 0.17],
    neck: [0.56, 0.24],
    lShoulder: [0.5, 0.27],
    rShoulder: [0.62, 0.25],
    lElbow: [0.54, 0.4],
    rElbow: [0.68, 0.4],
    lWrist: [0.62, 0.56],
    rWrist: [0.68, 0.56],
    pelvis: [0.44, 0.52],
    lHip: [0.42, 0.52],
    rHip: [0.46, 0.53],
    lKnee: [0.42, 0.72],
    rKnee: [0.62, 0.56],
    lAnkle: [0.41, 0.92],
    rAnkle: [0.66, 0.72],
  },
  // Shoulder on the wall, feet out and crossed, mug in one hand.
  lean_wall: {
    head: [0.6, 0.11],
    neck: [0.58, 0.19],
    lShoulder: [0.46, 0.22],
    rShoulder: [0.7, 0.21],
    lElbow: [0.42, 0.36],
    rElbow: [0.7, 0.36],
    lWrist: [0.52, 0.34],
    rWrist: [0.64, 0.48],
    pelvis: [0.5, 0.5],
    lHip: [0.44, 0.5],
    rHip: [0.56, 0.5],
    lKnee: [0.4, 0.7],
    rKnee: [0.48, 0.7],
    lAnkle: [0.34, 0.9],
    rAnkle: [0.42, 0.9],
  },
  // One hand at the hair behind the ear, weight on one hip.
  hair_touch: {
    head: [0.5, 0.1],
    neck: [0.5, 0.18],
    lShoulder: [0.37, 0.21],
    rShoulder: [0.63, 0.21],
    lElbow: [0.3, 0.14],
    rElbow: [0.66, 0.34],
    lWrist: [0.44, 0.08],
    rWrist: [0.64, 0.48],
    pelvis: [0.49, 0.5],
    lHip: [0.43, 0.5],
    rHip: [0.55, 0.5],
    lKnee: [0.42, 0.7],
    rKnee: [0.6, 0.69],
    lAnkle: [0.4, 0.9],
    rAnkle: [0.62, 0.88],
  },
  // Shrug: shoulders up, elbows in, forearms out palms up, head tilted.
  shrug: {
    head: [0.52, 0.1],
    neck: [0.5, 0.17],
    lShoulder: [0.37, 0.18],
    rShoulder: [0.63, 0.18],
    lElbow: [0.32, 0.33],
    rElbow: [0.68, 0.33],
    lWrist: [0.18, 0.3],
    rWrist: [0.82, 0.3],
    ...STANDING_LEGS,
  },
  // Walking up stairs: front foot a step higher, hand on the banister.
  stairs: {
    head: [0.55, 0.12],
    neck: [0.52, 0.2],
    lShoulder: [0.42, 0.23],
    rShoulder: [0.62, 0.22],
    lElbow: [0.38, 0.36],
    rElbow: [0.72, 0.34],
    lWrist: [0.46, 0.4],
    rWrist: [0.8, 0.38],
    pelvis: [0.46, 0.5],
    lHip: [0.44, 0.5],
    rHip: [0.48, 0.5],
    lKnee: [0.42, 0.72],
    rKnee: [0.6, 0.56],
    lAnkle: [0.34, 0.9],
    rAnkle: [0.62, 0.72],
  },
};

/** Lying back with hands behind the head (side view) — "lying on the grass, arms behind head". */
const HANDS_BEHIND_HEAD_LYING: JointSpec = {
  head: [0.18, 0.6],
  neck: [0.24, 0.62],
  lShoulder: [0.26, 0.6],
  rShoulder: [0.27, 0.64],
  lElbow: [0.18, 0.5],
  rElbow: [0.2, 0.52],
  lWrist: [0.14, 0.62],
  rWrist: [0.15, 0.63],
  pelvis: [0.54, 0.64],
  lHip: [0.53, 0.63],
  rHip: [0.55, 0.65],
  lKnee: [0.68, 0.5],
  rKnee: [0.72, 0.65],
  lAnkle: [0.8, 0.64],
  rAnkle: [0.9, 0.66],
};

const EAT_SEATED: JointSpec = {
  head: [0.5, 0.29],
  neck: [0.5, 0.37],
  lShoulder: [0.38, 0.4],
  rShoulder: [0.62, 0.4],
  lElbow: [0.35, 0.52],
  rElbow: [0.64, 0.5],
  lWrist: [0.44, 0.58],
  rWrist: [0.54, 0.33],
  ...SEATED_LEGS,
};

const EAT_STANDING: JointSpec = {
  head: [0.5, 0.11],
  neck: [0.5, 0.19],
  lShoulder: [0.37, 0.22],
  rShoulder: [0.63, 0.22],
  lElbow: [0.36, 0.36],
  rElbow: [0.64, 0.32],
  lWrist: [0.44, 0.42],
  rWrist: [0.54, 0.14],
  ...STANDING_LEGS,
};

/** Gym and skate figures (solo sport layouts). */
const SPORT_SPECS: Partial<Record<SocialLayout, JointSpec>> = {
  // Barbell back squat, side view: thighs parallel, torso ~30° forward, hands on the bar.
  sport_squat: {
    head: [0.63, 0.33],
    neck: [0.6, 0.4],
    lShoulder: [0.58, 0.41],
    rShoulder: [0.62, 0.42],
    lElbow: [0.5, 0.46],
    rElbow: [0.54, 0.47],
    lWrist: [0.58, 0.38],
    rWrist: [0.62, 0.39],
    pelvis: [0.36, 0.68],
    lHip: [0.34, 0.67],
    rHip: [0.38, 0.69],
    lKnee: [0.66, 0.66],
    rKnee: [0.68, 0.68],
    lAnkle: [0.62, 0.88],
    rAnkle: [0.64, 0.9],
  },
  // Deadlift, side view: hip hinge, soft knees, arms hanging straight to the bar.
  sport_deadlift: {
    head: [0.79, 0.26],
    neck: [0.71, 0.29],
    lShoulder: [0.69, 0.3],
    rShoulder: [0.71, 0.32],
    lElbow: [0.69, 0.42],
    rElbow: [0.71, 0.44],
    lWrist: [0.68, 0.54],
    rWrist: [0.7, 0.56],
    pelvis: [0.34, 0.5],
    lHip: [0.32, 0.49],
    rHip: [0.36, 0.51],
    lKnee: [0.44, 0.7],
    rKnee: [0.46, 0.71],
    lAnkle: [0.42, 0.9],
    rAnkle: [0.44, 0.91],
  },
  // Push-up top position: arms straight under the shoulders, body a straight diagonal.
  sport_pushup: {
    head: [0.14, 0.6],
    neck: [0.2, 0.63],
    lShoulder: [0.22, 0.64],
    rShoulder: [0.24, 0.66],
    lElbow: [0.22, 0.72],
    rElbow: [0.24, 0.73],
    lWrist: [0.22, 0.79],
    rWrist: [0.24, 0.8],
    pelvis: [0.52, 0.7],
    lHip: [0.51, 0.69],
    rHip: [0.53, 0.71],
    lKnee: [0.7, 0.74],
    rKnee: [0.72, 0.75],
    lAnkle: [0.88, 0.79],
    rAnkle: [0.9, 0.8],
  },
  // Forearm plank: elbows on the floor under the shoulders, body straight.
  sport_plank: {
    head: [0.16, 0.67],
    neck: [0.22, 0.69],
    lShoulder: [0.24, 0.7],
    rShoulder: [0.26, 0.71],
    lElbow: [0.24, 0.8],
    rElbow: [0.26, 0.8],
    lWrist: [0.14, 0.8],
    rWrist: [0.16, 0.81],
    pelvis: [0.52, 0.73],
    lHip: [0.51, 0.72],
    rHip: [0.53, 0.74],
    lKnee: [0.7, 0.76],
    rKnee: [0.72, 0.77],
    lAnkle: [0.88, 0.8],
    rAnkle: [0.9, 0.81],
  },
  // Pull-up: hands on the bar overhead, elbows bent out, chin at the bar, feet off the floor.
  sport_pullup: {
    head: [0.5, 0.12],
    neck: [0.5, 0.2],
    lShoulder: [0.38, 0.22],
    rShoulder: [0.62, 0.22],
    lElbow: [0.24, 0.2],
    rElbow: [0.76, 0.2],
    lWrist: [0.3, 0.07],
    rWrist: [0.7, 0.07],
    pelvis: [0.5, 0.5],
    lHip: [0.44, 0.5],
    rHip: [0.56, 0.5],
    lKnee: [0.45, 0.68],
    rKnee: [0.55, 0.68],
    lAnkle: [0.53, 0.82],
    rAnkle: [0.47, 0.84],
  },
  // Skateboard cruise: sideways stance on the board, knees bent, arms out for balance.
  sport_skate: {
    head: [0.52, 0.16],
    neck: [0.5, 0.24],
    lShoulder: [0.38, 0.27],
    rShoulder: [0.62, 0.27],
    lElbow: [0.26, 0.34],
    rElbow: [0.74, 0.3],
    lWrist: [0.14, 0.38],
    rWrist: [0.86, 0.3],
    pelvis: [0.49, 0.56],
    lHip: [0.44, 0.56],
    rHip: [0.54, 0.56],
    lKnee: [0.34, 0.72],
    rKnee: [0.62, 0.7],
    lAnkle: [0.3, 0.88],
    rAnkle: [0.66, 0.88],
  },
};

/** Gym / skate figure, or null for the sports drawn elsewhere. */
export function sportFigure(layout: SocialLayout, seed: number): StickSkeleton | null {
  const spec = SPORT_SPECS[layout];
  return spec ? maybeMirror(jointFigure(spec, seed, 5), seed) : null;
}

// ----- Duo -----

/** A standing figure in profile facing right (for pairs that face each other). */
const FACING_RIGHT_STANDING: JointSpec = {
  head: [0.3, 0.12],
  neck: [0.3, 0.2],
  lShoulder: [0.22, 0.23],
  rShoulder: [0.38, 0.23],
  lElbow: [0.2, 0.36],
  rElbow: [0.4, 0.36],
  lWrist: [0.22, 0.48],
  rWrist: [0.42, 0.46],
  pelvis: [0.3, 0.5],
  lHip: [0.27, 0.5],
  rHip: [0.33, 0.5],
  lKnee: [0.26, 0.7],
  rKnee: [0.36, 0.69],
  lAnkle: [0.22, 0.9],
  rAnkle: [0.4, 0.88],
};

const FACING_RIGHT_SEATED: JointSpec = {
  head: [0.3, 0.3],
  neck: [0.3, 0.38],
  lShoulder: [0.22, 0.4],
  rShoulder: [0.38, 0.4],
  lElbow: [0.22, 0.52],
  rElbow: [0.42, 0.44],
  lWrist: [0.28, 0.58],
  rWrist: [0.49, 0.36],
  pelvis: [0.3, 0.72],
  lHip: [0.27, 0.72],
  rHip: [0.33, 0.72],
  lKnee: [0.4, 0.72],
  rKnee: [0.42, 0.74],
  lAnkle: [0.4, 0.92],
  rAnkle: [0.42, 0.93],
};

/** Front-facing walking figure centred at 0.5 (shifted into place for side-by-side pairs). */
const WALKING_FRONT: JointSpec = {
  head: [0.5, 0.1],
  neck: [0.5, 0.18],
  lShoulder: [0.37, 0.21],
  rShoulder: [0.63, 0.21],
  lElbow: [0.33, 0.34],
  rElbow: [0.67, 0.34],
  lWrist: [0.34, 0.46],
  rWrist: [0.66, 0.46],
  pelvis: [0.5, 0.5],
  lHip: [0.44, 0.5],
  rHip: [0.56, 0.5],
  lKnee: [0.4, 0.7],
  rKnee: [0.6, 0.68],
  lAnkle: [0.36, 0.9],
  rAnkle: [0.66, 0.86],
};

function set(figure: StickSkeleton, joints: Partial<JointSpec>): StickSkeleton {
  for (const [name, joint] of Object.entries(joints) as Array<[JointName, Joint]>) {
    figure[name] = toPoint(joint[0], joint[1]);
  }
  return figure;
}

/** Lead (Cast) first, partner second. */
function duoFigures(layout: SocialLayout, seed: number, seated: boolean): StickSkeleton[] | null {
  switch (layout) {
    case 'hold_hands': {
      // Walking side by side, inner hands joined between them.
      const lead = set(jointFigure(WALKING_FRONT, seed, 1, -0.17), {
        rElbow: [0.47, 0.36],
        rWrist: [0.5, 0.48],
      });
      const partner = set(jointFigure(WALKING_FRONT, seed, 2, 0.17), {
        lElbow: [0.53, 0.36],
        lWrist: [0.5, 0.48],
      });
      return [lead, partner];
    }
    case 'piggyback': {
      // Cast riding on the partner's back: arms over the shoulders, legs round the waist.
      const rider = jointFigure(
        {
          head: [0.46, 0.07],
          neck: [0.48, 0.13],
          lShoulder: [0.38, 0.15],
          rShoulder: [0.6, 0.15],
          lElbow: [0.36, 0.26],
          rElbow: [0.66, 0.25],
          lWrist: [0.46, 0.31],
          rWrist: [0.58, 0.31],
          pelvis: [0.5, 0.42],
          lHip: [0.44, 0.42],
          rHip: [0.56, 0.42],
          lKnee: [0.28, 0.48],
          rKnee: [0.74, 0.48],
          lAnkle: [0.32, 0.62],
          rAnkle: [0.7, 0.62],
        },
        seed,
        1
      );
      const carrier = jointFigure(
        {
          head: [0.53, 0.2],
          neck: [0.53, 0.27],
          lShoulder: [0.41, 0.3],
          rShoulder: [0.65, 0.3],
          lElbow: [0.3, 0.42],
          rElbow: [0.76, 0.42],
          lWrist: [0.3, 0.49],
          rWrist: [0.74, 0.49],
          pelvis: [0.53, 0.58],
          lHip: [0.47, 0.58],
          rHip: [0.59, 0.58],
          lKnee: [0.45, 0.76],
          rKnee: [0.61, 0.76],
          lAnkle: [0.43, 0.93],
          rAnkle: [0.63, 0.93],
        },
        seed,
        2
      );
      return [rider, carrier];
    }
    case 'high_five': {
      // Facing each other, raised hands meeting overhead in the middle.
      const lead = set(jointFigure(FACING_RIGHT_STANDING, seed, 1), {
        rElbow: [0.42, 0.14],
        rWrist: [0.5, 0.07],
      });
      return [
        lead,
        mirrorFigure(
          set(jointFigure(FACING_RIGHT_STANDING, seed, 2), {
            rElbow: [0.42, 0.14],
            rWrist: [0.5, 0.07],
          })
        ),
      ];
    }
    case 'toast': {
      // Facing each other, glasses meeting between them (standing or across a table).
      const base = seated ? FACING_RIGHT_SEATED : FACING_RIGHT_STANDING;
      const raise: Partial<JointSpec> = seated ? {} : { rElbow: [0.42, 0.3], rWrist: [0.49, 0.22] };
      return [
        set(jointFigure(base, seed, 1), raise),
        mirrorFigure(set(jointFigure(base, seed, 2), raise)),
      ];
    }
    case 'head_shoulder': {
      // Side by side, Cast's head resting on the partner's shoulder.
      // Standing: raise the upper bodies to standing height (legs are replaced below).
      const lift = (spec: JointSpec): JointSpec => {
        const out = {} as Record<JointName, Joint>;
        for (const name of JOINTS) {
          out[name] = [spec[name][0], spec[name][1] - 0.18];
        }
        return out;
      };
      const partnerSpec: JointSpec = {
        head: [0.62, 0.29],
        neck: [0.62, 0.37],
        lShoulder: [0.51, 0.4],
        rShoulder: [0.73, 0.4],
        lElbow: [0.49, 0.52],
        rElbow: [0.75, 0.52],
        lWrist: [0.55, 0.6],
        rWrist: [0.7, 0.6],
        pelvis: [0.62, 0.72],
        lHip: [0.57, 0.72],
        rHip: [0.67, 0.72],
        lKnee: [0.56, 0.74],
        rKnee: [0.7, 0.74],
        lAnkle: [0.55, 0.92],
        rAnkle: [0.71, 0.92],
      };
      const leadSpec: JointSpec = {
        head: [0.47, 0.35],
        neck: [0.41, 0.39],
        lShoulder: [0.3, 0.42],
        rShoulder: [0.5, 0.41],
        lElbow: [0.28, 0.54],
        rElbow: [0.48, 0.52],
        lWrist: [0.34, 0.62],
        rWrist: [0.5, 0.6],
        pelvis: [0.38, 0.72],
        lHip: [0.33, 0.72],
        rHip: [0.43, 0.72],
        lKnee: [0.32, 0.74],
        rKnee: [0.46, 0.74],
        lAnkle: [0.31, 0.92],
        rAnkle: [0.47, 0.92],
      };
      if (seated) {
        return [jointFigure(leadSpec, seed, 1), jointFigure(partnerSpec, seed, 2)];
      }
      // Standing: same upper bodies raised to standing height over standing legs.
      const standLegs = (cx: number): Partial<JointSpec> => ({
        pelvis: [cx, 0.5],
        lHip: [cx - 0.05, 0.5],
        rHip: [cx + 0.05, 0.5],
        lKnee: [cx - 0.06, 0.7],
        rKnee: [cx + 0.06, 0.7],
        lAnkle: [cx - 0.07, 0.9],
        rAnkle: [cx + 0.07, 0.9],
      });
      return [
        set(jointFigure(lift(leadSpec), seed, 1), standLegs(0.38)),
        set(jointFigure(lift(partnerSpec), seed, 2), standLegs(0.62)),
      ];
    }
    case 'selfie_duo': {
      // Heads together; Cast holds the phone out, the friend's arm round Cast's shoulders.
      const lead = jointFigure(
        {
          head: [0.42, 0.12],
          neck: [0.42, 0.2],
          lShoulder: [0.3, 0.23],
          rShoulder: [0.54, 0.23],
          lElbow: [0.2, 0.16],
          rElbow: [0.54, 0.36],
          lWrist: [0.1, 0.09],
          rWrist: [0.58, 0.44],
          pelvis: [0.42, 0.52],
          lHip: [0.37, 0.52],
          rHip: [0.47, 0.52],
          lKnee: [0.36, 0.72],
          rKnee: [0.48, 0.71],
          lAnkle: [0.34, 0.91],
          rAnkle: [0.5, 0.9],
        },
        seed,
        1
      );
      const friend = jointFigure(
        {
          head: [0.56, 0.13],
          neck: [0.6, 0.21],
          lShoulder: [0.5, 0.25],
          rShoulder: [0.72, 0.24],
          lElbow: [0.44, 0.3],
          rElbow: [0.76, 0.36],
          lWrist: [0.34, 0.24],
          rWrist: [0.72, 0.48],
          pelvis: [0.62, 0.52],
          lHip: [0.57, 0.52],
          rHip: [0.67, 0.52],
          lKnee: [0.56, 0.72],
          rKnee: [0.68, 0.71],
          lAnkle: [0.55, 0.91],
          rAnkle: [0.7, 0.9],
        },
        seed,
        2
      );
      return [lead, friend];
    }
    default:
      return null;
  }
}

/** With one person allowed, what a two-person layout draws instead. */
const DUO_SOLO_FALLBACK: Partial<Record<SocialLayout, SocialLayout | PoseGuideBase>> = {
  hold_hands: 'walk',
  piggyback: 'stand',
  high_five: 'wave',
  toast: 'drink',
  head_shoulder: 'sit',
  selfie_duo: 'selfie',
};

export function duoSoloFallback(layout: SocialLayout): SocialLayout | PoseGuideBase | null {
  return DUO_SOLO_FALLBACK[layout] ?? null;
}

export function isEverydayDuoLayout(layout: SocialLayout): boolean {
  return layout in DUO_SOLO_FALLBACK;
}

/**
 * Figures for an everyday layout drawn here, or null when another branch owns it. Duo layouts
 * return two figures (plus a third bystander for trios via `companion`); solo layouts return one,
 * plus `companion()` when the scene has more people.
 */
export function everydayFigures(input: {
  layout: SocialLayout;
  people: number;
  seed: number;
  base: PoseGuideBase;
  companion: () => StickSkeleton;
}): StickSkeleton[] | null {
  const { layout, people, seed, base, companion } = input;
  const seated = base === 'sit';
  const withCompanion = (figure: StickSkeleton): StickSkeleton[] =>
    people >= 2 ? [figure, companion()] : [figure];

  if (isEverydayDuoLayout(layout)) {
    const pair = people >= 2 ? duoFigures(layout, seed, seated) : null;
    if (!pair) return null;
    return people >= 3 ? [...pair, companion()] : pair;
  }
  if (layout === 'hands_behind_head' && base === 'lie') {
    return withCompanion(maybeMirror(jointFigure(HANDS_BEHIND_HEAD_LYING, seed, 3), seed));
  }
  if (layout === 'eat') {
    return withCompanion(
      maybeMirror(jointFigure(seated ? EAT_SEATED : EAT_STANDING, seed, 3), seed)
    );
  }
  const spec = SOLO_SPECS[layout];
  if (!spec) return null;
  return withCompanion(maybeMirror(jointFigure(spec, seed, 3), seed));
}
