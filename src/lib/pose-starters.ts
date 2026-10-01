/**
 * Starting figures for the joint editor ("Start from: stand / sit / kneel / lie / walk"), mirror
 * and add / remove a person.
 */

import type { NormalizedBody } from '@/lib/pose-library';

export const POSE_STARTERS = [
  { id: 'stand', label: 'Stand' },
  { id: 'sit', label: 'Sit' },
  { id: 'kneel', label: 'Kneel' },
  { id: 'lie', label: 'Lie down' },
  { id: 'walk', label: 'Walk' },
] as const;

export type PoseStarterId = (typeof POSE_STARTERS)[number]['id'];

type XY = readonly [number, number];
/** COCO-18 order: nose, neck, R shoulder/elbow/wrist, L shoulder/elbow/wrist, R hip/knee/ankle,
 *  L hip/knee/ankle, R eye, L eye, R ear, L ear (R = image left for a figure facing the camera). */
type Figure = readonly [XY, XY, XY, XY, XY, XY, XY, XY, XY, XY, XY, XY, XY, XY, XY, XY, XY, XY];

/**
 * Hand-placed starting figures on a 2:3 portrait canvas. (Parsing a scene sentence through the
 * guide planner gave a seated figure for "standing" and a cropped library pose for "walking".)
 */
const STARTERS: Record<PoseStarterId, Figure> = {
  stand: [
    [0.5, 0.12],
    [0.5, 0.2],
    [0.4, 0.21],
    [0.37, 0.34],
    [0.36, 0.46],
    [0.6, 0.21],
    [0.63, 0.34],
    [0.64, 0.46],
    [0.45, 0.48],
    [0.45, 0.67],
    [0.45, 0.86],
    [0.55, 0.48],
    [0.55, 0.67],
    [0.55, 0.86],
    [0.48, 0.11],
    [0.52, 0.11],
    [0.46, 0.12],
    [0.54, 0.12],
  ],
  sit: [
    [0.55, 0.2],
    [0.5, 0.27],
    [0.47, 0.28],
    [0.5, 0.42],
    [0.6, 0.5],
    [0.53, 0.28],
    [0.55, 0.41],
    [0.63, 0.49],
    [0.47, 0.55],
    [0.68, 0.56],
    [0.68, 0.8],
    [0.5, 0.55],
    [0.7, 0.55],
    [0.71, 0.8],
    [0.57, 0.19],
    [0.58, 0.19],
    [0.52, 0.2],
    [0.53, 0.2],
  ],
  kneel: [
    [0.53, 0.27],
    [0.5, 0.34],
    [0.49, 0.35],
    [0.5, 0.48],
    [0.53, 0.58],
    [0.51, 0.35],
    [0.53, 0.48],
    [0.56, 0.57],
    [0.49, 0.6],
    [0.5, 0.82],
    [0.3, 0.85],
    [0.51, 0.6],
    [0.53, 0.82],
    [0.33, 0.85],
    [0.55, 0.26],
    [0.55, 0.26],
    [0.51, 0.27],
    [0.51, 0.27],
  ],
  lie: [
    [0.14, 0.55],
    [0.22, 0.6],
    [0.23, 0.58],
    [0.35, 0.6],
    [0.46, 0.6],
    [0.23, 0.62],
    [0.35, 0.64],
    [0.46, 0.65],
    [0.55, 0.6],
    [0.71, 0.6],
    [0.88, 0.61],
    [0.55, 0.63],
    [0.71, 0.63],
    [0.88, 0.64],
    [0.13, 0.53],
    [0.14, 0.54],
    [0.17, 0.56],
    [0.17, 0.57],
  ],
  walk: [
    [0.52, 0.1],
    [0.5, 0.18],
    [0.43, 0.21],
    [0.4, 0.34],
    [0.36, 0.45],
    [0.58, 0.21],
    [0.62, 0.33],
    [0.66, 0.43],
    [0.47, 0.5],
    [0.44, 0.69],
    [0.35, 0.86],
    [0.53, 0.5],
    [0.6, 0.68],
    [0.65, 0.89],
    [0.51, 0.09],
    [0.54, 0.09],
    [0.49, 0.1],
    [0.55, 0.1],
  ],
};

/** One figure for a starter, normalized to a 2:3 canvas. */
export function poseStarterBody(id: PoseStarterId): NormalizedBody {
  return (STARTERS[id] ?? STARTERS.stand).map(([x, y]) => ({ x, y }));
}

