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

/** Where a figure stands across the picture: the middle of its shoulders and hips (0–1). */
export function bodyCentreX(body: NormalizedBody): number | null {
  const points = [body[1], body[2], body[5], body[8], body[11]].filter(
    (p): p is { x: number; y: number } => p != null
  );
  const any = points.length ? points : body.filter((p): p is { x: number; y: number } => !!p);
  if (any.length === 0) return null;
  return any.reduce((sum, p) => sum + p.x, 0) / any.length;
}

/** Move a figure sideways so its centre sits at `x` (kept inside the frame). */
function centreBodyAt(body: NormalizedBody, x: number): NormalizedBody {
  const centre = bodyCentreX(body);
  return centre == null ? body : shiftBody(body, x - centre);
}

/**
 * Add the partner (the second figure) beside the lead, keeping the lead's pose: `beside` is a
 * standing figure, `mirror` a mirrored copy of the lead so the two face each other. The lead
 * goes left and the partner right; Swap sides changes that. Max two figures.
 */
export function addPartner(
  bodies: NormalizedBody[],
  kind: 'beside' | 'mirror' = 'beside'
): NormalizedBody[] {
  if (bodies.length >= 2) return bodies;
  const lead = bodies[0] ?? poseStarterBody('stand');
  if (kind === 'beside') return addPerson([lead]);
  const [mirrored] = mirrorBodies([lead]);
  return [centreBodyAt(lead, 0.32), centreBodyAt(mirrored!, 0.68)];
}

/**
 * Swap where the lead and the partner stand, keeping both poses (Mirror flips the whole
 * picture instead). The lead stays first, so the prompt's "lead on the left / right" follows.
 */
export function swapSides(bodies: NormalizedBody[]): NormalizedBody[] {
  if (bodies.length !== 2) return bodies;
  const [lead, partner] = bodies as [NormalizedBody, NormalizedBody];
  const leadX = bodyCentreX(lead);
  const partnerX = bodyCentreX(partner);
  if (leadX == null || partnerX == null) return bodies;
  return [centreBodyAt(lead, partnerX), centreBodyAt(partner, leadX)];
}

/**
 * A new lead figure (Start from / a Day pose) with the partner kept where it stands: the lead
 * goes on the other side of the partner.
 */
export function replaceLead(bodies: NormalizedBody[], lead: NormalizedBody): NormalizedBody[] {
  const partner = bodies[1];
  if (!partner) return [lead];
  const partnerX = bodyCentreX(partner) ?? 0.68;
  return [centreBodyAt(lead, partnerX >= 0.5 ? 0.32 : 0.68), partner];
}

type Pt = { x: number; y: number };

