/**
 * One-tap arm and leg positions for the pose editor ("Arms: on hips", "Legs: apart"), "match
 * the other side", and head directions ("Head: left"). Dragging four joints to put both hands
 * on the hips is the slow part of posing by hand; these set a limb in one go and keep its bone
 * lengths. The head has no joints to drag at all: its eyes and ears only ride with the nose.
 *
 * Flat (in the picture plane): they place the limb as seen from the front. `aspect` is canvas
 * width / height, so lengths are true on screen.
 */

import type { NormalizedBody } from '@/lib/pose-library';

export type LimbSide = 'both' | 'right' | 'left';

export const ARM_PRESETS = [
  { id: 'sides', label: 'At sides' },
  { id: 'hips', label: 'On hips' },
  { id: 'crossed', label: 'Crossed' },
  { id: 'out', label: 'Out' },
  { id: 'up', label: 'Up' },
  { id: 'head', label: 'Behind head' },
  { id: 'wave', label: 'Wave' },
] as const;
export type ArmPresetId = (typeof ARM_PRESETS)[number]['id'];

export const LEG_PRESETS = [
  { id: 'together', label: 'Together' },
  { id: 'apart', label: 'Apart' },
  { id: 'wide', label: 'Wide' },
  { id: 'crossed', label: 'Crossed' },
  { id: 'knee', label: 'Knee up' },
] as const;
export type LegPresetId = (typeof LEG_PRESETS)[number]['id'];

type XY = { x: number; y: number };

/** COCO-18 joints of each limb: root, middle, end. */
const ARM = { right: [2, 3, 4], left: [5, 6, 7] } as const;
const LEG = { right: [8, 9, 10], left: [11, 12, 13] } as const;

const clamp = (value: number) => Math.min(0.99, Math.max(0.01, value));
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Screen-true distance between two normalized points. */
function span(a: XY, b: XY, aspect: number): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/** A point `length` from `from`, at `angle` from straight down, swinging toward `out` (±1). */
function swing(
  from: XY,
  length: number,
  angle: number,
  out: number,
  aspect: number,
  /** Keep the point inside the picture (off for composed poses, which are fitted as a whole). */
  inside = true
): XY {
  const x = from.x + (Math.sin(rad(angle)) * out * length) / aspect;
  const y = from.y + Math.cos(rad(angle)) * length;
  return inside ? { x: clamp(x), y: clamp(y) } : { x, y };
}

/** A point `length` from `from` toward `target` (never past it by more than the bone allows). */
function toward(from: XY, target: XY, length: number, aspect: number): XY {
  const dx = (target.x - from.x) * aspect;
  const dy = target.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  return {
    x: clamp(from.x + ((dx / distance) * length) / aspect),
    y: clamp(from.y + (dy / distance) * length),
  };
}

/**
 * Bend a two-bone limb so its end lands on `target` (or as near as the bones reach), with the
 * middle joint on the `out` side — elbows point away from the body.
 */
function reach(
  root: XY,
  target: XY,
  upper: number,
  lower: number,
  out: number,
  aspect: number,
  /** Which solution to take: the middle joint further out (elbows out), or the higher one. */
  prefer: 'out' | 'high' = 'out'
): { mid: XY; end: XY } {
  const dx = (target.x - root.x) * aspect;
  const dy = target.y - root.y;
  const wanted = Math.hypot(dx, dy) || 1e-6;
  const distance = Math.min(upper + lower - 1e-4, Math.max(Math.abs(upper - lower) + 1e-4, wanted));
  const ux = dx / wanted;
  const uy = dy / wanted;
  // Along the root → target line, then off it to the outward side.
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const off = Math.sqrt(Math.max(0, upper * upper - along * along));
  const candidates = [1, -1].map(sign => ({
    x: root.x + (ux * along - uy * off * sign) / aspect,
    y: root.y + uy * along + ux * off * sign,
  }));
  const mid = candidates.sort((a, b) => (prefer === 'high' ? a.y - b.y : (b.x - a.x) * out))[0]!;
  const end = {
    x: root.x + (ux * distance) / aspect,
    y: root.y + uy * distance,
  };
  return {
    mid: { x: clamp(mid.x), y: clamp(mid.y) },
    end: { x: clamp(end.x), y: clamp(end.y) },
  };
}

