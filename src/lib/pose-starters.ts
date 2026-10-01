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

type Pt = { x: number; y: number };

/**
 * A dragged skeleton in words ("seated", "standing on her right leg, her left leg kicked up high
 * out to the side …"), read limb by limb from where the joints sit — the try-on prompt leads with
 * the pose instead of only pointing at Image 3. Each leg is read on its own: averaging the two
 * called a standing high kick "kneeling", and the model knelt (live, 2026-10-01).
 * `aspect` is the canvas width / height so sideways distances are true.
 */
export function describePoseBody(
  body: NormalizedBody,
  options: { possessive?: 'her' | 'his'; aspect?: number } = {}
): string {
  const whose = options.possessive ?? 'her';
  const a = options.aspect && options.aspect > 0 ? options.aspect : 2 / 3;
  const at = (i: number): Pt | null => {
    const p = body[i];
    return p ? { x: p.x * a, y: p.y } : null;
  };
  const neck = at(1);
  const hipPoints = [at(8), at(11)].filter(Boolean) as Pt[];
  const head = at(0);
  if (!neck || hipPoints.length === 0) return 'in the pose shown';
  const hip = {
    x: hipPoints.reduce((sum, p) => sum + p.x, 0) / hipPoints.length,
    y: hipPoints.reduce((sum, p) => sum + p.y, 0) / hipPoints.length,
  };
  const torsoDx = Math.abs(hip.x - neck.x);
  const torsoDy = Math.abs(hip.y - neck.y);
  const torso = Math.hypot(torsoDx, torsoDy) || 0.2;

  // COCO-18: 8–10 are the person's right leg, 11–13 the left.
  const legs = (
    [
      ['right', at(8), at(9), at(10)],
      ['left', at(11), at(12), at(13)],
    ] as const
  ).flatMap(([side, legHip, knee, ankle]) =>
    legHip && knee && ankle ? [{ side, hip: legHip, knee, ankle }] : []
  );
  const ground = Math.max(...legs.flatMap(leg => [leg.knee.y, leg.ankle.y]), hip.y);
  const legKind = (leg: (typeof legs)[number]) => {
    const thighDrop = leg.knee.y - leg.hip.y;
    const shinDrop = leg.ankle.y - leg.knee.y;
    if (leg.ankle.y > ground - torso * 0.2 && shinDrop > torso * 0.4) {
      return thighDrop < torso * 0.45 ? 'seated' : 'planted';
    }
    // Knee on the ground, shin folded back or out flat.
    if (leg.knee.y > ground - torso * 0.25 && thighDrop > torso * 0.3) return 'kneel';
    return 'raised';
  };
  const kinds = legs.map(legKind);

  const describeRaised = (leg: (typeof legs)[number]) => {
    const height =
      leg.ankle.y < leg.hip.y - torso * 0.15
        ? 'kicked up high'
        : leg.ankle.y < leg.hip.y + torso * 0.45
          ? 'lifted'
          : 'raised off the floor';
    const sideways = Math.abs(leg.ankle.x - leg.hip.x);
    const direction = sideways > torso * 0.45 ? ' out to the side' : '';
    const thigh = Math.hypot(leg.knee.x - leg.hip.x, leg.knee.y - leg.hip.y);
    const shin = Math.hypot(leg.ankle.x - leg.knee.x, leg.ankle.y - leg.knee.y);
    const reach = Math.hypot(leg.ankle.x - leg.hip.x, leg.ankle.y - leg.hip.y);
    const bent = reach < (thigh + shin) * 0.94 ? 'knee bent' : 'leg straight';
    const foot =
      leg.ankle.y < neck.y + torso * 0.25
        ? 'foot at shoulder height'
        : leg.ankle.y < leg.hip.y - torso * 0.15
          ? 'foot above hip height'
          : leg.ankle.y < leg.hip.y + torso * 0.45
            ? 'foot at hip height'
            : 'foot at knee height';
    return `${whose} ${leg.side} leg ${height}${direction}, ${bent}, ${foot}`;
  };

  let stance: string;
  if (torsoDx > torsoDy * 1.3) {
    stance = 'lying down';
  } else if (legs.length < 2) {
    stance = 'standing';
  } else if (kinds.every(kind => kind === 'seated')) {
    stance = 'seated';
  } else if (kinds.every(kind => kind === 'kneel')) {
    stance = 'kneeling';
  } else if (
    kinds.includes('kneel') &&
    kinds.some(kind => kind === 'planted' || kind === 'seated')
  ) {
    const down = legs[kinds.indexOf('kneel')]!;
    stance = `kneeling on ${whose} ${down.side} knee, the other foot flat on the floor`;
  } else if (kinds.includes('raised') && kinds.some(kind => kind !== 'raised')) {
    const up = legs[kinds.indexOf('raised')]!;
    const support = legs[kinds.findIndex(kind => kind !== 'raised')]!;
    stance = `standing on ${whose} ${support.side} leg, ${describeRaised(up)}`;
  } else if (kinds.every(kind => kind === 'raised')) {
    stance = 'in mid-air, both feet off the floor';
  } else if (Math.abs(legs[0]!.ankle.x - legs[1]!.ankle.x) > torso * 0.6) {
    stance = 'walking mid-stride';
  } else {
    stance = 'standing';
  }

  // Arms: 2–4 right, 5–7 left.
  const arms = (
    [
      ['right', at(2), at(4)],
      ['left', at(5), at(7)],
    ] as const
  ).flatMap(([side, shoulder, wrist]) => {
    if (!shoulder || !wrist) return [];
    if (head ? wrist.y < head.y : wrist.y < shoulder.y - torso * 0.5)
      return [{ side, pose: 'raised' }];
    if (Math.abs(wrist.x - shoulder.x) > torso * 0.55 && wrist.y < hip.y - torso * 0.15) {
      return [{ side, pose: 'out' }];
    }
    return [];
  });
  const raised = arms.filter(arm => arm.pose === 'raised');
  const out = arms.filter(arm => arm.pose === 'out');
  const armWords = [
    raised.length === 2 ? 'both arms raised' : raised.length === 1 ? 'one arm raised' : '',
    out.length === 2
      ? 'both arms held out to the sides'
      : out.length === 1
        ? `${whose} ${out[0]!.side} arm held out to the side`
        : '',
  ].filter(Boolean);
  return [stance, ...armWords].join(', ');
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
export function poseFirstLine(
  body: NormalizedBody,
  pronoun: 'she' | 'he' = 'she',
  aspect?: number
): string {
  const description = describePoseBody(body, {
    possessive: pronoun === 'he' ? 'his' : 'her',
    aspect,
  });
  const stance = description.split(',')[0]!;
  // One-legged stances say it twice: the model knelt or stood square without it.
  const detail =
    STANCE_DETAIL[stance] ??
    (stance.startsWith('standing on ')
      ? 'upright on one straight leg, the other foot off the floor, never kneeling and never both feet down'
      : undefined);
  return `POSE FIRST: ${pronoun} is ${description}, exactly as the pose map in Image 3 shows${detail ? ` — ${detail}` : ''}.`;
}