/**
 * A dragged skeleton in words ("seated", "standing on her right leg, her left leg kicked up high
 * out to the side …", "bent forward at the waist toward the camera"), read limb by limb from
 * where the joints sit — the try-on prompt leads with the pose instead of only pointing at
 * Image 3, and the model follows the words over the map. So a misread is the wrong pose:
 * averaging the legs called a standing kick "kneeling"; a torso folded level with the hips over
 * straight legs was "lying down" and came out on a bed (live, 2026-10-01).
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
  const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
  const neck = at(1);
  const hipPoints = [at(8), at(11)].filter(Boolean) as Pt[];
  const head = at(0);
  if (!neck || hipPoints.length === 0) return 'in the pose shown';
  const hip = {
    x: hipPoints.reduce((sum, p) => sum + p.x, 0) / hipPoints.length,
    y: hipPoints.reduce((sum, p) => sum + p.y, 0) / hipPoints.length,
  };
  const torsoDx = Math.abs(hip.x - neck.x);
  const torsoDy = hip.y - neck.y; // + when the neck is above the hips
  const torso = Math.hypot(torsoDx, torsoDy);

  // COCO-18: 8–10 are the person's right leg, 11–13 the left.
  const legs = (
    [
      ['right', at(8), at(9), at(10)],
      ['left', at(11), at(12), at(13)],
    ] as const
  ).flatMap(([side, legHip, knee, ankle]) =>
    legHip && knee && ankle
      ? [{ side, hip: legHip, knee, ankle, length: dist(legHip, knee) + dist(knee, ankle) }]
      : []
  );
  const shoulders = [at(2), at(5)].filter(Boolean) as Pt[];
  const shoulderWidth = shoulders.length === 2 ? dist(shoulders[0]!, shoulders[1]!) : 0;
  // One yardstick that survives foreshortening: the torso, the legs or the shoulders, whichever
  // still shows its real size (a folded torso is short, a side-on figure has narrow shoulders).
  const unit = Math.max(
    torso,
    0.72 * Math.max(0, ...legs.map(leg => leg.length)),
    2 * shoulderWidth,
    0.05
  );
  const ground = Math.max(...legs.flatMap(leg => [leg.knee.y, leg.ankle.y]), hip.y);
  const hipHeight = ground - hip.y;

  const legKind = (leg: (typeof legs)[number]) => {
    const thighDrop = leg.knee.y - leg.hip.y;
    const shinDrop = leg.ankle.y - leg.knee.y;
    if (leg.ankle.y > ground - unit * 0.2 && shinDrop > unit * 0.4) {
      return thighDrop < unit * 0.45 ? 'seated' : 'planted';
    }
    // Knee on the ground, shin folded back or out flat.
    if (leg.knee.y > ground - unit * 0.25 && thighDrop > unit * 0.3) return 'kneel';
    return 'raised';
  };
  const kinds = legs.map(legKind);
  const onFeet = kinds.some(kind => kind === 'planted' || kind === 'seated');

  const describeRaised = (leg: (typeof legs)[number]) => {
    const height =
      leg.ankle.y < leg.hip.y - unit * 0.15
        ? 'kicked high'
        : leg.ankle.y < leg.hip.y + unit * 0.45
          ? 'lifted'
          : 'off the floor';
    const sideways = Math.abs(leg.ankle.x - leg.hip.x);
    const direction = sideways > unit * 0.45 ? ' to the side' : '';
    const reach = dist(leg.ankle, leg.hip);
    const bent = reach < leg.length * 0.94 ? 'knee bent' : 'leg straight';
    const foot =
      leg.ankle.y < neck.y + unit * 0.25
        ? 'foot at shoulder height'
        : leg.ankle.y < leg.hip.y - unit * 0.15
          ? 'foot above hip height'
          : leg.ankle.y < leg.hip.y + unit * 0.45
            ? 'foot at hip height'
            : 'foot at knee height';
    return `${leg.side} leg ${height}${direction}, ${bent}, ${foot}`;
  };

  const wrists = [at(4), at(7)].filter(Boolean) as Pt[];
  const handsDown = wrists.length > 0 && wrists.every(wrist => wrist.y > ground - unit * 0.35);
  // The upper body: upright, leaning, folded forward, or flat.
  const folded = torsoDy < unit * 0.3; // neck about level with, or below, the hips
  const sideOn = torsoDx > unit * 0.45;
  const lean =
    !folded && torsoDy < unit * 0.8 && torsoDx > unit * 0.3
      ? shoulderWidth < unit * 0.25
        ? 'leaning forward'
        : `leaning to ${whose} ${neck.x < hip.x ? 'right' : 'left'}`
      : !folded && torso < unit * 0.55
        ? 'leaning toward the camera'
        : '';

  let stance: string;
  if (folded && legs.length === 2 && kinds.every(kind => kind === 'kneel') && handsDown) {
    stance = `on ${whose} hands and knees, back level`;
  } else if (folded && onFeet && hipHeight > unit * 0.75) {
    // Hips high over planted feet with the upper body down: a bend, never lying.
    stance = sideOn
      ? torsoDy < -unit * 0.2
        ? 'seen from the side, bent right over at the waist, legs straight, head down by the knees'
        : 'seen from the side, bent forward at the waist, legs straight, back level with the floor'
      : 'bent forward at the waist toward the camera, legs straight, back flat';
  } else if (torsoDx > Math.abs(torsoDy) * 1.3 && hipHeight < unit * 0.75) {
    stance = 'lying down';
  } else if (legs.length < 2) {
    stance = 'standing';
  } else if (hipHeight < unit * 0.22 && !folded) {
    // Hips on the ground, upper body up.
    const kneesUp = legs.some(leg => leg.knee.y < leg.hip.y - unit * 0.2);
    stance = `sitting on the floor, ${kneesUp ? 'knees up' : 'legs out'}`;
  } else if (kinds.every(kind => kind === 'seated')) {
    // A squat puts the hips at or below the knees; on a seat they sit level with them or above.
    stance =
      hipHeight < unit * 0.62 && hip.y > Math.max(...legs.map(leg => leg.knee.y)) - unit * 0.02
        ? 'squatting low, feet flat'
        : 'seated';
  } else if (kinds.every(kind => kind === 'kneel')) {
    stance = 'kneeling';
  } else if (kinds.includes('kneel') && onFeet) {
    const down = legs[kinds.indexOf('kneel')]!;
    stance = `kneeling on ${whose} ${down.side} knee, other foot flat on the floor`;
  } else if (kinds.includes('raised') && kinds.some(kind => kind !== 'raised')) {
    const up = legs[kinds.indexOf('raised')]!;
    const support = legs[kinds.findIndex(kind => kind !== 'raised')]!;
    // A foot only just off the floor with the legs apart is a step, not a one-legged pose.
    const step =
      up.ankle.y > up.hip.y + unit * 0.6 && Math.abs(up.ankle.x - support.ankle.x) > unit * 0.3;
    stance = step
      ? 'walking mid-stride'
      : `standing on ${whose} ${support.side} leg, ${describeRaised(up)}`;
  } else if (kinds.every(kind => kind === 'raised')) {
    // Both legs foreshortened or tucked: a crouch seen from the front reads this way too.
    stance = hipHeight < unit * 0.9 ? 'crouching low' : 'in mid-air, both feet off the floor';
  } else {
    const [right, left] = [legs[0]!, legs[1]!];
    const spread = Math.abs(right.ankle.x - left.ankle.x);
    // Feet apart either side of the hips is a wide stance; one ahead of the other is a stride.
    const straddles = (right.ankle.x - hip.x) * (left.ankle.x - hip.x) < 0;
    const even = Math.abs(right.ankle.x + left.ankle.x - 2 * hip.x) < spread * 0.35;
    // A stride has one knee bent or one foot lifted; a wide stance is the same on both sides.
    const matched =
      Math.abs(right.ankle.y - left.ankle.y) < unit * 0.08 &&
      Math.abs(
        dist(right.hip, right.ankle) / right.length - dist(left.hip, left.ankle) / left.length
      ) < 0.05;
    stance =
      spread > unit * 0.6
        ? straddles && even && matched && shoulderWidth > unit * 0.3
          ? 'standing with legs wide apart'
          : 'walking mid-stride'
        : 'standing';
  }
  if (lean && /^(?:standing|walking|seated|kneeling)/.test(stance)) {
    stance = `${stance}, ${lean}`;
  }

  const lying = stance === 'lying down';
  const upright = !folded && !lean && !lying;
  // Arms: 2–4 right, 5–7 left.
  const hipOf = { right: at(8), left: at(11) };
  const arms = (
    [
      ['right', at(2), at(3), at(4)],
      ['left', at(5), at(6), at(7)],
    ] as const
  ).flatMap(([side, shoulder, elbow, wrist]) => {
    if (!shoulder || !wrist) return [];
    // With the upper body folded or leaning, "above the head" and "by the hip" stop meaning
    // raised arms or hands on hips — only hands reaching the floor are worth saying.
    if (!upright) {
      return !lying && !handsDown && wrist.y > ground - unit * 0.3 ? [{ side, pose: 'down' }] : [];
    }
    if (head ? wrist.y < head.y - unit * 0.05 : wrist.y < shoulder.y - unit * 0.5) {
      // Above the head but far out to the side is a diagonal reach, not an arm straight up.
      return [{ side, pose: Math.abs(wrist.x - shoulder.x) > unit * 0.6 ? 'upout' : 'raised' }];
    }
    if (head && dist(wrist, head) < unit * 0.4 && elbow && elbow.y < shoulder.y + unit * 0.15) {
      return [{ side, pose: 'head' }];
    }
    const sideHip = hipOf[side];
    if (
      sideHip &&
      elbow &&
      dist(wrist, sideHip) < unit * 0.3 &&
      // Elbow pushed out past both the shoulder and the hand: a bent arm, not one hanging down.
      Math.abs(elbow.x - hip.x) > Math.abs(shoulder.x - hip.x) + unit * 0.1 &&
      Math.abs(elbow.x - hip.x) > Math.abs(wrist.x - hip.x) + unit * 0.1
    ) {
      return [{ side, pose: 'hip' }];
    }
    if (Math.abs(wrist.x - shoulder.x) > unit * 0.55 && wrist.y < hip.y - unit * 0.15) {
      return [{ side, pose: 'out' }];
    }
    if (!handsDown && wrist.y > hip.y + unit * 0.75 && onFeet) {
      return [{ side, pose: 'down' }];
    }
    return [];
  });
  const armPhrase = (pose: string, both: string, one: (side: string) => string): string => {
    const hits = arms.filter(arm => arm.pose === pose);
    return hits.length === 2 ? both : hits.length === 1 ? one(hits[0]!.side) : '';
  };
  const armWords = /hands and knees/.test(stance)
    ? []
    : [
        armPhrase('raised', 'both arms raised', () => 'one arm raised'),
        armPhrase(
          'upout',
          'both arms raised out wide',
          side => `${side} arm reaching up and out to the side`
        ),
        armPhrase('head', 'both hands behind the head', side => `${side} hand behind the head`),
        // Lying down, hands near the hips are just arms at rest.
        lying ? '' : armPhrase('hip', 'both hands on hips', side => `${side} hand on hip`),
        armPhrase('out', 'both arms out to the sides', side => `${side} arm out to the side`),
        armPhrase(
          'down',
          'hands reaching to the floor',
          side => `${side} hand reaching to the floor`
        ),
      ].filter(Boolean);
  // Facing the camera, her right shoulder and hip sit on the picture's left. Both on the right
  // means she has her back to us — the editor's "Back to you", which the 2D pose map alone did
  // not get across (the try-on kept facing front).
  const [rs, ls, rh, lh] = [at(2), at(5), at(8), at(11)];
  const backTurned =
    Boolean(rs && ls && rh && lh) &&
    rs!.x - ls!.x > unit * 0.12 &&
    rh!.x - lh!.x > unit * 0.04 &&
    !lying;
  return [...(backTurned ? ['seen from behind'] : []), stance, ...armWords].join(', ');
}

/** Extra words for a stance the model tends to get wrong; matched on how the stance starts. */
const STANCE_DETAILS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^seen from behind/, 'her back to the camera, never facing it'],
  [/^seated/, 'hips on a seat, knees bent'],
  [/^kneeling$/, 'upright on both knees'],
  [/^lying down/, 'flat on the floor or bed'],
  [/^walking mid-stride/, 'one foot forward'],
  [/^standing$/, 'weight on both feet'],
  [/^standing on /, 'one foot off the floor, never kneeling'],
  [/bent (?:forward|right over) at the waist/, 'feet on the floor, hips high — never lying down'],
  [/^squatting/, 'hips below the knees, no chair'],
  [/^crouching/, 'feet on the floor, hips low'],
  [/^sitting on the floor/, 'hips on the floor, no chair'],
  [/^on (?:her|his) hands and knees/, 'palms and knees on the floor'],
];