/** Which way is "away from the body" for a limb root, on screen. */
function outward(body: NormalizedBody, root: XY, fallback: number): number {
  const neck = body[1];
  const hips = [body[8], body[11]].filter(Boolean) as XY[];
  const middle =
    neck?.x ?? (hips.length ? hips.reduce((sum, p) => sum + p.x, 0) / hips.length : 0.5);
  const side = Math.sign(root.x - middle);
  return side || fallback;
}

function sides(side: LimbSide): Array<'right' | 'left'> {
  return side === 'both' ? ['right', 'left'] : [side];
}

/** Put one or both arms in a named position. Missing joints are left alone. */
export function applyArmPreset(
  body: NormalizedBody,
  preset: ArmPresetId,
  side: LimbSide,
  aspect: number
): NormalizedBody {
  const a = aspect > 0 ? aspect : 1;
  const next = body.map(point => (point ? { ...point } : null));
  for (const which of sides(side)) {
    const [rootIndex, midIndex, endIndex] = ARM[which];
    const root = next[rootIndex];
    const mid = next[midIndex];
    const end = next[endIndex];
    if (!root || !mid || !end) continue;
    const upper = span(root, mid, a) || 0.12;
    const fore = span(mid, end, a) || 0.11;
    // Their right is the picture's left when they face the camera.
    const out = outward(next, root, which === 'right' ? -1 : 1);
    const neck = next[1] ?? root;
    const hip = next[which === 'right' ? 8 : 11];
    const head = next[0] ?? neck;
    let elbow: XY;
    let wrist: XY;
    switch (preset) {
      case 'hips': {
        // Hands on the waist, a little above the hip joint, so the elbows stand out.
        const bent = hip
          ? reach(
              root,
              { x: hip.x + (out * 0.02) / a, y: neck.y + (hip.y - neck.y) * 0.78 },
              upper,
              fore,
              out,
              a
            )
          : null;
        elbow = bent?.mid ?? swing(root, upper, 40, out, a);
        wrist = bent?.end ?? swing(elbow, fore, -55, out, a);
        break;
      }
      case 'crossed': {
        // Forearm folds across the chest: the hand rests on the other upper arm.
        const torso = hip ? hip.y - neck.y : 0.3;
        const bent = reach(
          root,
          { x: neck.x - (out * 0.045) / a, y: neck.y + torso * 0.4 },
          upper,
          fore,
          out,
          a
        );
        elbow = bent.mid;
        wrist = bent.end;
        break;
      }
      case 'out':
        elbow = swing(root, upper, 88, out, a);
        wrist = swing(elbow, fore, 88, out, a);
        break;
      case 'up':
        // Elbows a little out: straight up runs off the top of a standing figure's canvas.
        elbow = swing(root, upper, 126, out, a);
        wrist = swing(elbow, fore, 178, out, a);
        break;
      case 'head': {
        // Elbows up and out, hands behind the head.
        const bent = reach(
          root,
          { x: head.x + (out * 0.025) / a, y: head.y + 0.01 },
          upper,
          fore,
          out,
          a,
          'high'
        );
        elbow = bent.mid;
        wrist = bent.end;
        break;
      }
      case 'wave':
        elbow = swing(root, upper, 98, out, a);
        wrist = swing(elbow, fore, 176, out, a);
        break;
      case 'sides':
      default:
        elbow = swing(root, upper, 7, out, a);
        wrist = swing(elbow, fore, 3, out, a);
        break;
    }
    next[midIndex] = { ...mid, ...elbow };
    next[endIndex] = { ...end, ...wrist };
  }
  return next;
}

/** Put one or both legs in a named position. "Knee up" on both lifts their right knee. */
export function applyLegPreset(
  body: NormalizedBody,
  preset: LegPresetId,
  side: LimbSide,
  aspect: number
): NormalizedBody {
  const a = aspect > 0 ? aspect : 1;
  const next = body.map(point => (point ? { ...point } : null));
  const which = preset === 'knee' && side === 'both' ? (['right'] as const) : sides(side);
  for (const leg of which) {
    const [rootIndex, midIndex, endIndex] = LEG[leg];
    const root = next[rootIndex];
    const mid = next[midIndex];
    const end = next[endIndex];
    if (!root || !mid || !end) continue;
    const thigh = span(root, mid, a) || 0.2;
    const shin = span(mid, end, a) || 0.2;
    const out = outward(next, root, leg === 'right' ? -1 : 1);
    const [upperAngle, lowerAngle] =
      preset === 'apart'
        ? [8, 7]
        : preset === 'wide'
          ? [30, 22]
          : preset === 'crossed'
            ? [-7, -22]
            : preset === 'knee'
              ? [78, -8]
              : [1, 0];
    const knee = swing(root, thigh, upperAngle, out, a);
    const ankle = swing(knee, shin, lowerAngle, out, a);
    next[midIndex] = { ...mid, ...knee };
    next[endIndex] = { ...end, ...ankle };
  }
  return next;
}

