/**
 * Posture class (pure): what a body is doing — standing, sitting, kneeling, crouching, lying (on
 * the back, side or front), bending, on all fours, upside down — read from DWPose / guide
 * keypoints, plus whether it has its back to the camera.
 *
 * The pose check uses it as a gross-error test the limb angles alone miss: a still sitting where
 * its guide lies down is a miss whatever the limbs score. Extends the plate check's stance read
 * (`plate-stance.ts`: hips against knees and ankles, the torso's tilt) with the lying, bending,
 * all-fours and upside-down cases and a confidence: a body near a class boundary, or one whose
 * torso points at the camera, is `confident: false`, and the check never calls a miss on it
 * (the optional vision question in `pose-posture-vision.ts` can settle it).
 */

import type { NormalizedBody } from '@/lib/pose-library';
import { KNEELING_SHIN_DROP, LYING_TILT_DEG, SEATED_KNEE_DROP } from '@/lib/plate-stance';

type Point = { x: number; y: number };

export type PostureClass =
  | 'standing'
  | 'sitting'
  | 'kneeling'
  | 'crouching'
  | 'lying-back'
  | 'lying-side'
  | 'lying-front'
  | 'bending'
  | 'all-fours'
  | 'upside-down'
  | 'unknown';

/** Coarse groups a posture miss is judged on (sub-types are too easy to misread from 2D). */
export type PostureGroup = 'upright' | 'bent' | 'seated' | 'low' | 'lying' | 'inverted' | 'unknown';

export type PostureFacing = 'camera' | 'away' | 'unknown';

export type PostureRead = {
  posture: PostureClass;
  group: PostureGroup;
  /** False near a class boundary or with key joints missing: never call a miss on it alone. */
  confident: boolean;
  facing: PostureFacing;
  /** Torso tilt from upright, degrees (0 upright, 90 horizontal, 180 upside down); null unread. */
  tiltDeg: number | null;
};

/** COCO-18 indices. */
const NOSE = 0;
const NECK = 1;
const R_SHOULDER = 2;
const L_SHOULDER = 5;
const R_HIP = 8;
const R_KNEE = 9;
const R_ANKLE = 10;
const L_HIP = 11;
const L_KNEE = 12;
const L_ANKLE = 13;
const R_EYE = 14;
const L_EYE = 15;

/** Torso tilted past this is upside down (handstand, inverted). */
const INVERTED_TILT_DEG = 150;
/** Within this many degrees of the lying / upright line the read is not confident. */
const TILT_MARGIN_DEG = 10;
/** A torso shorter than this share of the body's reference length points at the camera. */
const FORESHORTENED_TORSO = 0.6;
/** Bending: feet this far below the hips (reference lengths), legs near vertical. */
const BEND_FEET_DROP = 0.9;
const BEND_LEG_FROM_VERTICAL_DEG = 35;
/** All fours: knees this far below the hips with shins near horizontal. */
const ALL_FOURS_KNEE_DROP = 0.5;
/** Lying on the side: shoulder line shorter than this share of the reference length. */
const SIDE_SHOULDER_SHARE = 0.35;
/** Crouching: hip–knee–ankle angle under this on every read leg. */
const CROUCH_KNEE_ANGLE_DEG = 115;
/** Standing between ±this of a seated / kneeling cut-off reads as not confident. */
const DROP_MARGIN = 0.12;

const GROUP: Record<PostureClass, PostureGroup> = {
  standing: 'upright',
  bending: 'bent',
  sitting: 'seated',
  kneeling: 'low',
  crouching: 'low',
  'all-fours': 'low',
  'lying-back': 'lying',
  'lying-side': 'lying',
  'lying-front': 'lying',
  'upside-down': 'inverted',
  unknown: 'unknown',
};

/** A joint this close to the frame edge (share of the canvas) was clamped there, not seen. */
const FRAME_EDGE = 0.015;

/**
 * The body without joints DWPose clamped onto the frame edge: legs cut off by the bottom of a
 * waist-up still come back as knees and ankles on the last row, which would read as kneeling.
 */