/**
 * Opening line for a custom-pose try-on: the stance in words, then "as the pose map shows".
 * Live (Outfit, 3 seeds): the pose line at the end of the prompt left him standing 3/3; this as
 * the first line seated him 3/3 with the kit and face kept.
 */
export function poseFirstLine(
  body: NormalizedBody,
  pronoun: 'she' | 'he' = 'she',
  aspect?: number,
  /** The pose in words when it is already known (a named Day pose). */
  words?: string | null
): string {
  const description = describePoseBody(body, {
    possessive: pronoun === 'he' ? 'his' : 'her',
    aspect,
  });
  // Every matching note: a back view of a bend needs both.
  const stanceOnly = description.replace(/^seen from behind, /, '');
  const detail = [description, stanceOnly]
    .filter((text, index, all) => all.indexOf(text) === index)
    .map(text => STANCE_DETAILS.find(([pattern]) => pattern.test(text))?.[1])
    .filter(Boolean)
    .join('; ')
    .replace(/\bher\b/g, pronoun === 'he' ? 'his' : 'her');
  // A Day pose picked by name says its own name and cue — more reliable than reading joints.
  if (words?.trim()) {
    return `POSE FIRST: ${pronoun} is ${words.trim().replace(/[.\s]+$/, '')}, exactly as the pose map in Image 3 shows.`;
  }
  return `POSE FIRST: ${pronoun} is ${description}, exactly as the pose map in Image 3 shows${detail ? ` — ${detail}` : ''}.`;
}