/**
 * Copy one arm or leg to the other side, mirrored across the body's middle — pose one arm by
 * hand, then match the other to it.
 */
export function matchLimb(
  body: NormalizedBody,
  limb: 'arm' | 'leg',
  from: 'right' | 'left'
): NormalizedBody {
  const next = body.map(point => (point ? { ...point } : null));
  const joints = limb === 'arm' ? ARM : LEG;
  const source = joints[from];
  const target = joints[from === 'right' ? 'left' : 'right'];
  const sourceRoot = next[source[0]];
  const targetRoot = next[target[0]];
  if (!sourceRoot || !targetRoot) return next;
  for (const index of [1, 2] as const) {
    const point = next[source[index]];
    const there = next[target[index]];
    if (!point || !there) continue;
    next[target[index]] = {
      ...there,
      x: clamp(targetRoot.x - (point.x - sourceRoot.x)),
      y: clamp(targetRoot.y + (point.y - sourceRoot.y)),
    };
  }
  return next;
}

/**
 * Leg positions are drawn for a figure on its feet. On a seated, kneeling or lying figure they
 * would straighten the legs and stand it up, so the editor offers them only when this is true.
 */
export function legsAreStanding(body: NormalizedBody, aspect: number): boolean {
  const a = aspect > 0 ? aspect : 1;
  const neck = body[1];
  return (['right', 'left'] as const).every(leg => {
    const [rootIndex, midIndex, endIndex] = LEG[leg];
    const hip = body[rootIndex];
    const knee = body[midIndex];
    const ankle = body[endIndex];
    if (!hip || !knee || !ankle) return false;
    const thigh = span(hip, knee, a) || 1;
    // Upright torso, thigh mostly downward, foot below the knee — or one knee raised.
    const torsoUpright = !neck || Math.abs((neck.x - hip.x) * a) < Math.abs(neck.y - hip.y);
    const thighDown = knee.y - hip.y > thigh * 0.55;
    return torsoUpright && (thighDown ? ankle.y > knee.y : true);
  })
    ? (['right', 'left'] as const).some(leg => {
        const hip = body[LEG[leg][0]];
        const knee = body[LEG[leg][1]];
        return Boolean(hip && knee && knee.y - hip.y > (span(hip, knee, a) || 1) * 0.55);
      })
    : false;
}

// ── Head direction ───────────────────────────────────────────────────────────────────────