/** COCO-18 left↔right pairs (shoulders, elbows, wrists, hips, knees, ankles, eyes, ears). */
const MIRROR_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [2, 5],
  [3, 6],
  [4, 7],
  [8, 11],
  [9, 12],
  [10, 13],
  [14, 15],
  [16, 17],
];

/** Flip every figure left↔right (joint names swap so the figure's left stays its left). */
export function mirrorBodies(bodies: NormalizedBody[]): NormalizedBody[] {
  return bodies.map(body => {
    const flipped = body.map(p => (p ? { x: 1 - p.x, y: p.y } : null));
    const out = [...flipped];
    for (const [a, b] of MIRROR_PAIRS) {
      out[a] = flipped[b] ?? null;
      out[b] = flipped[a] ?? null;
    }
    return out;
  });
}

/** Shift a figure sideways, kept inside the frame. */
export function shiftBody(body: NormalizedBody, dx: number): NormalizedBody {
  return body.map(p => (p ? { x: Math.min(0.98, Math.max(0.02, p.x + dx)), y: p.y } : null));
}

/** Add a standing second person beside the first (max 2 for the editor). */
export function addPerson(bodies: NormalizedBody[]): NormalizedBody[] {
  if (bodies.length >= 2) return bodies;
  const lead = bodies[0] ?? poseStarterBody('stand');
  return [shiftBody(lead, -0.18), shiftBody(poseStarterBody('stand'), 0.18)];
}

export function removePerson(bodies: NormalizedBody[]): NormalizedBody[] {
  return bodies.length > 1 ? [shiftBody(bodies[0]!, 0)] : bodies;
}

/**
 * A few words for a dragged skeleton ("seated", "kneeling, one arm raised"), read from where the
 * joints sit — the try-on prompt can lead with the pose instead of only pointing at Image 3.
 */
export function describePoseBody(body: NormalizedBody): string {
  const at = (i: number) => body[i] ?? null;
  const neck = at(1);
  const hips = [at(8), at(11)].filter(Boolean) as Array<{ x: number; y: number }>;
  const knees = [at(9), at(12)].filter(Boolean) as Array<{ x: number; y: number }>;
  const ankles = [at(10), at(13)].filter(Boolean) as Array<{ x: number; y: number }>;
  const wrists = [at(4), at(7)].filter(Boolean) as Array<{ x: number; y: number }>;
  const head = at(0);
  if (!neck || hips.length === 0) return 'in the pose shown';
  const avg = (points: Array<{ x: number; y: number }>) => ({
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  });
  const hip = avg(hips);
  const torsoDx = Math.abs(hip.x - neck.x);
  const torsoDy = Math.abs(hip.y - neck.y);
  let stance: string;
  if (torsoDx > torsoDy * 1.3) {
    stance = 'lying down';
  } else if (knees.length && ankles.length) {
    const knee = avg(knees);
    const ankle = avg(ankles);
    const thigh = Math.abs(knee.y - hip.y);
    const shinDrop = ankle.y - knee.y;
    if (thigh < torsoDy * 0.45 && shinDrop > torsoDy * 0.5) stance = 'seated';
    else if (shinDrop < torsoDy * 0.3 && knee.y > hip.y) stance = 'kneeling';
    else if (Math.abs((ankles[0]?.x ?? 0) - (ankles[1]?.x ?? 0)) > torsoDy * 0.6)
      stance = 'walking mid-stride';
    else stance = 'standing';
  } else {
    stance = 'standing';
  }
  const raised = head ? wrists.filter(w => w.y < head.y).length : 0;
  const arms = raised === 2 ? ', both arms raised' : raised === 1 ? ', one arm raised' : '';
  return `${stance}${arms}`;
}

const STANCE_DETAIL: Record<string, string> = {
  seated: 'hips on a seat, knees bent forward, lower legs down',
  kneeling: 'upright on both knees',
  'lying down': 'lying flat along the floor or bed',
  'walking mid-stride': 'one foot forward mid-step',
  standing: 'weight on both feet',
};

/**
 * Opening line for a custom-pose try-on: the stance in words, then "as the pose map shows".
 * Live (Outfit, 3 seeds): the pose line at the end of the prompt left him standing 3/3; this as
 * the first line seated him 3/3 with the kit and face kept.
 */
export function poseFirstLine(body: NormalizedBody, pronoun: 'she' | 'he' = 'she'): string {
  const description = describePoseBody(body);
  const stance = description.split(',')[0]!;
  const detail = STANCE_DETAIL[stance];
  return `POSE FIRST: ${pronoun} is ${description}, exactly as the pose map in Image 3 shows${detail ? ` — ${detail}` : ''}.`;
}