export function withoutEdgeJoints(body: NormalizedBody): NormalizedBody {
  return body.map(point =>
    point &&
    point.x > FRAME_EDGE &&
    point.x < 1 - FRAME_EDGE &&
    point.y > FRAME_EDGE &&
    point.y < 1 - FRAME_EDGE
      ? point
      : null
  );
}

export function postureGroup(posture: PostureClass): PostureGroup {
  return GROUP[posture];
}

function mean(points: Array<Point | null>): Point | null {
  const found = points.filter((point): point is Point => point !== null);
  if (found.length === 0) return null;
  return {
    x: found.reduce((sum, point) => sum + point.x, 0) / found.length,
    y: found.reduce((sum, point) => sum + point.y, 0) / found.length,
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Angle of a→b from straight down, 0–180°. */
function fromDownDeg(a: Point, b: Point): number {
  const len = dist(a, b);
  if (len < 1e-9) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (b.y - a.y) / len))) * 180) / Math.PI;
}

function kneeAngleDeg(hip: Point, knee: Point, ankle: Point): number {
  const a = { x: hip.x - knee.x, y: hip.y - knee.y };
  const b = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const lengths = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  if (lengths === 0) return 180;
  const cos = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / lengths));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * The body's own size, robust to a torso pointing at the camera: the longest of the torso, the
 * thighs and the shoulder line (each scaled to a typical torso length).
 */