export const HEAD_DIRECTIONS = [
  { id: 'straight', label: 'Straight' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
] as const;
export type HeadDirection = (typeof HEAD_DIRECTIONS)[number]['id'];

/** COCO-18 face points: nose, their right / left eye, their right / left ear. */
const NOSE = 0;
const R_EYE = 14;
const L_EYE = 15;
const R_EAR = 16;
const L_EAR = 17;

/**
 * The head, in head radii from its centre (the middle of the ear line). Face-on is the standing
 * starter's own face, so "Straight" leaves that figure as it is; the profile is the head the
 * guide draws for Day's Look: away (`stickToOpenPoseKeypoints`).
 */
const EAR_OUT = 0.85;
const EYE_OUT = 0.425;
/** [nose, eye line] above the ear line. Up closes the gap between them, Down opens it. */
const FACE_RISE: Record<'straight' | 'up' | 'down', readonly [number, number]> = {
  straight: [0, 0.32],
  up: [0.3, 0.47],
  down: [-0.4, 0.08],
};
const PROFILE_NOSE = 0.85;
const PROFILE_EAR = 0.28;
const PROFILE_EYE = [0.5, 0.28] as const;
/** How far a head seen from the side tips for Up / Down. */
const PROFILE_NOD = rad(35);
/**
 * Smallest head, as a share of the neck → head-centre distance. A side-on starter stacks both
 * ears on one spot, which measured as a head a few pixels wide.
 */
const MIN_HEAD = 0.28;
/** Shoulders closer together than this share of the torso: the body is seen from the side. */
const SIDE_ON_SHOULDERS = 0.2;

type HeadFrame = {
  /** All in screen-true space (x × aspect). */
  centre: XY;
  radius: number;
  /** Unit vector from the neck through the head. */
  up: XY;
  /** Unit vector toward their left in the picture, across the head. */
  left: XY;
  /** The body is seen from the side (shoulders one behind the other). */
  sideOn: boolean;
  /** Seen from the side with the nose out in front: the way the face points. */
  facing: XY | null;
  nose: XY | null;
  eyes: XY[];
  ears: number;
};

const scaled = (v: XY, by: number): XY => ({ x: v.x * by, y: v.y * by });
const minus = (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: XY, b: XY) => a.x * b.x + a.y * b.y;

/**
 * Where the head is and how big, read back from the face points. The ears anchor it: every head
 * direction puts them a fixed way from the centre, so a second tap finds the same head and
 * nothing drifts.
 */
function readHeadFrame(body: NormalizedBody, a: number): HeadFrame | null {
  const at = (index: number): XY | null => {
    const point = body[index];
    return point ? { x: point.x * a, y: point.y } : null;
  };
  const neck = at(1);
  if (!neck) return null;
  const nose = at(NOSE);
  const [rightEar, leftEar] = [at(R_EAR), at(L_EAR)];
  const pair =
    rightEar && leftEar
      ? {
          middle: { x: (rightEar.x + leftEar.x) / 2, y: (rightEar.y + leftEar.y) / 2 },
          radius: Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y) / (2 * EAR_OUT),
        }
      : null;
  // Both ears on one spot (the side-on starters): no width to measure a face-on head from.
  const stacked =
    pair != null &&
    pair.radius < (MIN_HEAD / 2) * Math.hypot(pair.middle.x - neck.x, pair.middle.y - neck.y);
  let centre: XY | null;
  let measured = 0;
  if (pair && !stacked) {
    centre = pair.middle;
    measured = pair.radius;
  } else {
    const ear = pair?.middle ?? rightEar ?? leftEar;
    const reach = ear && nose ? minus(nose, ear) : null;
    const length = reach ? Math.hypot(reach.x, reach.y) : 0;
    // Stacked ears are a profile only with the nose out to one side of them; with the nose
    // further along the neck line (the lying starter) the head stays where it is drawn.
    const stem = ear ? minus(ear, neck) : null;
    const sideways =
      !stacked ||
      (reach != null &&
        stem != null &&
        Math.abs(reach.x * stem.y - reach.y * stem.x) > Math.abs(dot(reach, stem)));
    if (ear && reach && length > 1e-6 && sideways) {
      // A profile: the one ear sits behind the centre, on the line back from the nose.
      measured = length / (PROFILE_NOSE + PROFILE_EAR);
      const back = scaled(reach, (PROFILE_EAR * measured) / length);
      centre = { x: ear.x + back.x, y: ear.y + back.y };
    } else {
      centre = nose ?? ear;
    }
  }
  if (!centre) return null;
  const stem = Math.hypot(centre.x - neck.x, centre.y - neck.y);
  if (stem < 1e-6) return null;
  const up = { x: (centre.x - neck.x) / stem, y: (centre.y - neck.y) / stem };
  const radius = Math.max(measured, MIN_HEAD * stem);
  // Facing the camera, their left is the picture's right; seen from behind the shoulders have
  // swapped sides, and so has their left.
  const across = { x: -up.y, y: up.x };
  const [rightShoulder, leftShoulder] = [at(2), at(5)];
  const shoulders = rightShoulder && leftShoulder ? minus(leftShoulder, rightShoulder) : null;
  const left = shoulders && dot(shoulders, across) < -1e-6 ? scaled(across, -1) : across;
  // Side-on: narrow shoulders, and a nose clearly out in front of the ears to say which way.
  const hips = [at(8), at(11)].filter(Boolean) as XY[];
  const torso = hips.length
    ? Math.hypot(
        hips.reduce((sum, p) => sum + p.x, 0) / hips.length - neck.x,
        hips.reduce((sum, p) => sum + p.y, 0) / hips.length - neck.y
      )
    : 0;
  const narrow =
    shoulders != null && Math.hypot(shoulders.x, shoulders.y) < SIDE_ON_SHOULDERS * torso;
  const ahead = nose ? dot(minus(nose, centre), across) / radius : 0;
  const facing = narrow && Math.abs(ahead) > 0.3 ? scaled(across, Math.sign(ahead)) : null;
  return {
    centre,
    radius,
    up,
    left,
    sideOn: narrow,
    facing,
    nose,
    eyes: [at(R_EYE), at(L_EYE)].filter(Boolean) as XY[],
    ears: [rightEar, leftEar].filter(Boolean).length,
  };
}