/** Hands, elbows, knees and feet: 3–4 and 6–7 the arms, 9–10 and 12–13 the legs. */
const REACH_JOINTS = [3, 4, 6, 7, 9, 10, 12, 13] as const;

/**
 * True when a limb is drawn close to the edge of the pose canvas — arms straight out, arms
 * overhead, a wide kick. A try-on keeps the plate's tight framing, so such a limb was cropped by
 * the frame or bent to fit inside it (a T-pose rendered with drooping arms on Rapid and Edit
 * 2511, both seeds, 2026-10-01).
 */
export function poseReachesFar(body: NormalizedBody | null | undefined): boolean {
  return REACH_JOINTS.some(index => {
    const point = body?.[index];
    return Boolean(point) && (point!.x < 0.12 || point!.x > 0.88 || point!.y < 0.07);
  });
}

/** Asks for room around a far-reaching pose; '' for a pose that fits the plate's framing. */
export function poseFramingLine(
  body: NormalizedBody | null | undefined,
  pronoun: 'she' | 'he' = 'she'
): string {
  if (!poseReachesFar(body)) return '';
  const whose = pronoun === 'he' ? 'his' : 'her';
  return `FRAMING: pull the camera back and show ${whose} whole body from head to feet with clear space around ${pronoun === 'he' ? 'him' : 'her'} — both hands and both feet inside the picture, nothing cropped by the frame.`;
}