export function bodyReferenceLength(body: NormalizedBody, aspect: number): number {
  const p = (index: number) => {
    const point = body[index];
    return point ? { x: point.x * aspect, y: point.y } : null;
  };
  const neck = p(NECK);
  const hip = mean([p(R_HIP), p(L_HIP)]);
  const candidates: number[] = [];
  if (neck && hip) candidates.push(dist(neck, hip));
  for (const [h, k] of [
    [R_HIP, R_KNEE],
    [L_HIP, L_KNEE],
  ] as const) {
    const a = p(h);
    const b = p(k);
    if (a && b) candidates.push(dist(a, b) * 1.1);
  }
  const rs = p(R_SHOULDER);
  const ls = p(L_SHOULDER);
  if (rs && ls) candidates.push(dist(rs, ls) * 1.4);
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function facingOf(body: NormalizedBody, aspect: number, ref: number): PostureFacing {
  const rs = body[R_SHOULDER];
  const ls = body[L_SHOULDER];
  if (!rs || !ls || ref <= 0) return 'unknown';
  // DWPose labels the person's own sides: facing the camera their right shoulder is on the
  // image's left. Only a clear shoulder width counts (a profile view says nothing).
  const dx = (ls.x - rs.x) * aspect;
  if (Math.abs(dx) < 0.35 * ref) return 'unknown';
  const face = Boolean(body[NOSE] && (body[R_EYE] || body[L_EYE]));
  if (dx > 0) return face ? 'camera' : 'unknown';
  return face ? 'unknown' : 'away';
}

function read(
  posture: PostureClass,
  confident: boolean,
  facing: PostureFacing,
  tiltDeg: number | null
): PostureRead {
  return {
    posture,
    group: GROUP[posture],
    confident: posture !== 'unknown' && confident,
    facing,
    tiltDeg: tiltDeg === null ? null : Math.round(tiltDeg),
  };
}

/**
 * Read one body's posture from its keypoints (0–1 of a canvas `aspect` = width / height wide).
 */
export function classifyPosture(body: NormalizedBody, aspect: number): PostureRead {
  const p = (index: number) => {
    const point = body[index];
    return point ? { x: point.x * aspect, y: point.y } : null;
  };
  const ref = bodyReferenceLength(body, aspect);
  const facing = facingOf(body, aspect, ref);
  const neck = p(NECK) ?? p(NOSE);
  const hip = mean([p(R_HIP), p(L_HIP)]);
  if (!neck || !hip || ref <= 0) {
    return read('unknown', false, facing, null);
  }
  const torso = dist(neck, hip);
  // 0° = upright (neck straight above the hips), 180° = upside down.
  const tilt = 180 - fromDownDeg(hip, neck);
  const foreshortened = torso < FORESHORTENED_TORSO * ref;
  const legs = [
    { hip: p(R_HIP) ?? hip, knee: p(R_KNEE), ankle: p(R_ANKLE) },
    { hip: p(L_HIP) ?? hip, knee: p(L_KNEE), ankle: p(L_ANKLE) },
  ];
  const withKnee = legs.filter(leg => leg.knee !== null);
  const full = withKnee.filter(leg => leg.ankle !== null);
  const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

  if (tilt >= INVERTED_TILT_DEG && !foreshortened) {
    return read('upside-down', tilt >= INVERTED_TILT_DEG + TILT_MARGIN_DEG, facing, tilt);
  }

  if (tilt > LYING_TILT_DEG && !foreshortened) {
    const confidentTilt = tilt > LYING_TILT_DEG + TILT_MARGIN_DEG;
    if (full.length > 0) {
      const feetDrop = avg(full.map(leg => leg.ankle!.y - hip.y)) / ref;
      const legFromVertical = avg(full.map(leg => fromDownDeg(leg.hip, leg.ankle!)));
      if (feetDrop >= BEND_FEET_DROP && legFromVertical <= BEND_LEG_FROM_VERTICAL_DEG) {
        return read('bending', confidentTilt, facing, tilt);
      }
      const kneeDrop = avg(full.map(leg => leg.knee!.y - leg.hip.y)) / ref;
      const shinFromVertical = avg(full.map(leg => fromDownDeg(leg.knee!, leg.ankle!)));
      if (kneeDrop >= ALL_FOURS_KNEE_DROP && shinFromVertical >= 55) {
        return read(
          'all-fours',
          confidentTilt && kneeDrop >= ALL_FOURS_KNEE_DROP + DROP_MARGIN,
          facing,
          tilt
        );
      }
    }
    return read(lyingKind(body, aspect, ref), confidentTilt, facing, tilt);
  }

  // Torso (roughly) upright, or pointing at the camera.
  if (withKnee.length === 0) {
    return read(foreshortened ? 'unknown' : 'standing', false, facing, tilt);
  }
  // The supporting leg carries the posture: a knee lifted in a stride, a kick or a step up says
  // nothing about sitting. Knees: the lowest one; feet: the lowest ankle and its knee.
  const kneeDrop = Math.max(...withKnee.map(leg => leg.knee!.y - leg.hip.y)) / ref;
  const support = full.length > 0 ? full.reduce((a, b) => (b.ankle!.y > a.ankle!.y ? b : a)) : null;
  const feetDrop = support ? (support.ankle!.y - hip.y) / ref : null;
  if (foreshortened) {
    // Torso toward the camera (a push-up seen head-on, lying with the head nearest): only the
    // legs can tell, and only a clearly standing pair of legs is read.
    return feetDrop !== null && feetDrop >= 1.4 && kneeDrop >= 0.6
      ? read('standing', false, facing, tilt)
      : read('unknown', false, facing, tilt);
  }
  const nearTilt = tilt > LYING_TILT_DEG - TILT_MARGIN_DEG;
  if (kneeDrop < SEATED_KNEE_DROP) {
    // Both knees near hip height: seated (thighs level or toward the camera) — or a deep squat,
    // whose feet sit just under the hips rather than a shin's length below them.
    if (support && feetDrop !== null) {
      const angle = kneeAngleDeg(support.hip, support.knee!, support.ankle!);
      if (feetDrop > 0.25 && feetDrop < 0.75 && angle < 80) {
        return read('crouching', false, facing, tilt);
      }
    }
    return read('sitting', !nearTilt && kneeDrop < SEATED_KNEE_DROP - DROP_MARGIN, facing, tilt);
  }
  if (!support) {
    return read(tilt > 25 ? 'bending' : 'standing', false, facing, tilt);
  }
  // Kneeling: the lowest knee is about as low as the lowest foot (the knee is on the ground).
  const lowestKnee = Math.max(...withKnee.map(leg => leg.knee!.y));
  const shinDrop = (support.ankle!.y - lowestKnee) / ref;
  if (shinDrop < KNEELING_SHIN_DROP) {
    return read('kneeling', !nearTilt && shinDrop < KNEELING_SHIN_DROP - DROP_MARGIN, facing, tilt);
  }
  const angle = kneeAngleDeg(support.hip, support.knee!, support.ankle!);
  if (angle < CROUCH_KNEE_ANGLE_DEG) {
    return read('crouching', angle < CROUCH_KNEE_ANGLE_DEG - 15, facing, tilt);
  }
  const confidentStand =
    !nearTilt &&
    kneeDrop >= SEATED_KNEE_DROP + DROP_MARGIN &&
    shinDrop >= KNEELING_SHIN_DROP + DROP_MARGIN;
  // A lean between upright and bent over is never a confident read either way.
  return tilt > 25
    ? read('bending', false, facing, tilt)
    : read('standing', confidentStand && tilt <= 20, facing, tilt);
}

/** Lying sub-type: on the side (shoulders stacked), front (propped on the forearms) or back. */
function lyingKind(body: NormalizedBody, aspect: number, ref: number): PostureClass {
  const p = (index: number) => {
    const point = body[index];
    return point ? { x: point.x * aspect, y: point.y } : null;
  };
  const rs = p(R_SHOULDER);
  const ls = p(L_SHOULDER);
  const neck = p(NECK);
  // Propped on the forearms: both elbows under the shoulders and the head held above them
  // (checked first: seen from the side, a prone body's shoulders stack too).
  const elbows = [p(3), p(6)].filter((point): point is Point => point !== null);
  const shoulders = mean([rs, ls]);
  const nose = p(NOSE);
  if (
    shoulders &&
    neck &&
    nose &&
    elbows.length === 2 &&
    elbows.every(elbow => elbow.y > shoulders.y + 0.2 * ref) &&
    nose.y < neck.y - 0.1 * ref
  ) {
    return 'lying-front';
  }
  if (rs && ls && dist(rs, ls) < SIDE_SHOULDER_SHARE * ref) {
    return 'lying-side';
  }
  return 'lying-back';
}

/**
 * Do two posture reads disagree enough to call the still a miss? Only confident reads in
 * different coarse groups, and never seated against low (a squat, a kneel sitting back on the
 * heels and a seat on the floor read alike from 2D).
 */
export function postureMismatch(guide: PostureRead, still: PostureRead): boolean {
  if (!guide.confident || !still.confident) return false;
  return !postureGroupsAgree(guide.group, still.group);
}

/** Coarse groups that are never a posture miss against each other (sorted `a|b`). */
const COMPATIBLE_GROUPS = new Set(['low|seated']);

/** Two coarse groups that count as the same posture for the check. */
export function postureGroupsAgree(a: PostureGroup, b: PostureGroup): boolean {
  return a === b || COMPATIBLE_GROUPS.has([a, b].sort().join('|'));
}

/**
 * The guide's posture is clear, the still's read is a guess, and that guess is a different
 * posture: keypoints can't settle it (a reclined seat vs lying, legs hidden), the vision
 * question can.
 */
export function postureUnsure(guide: PostureRead, still: PostureRead): boolean {
  if (!guide.confident || still.confident || guide.group === 'unknown') return false;
  return !postureGroupsAgree(guide.group, still.group);
}

const POSTURE_WORD: Record<PostureClass, string> = {
  standing: 'standing',
  sitting: 'sitting',
  kneeling: 'kneeling',
  crouching: 'crouching',
  'lying-back': 'lying on the back',
  'lying-side': 'lying on the side',
  'lying-front': 'lying on the front',
  bending: 'bending over',
  'all-fours': 'on all fours',
  'upside-down': 'upside down',
  unknown: 'unclear',
};

/** Plain words for a posture ("lying on the back"). */
export function postureWord(posture: PostureClass): string {
  return POSTURE_WORD[posture];
}