/**
 * Turn or tip the head: moves only the nose, eyes and ears. The neck stays put and the head
 * keeps its size, so the chips can be tapped in any order without the head wandering.
 *
 * Left / Right are theirs, as in the rest of the editor. They draw a profile the way the guide
 * does (nose, one eye, one ear — the far eye and ear are null, "not visible"): a pose map says
 * "turned" by the missing far side, not by a nose a few pixels off centre. Up / Down keep the
 * ears and move the nose against the eye line.
 *
 * A body seen from the side already shows its head in profile, so Straight / Up / Down keep the
 * profile; Left / Right would face the camera or the back of the head, which a flat skeleton
 * cannot tell apart — those leave the figure as it is (see `readHeadDirection().sideOn`).
 */
export function applyHeadDirection(
  body: NormalizedBody,
  direction: HeadDirection,
  aspect: number
): NormalizedBody {
  const a = aspect > 0 ? aspect : 1;
  const next = body.map(point => (point ? { ...point } : null));
  const frame = readHeadFrame(body, a);
  if (!frame) return next;
  while (next.length <= L_EAR) next.push(null);
  const { centre, radius, up, left, facing } = frame;
  const sideways = direction === 'left' || direction === 'right';
  if (frame.sideOn && sideways) return next;
  const place = (index: number, along: XY, alongAmount: number, rise: XY, riseAmount: number) => {
    const x = centre.x + (along.x * alongAmount + rise.x * riseAmount) * radius;
    const y = centre.y + (along.y * alongAmount + rise.y * riseAmount) * radius;
    next[index] = { x: clamp(x / a), y: clamp(y) };
  };
  const profile = (toward: XY, nod: number) => {
    const [cos, sin] = [Math.cos(nod), Math.sin(nod)];
    const forward = { x: toward.x * cos + up.x * sin, y: toward.y * cos + up.y * sin };
    const crown = { x: up.x * cos - toward.x * sin, y: up.y * cos - toward.y * sin };
    // Facing the picture's right shows their right side (the guide's rule, any head tilt).
    const rightSide = up.x * toward.y - up.y * toward.x > 0;
    const [eye, ear, farEye, farEar] = rightSide
      ? [R_EYE, R_EAR, L_EYE, L_EAR]
      : [L_EYE, L_EAR, R_EYE, R_EAR];
    place(NOSE, forward, PROFILE_NOSE, crown, 0);
    place(eye, forward, PROFILE_EYE[0], crown, PROFILE_EYE[1]);
    place(ear, forward, -PROFILE_EAR, crown, 0);
    next[farEye] = null;
    next[farEar] = null;
  };
  if (sideways) {
    profile(direction === 'left' ? left : scaled(left, -1), 0);
  } else if (facing) {
    profile(facing, direction === 'up' ? PROFILE_NOD : direction === 'down' ? -PROFILE_NOD : 0);
  } else {
    const [noseRise, eyeRise] = FACE_RISE[direction];
    place(NOSE, left, 0, up, noseRise);
    place(R_EYE, left, -EYE_OUT, up, eyeRise);
    place(L_EYE, left, EYE_OUT, up, eyeRise);
    place(R_EAR, left, -EAR_OUT, up, 0);
    place(L_EAR, left, EAR_OUT, up, 0);
  }
  return next;
}

/**
 * Which head direction a figure shows now (null when it is none of them — a head dragged by
 * hand, a detected three-quarter face), and whether the body is seen from the side, where
 * Left / Right do not apply.
 */
export function readHeadDirection(
  body: NormalizedBody,
  aspect: number
): { direction: HeadDirection | null; sideOn: boolean } {
  const frame = readHeadFrame(body, aspect > 0 ? aspect : 1);
  if (!frame?.nose) return { direction: null, sideOn: Boolean(frame?.sideOn) };
  const { centre, radius, up, left, sideOn, facing, nose, eyes, ears } = frame;
  const offset = scaled(minus(nose, centre), 1 / radius);
  if (facing) {
    const nod = Math.atan2(dot(offset, up), dot(offset, facing));
    const direction = nod > PROFILE_NOD / 2 ? 'up' : nod < -PROFILE_NOD / 2 ? 'down' : 'straight';
    return { direction, sideOn };
  }
  const sideways = dot(offset, left);
  const rise = dot(offset, up);
  if (ears === 1) {
    const turned = Math.abs(sideways) > PROFILE_NOSE / 2;
    return { direction: turned ? (sideways > 0 ? 'left' : 'right') : null, sideOn };
  }
  if (ears !== 2 || Math.abs(sideways) > 0.3) return { direction: null, sideOn };
  // Nose and eye line both where the chip puts them: a face read from a photo has its nose
  // below the ears without looking down, and should light none of the chips.
  const eyeRise = eyes.length
    ? eyes.reduce((sum, eye) => sum + dot(minus(eye, centre), up), 0) / eyes.length / radius
    : null;
  const direction =
    (['straight', 'up', 'down'] as const).find(
      id =>
        Math.abs(rise - FACE_RISE[id][0]) < 0.12 &&
        (eyeRise == null || Math.abs(eyeRise - FACE_RISE[id][1]) < 0.12)
    ) ?? null;
  return { direction, sideOn };
}

/**
 * Where a limb segment points in the picture, relative to the body: "out" is away from the
 * body's middle, "in" across it. "forward" is toward the camera (drawn short).
 */
export const LIMB_DIRECTIONS = [
  'down',
  'down_out',
  'out',
  'up_out',
  'up',
  'up_in',
  'in',
  'down_in',
  'forward',
] as const;
export type LimbDirection = (typeof LIMB_DIRECTIONS)[number];

/** A limb as two segments: [upper arm, forearm] or [thigh, shin]. */
export type LimbDirections = readonly [LimbDirection, LimbDirection];

/** Angle from straight down, positive outward. */
const DIRECTION_ANGLE: Record<Exclude<LimbDirection, 'forward'>, number> = {
  down: 0,
  down_out: 45,
  out: 90,
  up_out: 135,
  up: 180,
  up_in: -135,
  in: -90,
  down_in: -40,
};

/** A segment pointing at the camera is drawn at this fraction of its length, hanging down. */
const FORESHORTENED = 0.35;

/**
 * Point one arm or leg where the two directions say, keeping its bone lengths — the building
 * block for poses composed from a description instead of picked from the list.
 */
export function setLimbDirections(
  body: NormalizedBody,
  limb: 'arm' | 'leg',
  side: 'right' | 'left',
  directions: LimbDirections,
  aspect: number
): NormalizedBody {
  const a = aspect > 0 ? aspect : 1;
  const next = body.map(point => (point ? { ...point } : null));
  const [rootIndex, midIndex, endIndex] = (limb === 'arm' ? ARM : LEG)[side];
  const root = next[rootIndex];
  const mid = next[midIndex];
  const end = next[endIndex];
  if (!root || !mid || !end) return next;
  const lengths = [span(root, mid, a) || 0.13, span(mid, end, a) || 0.12];
  const out = outward(next, root, side === 'right' ? -1 : 1);
  const place = (from: XY, direction: LimbDirection, length: number) =>
    direction === 'forward'
      ? swing(from, length * FORESHORTENED, 8, out, a, false)
      : swing(from, length, DIRECTION_ANGLE[direction], out, a, false);
  const joint = place(root, directions[0], lengths[0]!);
  const tip = place(joint, directions[1], lengths[1]!);
  next[midIndex] = { ...mid, ...joint };
  next[endIndex] = { ...end, ...tip };
  return next;
}

/** The limbs a writer may describe. Each is [upper, lower]: upper arm + forearm, thigh + shin. */
export type PoseLimbsSpec = {
  right_arm?: LimbDirections;
  left_arm?: LimbDirections;
  right_leg?: LimbDirections;
  left_leg?: LimbDirections;
};

const LIMB_KEYS = ['right_arm', 'left_arm', 'right_leg', 'left_leg'] as const;
const DIRECTION_SET: ReadonlySet<string> = new Set(LIMB_DIRECTIONS);

/** Accept only known limbs and directions from an LLM; undefined when nothing usable. */
export function normalizePoseLimbs(raw: unknown): PoseLimbsSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const word = (value: unknown) =>
    typeof value === 'string'
      ? value
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_')
      : '';
  const spec: PoseLimbsSpec = {};
  for (const key of LIMB_KEYS) {
    const value = record[key] ?? record[key.replace('_', '')] ?? record[key.replace('_', ' ')];
    const pair = Array.isArray(value)
      ? value.map(word)
      : typeof value === 'string'
        ? value.split(/[,/>]+/).map(word)
        : [];
    const [upper, lower] = pair;
    if (upper && DIRECTION_SET.has(upper)) {
      spec[key] = [
        upper as LimbDirection,
        (lower && DIRECTION_SET.has(lower) ? lower : upper) as LimbDirection,
      ];
    }
  }
  return Object.keys(spec).length > 0 ? spec : undefined;
}
