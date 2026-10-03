/**
 * Limb-angle pose match (pure): compares a still's body to its guide limb by limb, by the
 * direction each body segment points — upper / lower arms, thighs, shins, the torso's tilt, the
 * shoulder line and the head. Directions don't change with where the body sits in the frame or
 * how big it is, so a small figure, a wide shot or a different crop scores the same as a close
 * one; what moves the score is a limb pointing somewhere else.
 *
 * - Joints missing in either body are skipped (DWPose reports a joint or nothing).
 * - A segment foreshortened in one body (pointing at the camera) but not the other counts as off
 *   by {@link FORESHORTEN_DELTA_DEG}; foreshortened in both, it is skipped.
 * - Legs and torso weigh more than arms: they carry the posture.
 * - Sides: the detector's left / right labels may be swapped (back views, profiles), so the
 *   better of as-labelled and swapped is used. A horizontally mirrored pose (lying head-left vs
 *   head-right, bending the other way) is accepted with a penalty that grows with how
 *   one-sided the guide is: free for a symmetric guide, costly when only one arm is raised.
 */

import type { NormalizedBody } from '@/lib/pose-library';
import { bodyReferenceLength } from '@/lib/pose-posture';

type Point = { x: number; y: number };

export type LimbPart =
  | 'torso'
  | 'shoulders'
  | 'head'
  | 'right upper arm'
  | 'right forearm'
  | 'left upper arm'
  | 'left forearm'
  | 'right thigh'
  | 'right shin'
  | 'left thigh'
  | 'left shin';

type Segment = { part: LimbPart; from: number | 'hip'; to: number; weight: number };

/** COCO-18: 0 nose, 1 neck, 2–4 right arm, 5–7 left arm, 8–10 right leg, 11–13 left leg. */
const SEGMENTS: readonly Segment[] = [
  { part: 'torso', from: 'hip', to: 1, weight: 3 },
  { part: 'shoulders', from: 2, to: 5, weight: 1 },
  { part: 'head', from: 1, to: 0, weight: 0.5 },
  { part: 'right upper arm', from: 2, to: 3, weight: 1 },
  { part: 'right forearm', from: 3, to: 4, weight: 0.75 },
  { part: 'left upper arm', from: 5, to: 6, weight: 1 },
  { part: 'left forearm', from: 6, to: 7, weight: 0.75 },
  { part: 'right thigh', from: 8, to: 9, weight: 2 },
  { part: 'right shin', from: 9, to: 10, weight: 1.5 },
  { part: 'left thigh', from: 11, to: 12, weight: 2 },
  { part: 'left shin', from: 12, to: 13, weight: 1.5 },
];

/** Left / right swap for COCO-18. */
const SWAP = [0, 1, 5, 6, 7, 2, 3, 4, 11, 12, 13, 8, 9, 10, 15, 14, 17, 16] as const;

/** Per-segment tolerance: a segment this many degrees off scores e^-1 ≈ 0.37. */
export const LIMB_SIGMA_DEG = 40;
/** A segment at least this many degrees off is named in "which limbs are off". */
export const LIMB_OFF_DEG = 45;
/** Shorter than this share of the body's reference length = pointing at the camera. */
const FORESHORTENED = 0.22;
/** Clearly not foreshortened above this share (between the two: compared as drawn). */
const NOT_FORESHORTENED = 0.45;
/** Delta charged when a segment points at the camera in one body only. */
const FORESHORTEN_DELTA_DEG = 60;
/** Most a fully one-sided guide's mirrored match loses. */
const MIRROR_PENALTY = 0.25;
/** Fewer compared segments than this (the torso among them) and the body can't be scored. */
const MIN_SEGMENTS = 4;

export type LimbDelta = {
  part: LimbPart;
  /** Direction difference, degrees (0–180). */
  deltaDeg: number;
  weight: number;
  /** How much this segment defines the guide's pose (0 neutral – 1 clearly posed). */
  defining?: number;
};

export type LimbAngleMatch = {
  /** 0–1 weighted similarity. */
  score: number;
  /** Per compared segment, as matched (after any side swap / mirror). */
  limbs: LimbDelta[];
  /** Segments at least {@link LIMB_OFF_DEG} off, worst first. */
  off: LimbPart[];
  /**
   * Segments the guide clearly poses (a raised arm, a lifted knee, a bent torso) that the still
   * holds somewhere else — the gesture itself is missing. Worst first.
   */
  definingOff: LimbPart[];
  /** {@link GESTURE_MISS_COUNT} or more defining segments are off: the pose is not there. */
  gestureMiss: boolean;
  /** Matched as a horizontal mirror of the guide. */
  mirrored: boolean;
};

type Vec = { x: number; y: number; len: number };

function segmentVectors(body: NormalizedBody, aspect: number): Map<LimbPart, Vec> {
  const p = (index: number): Point | null => {
    const point = body[index];
    return point ? { x: point.x * aspect, y: point.y } : null;
  };
  const hips = [p(8), p(11)].filter((point): point is Point => point !== null);
  const hip =
    hips.length > 0
      ? {
          x: hips.reduce((sum, point) => sum + point.x, 0) / hips.length,
          y: hips.reduce((sum, point) => sum + point.y, 0) / hips.length,
        }
      : null;
  const out = new Map<LimbPart, Vec>();
  for (const segment of SEGMENTS) {
    const a = segment.from === 'hip' ? hip : p(segment.from);
    const b = p(segment.to);
    if (!a || !b) continue;
    const x = b.x - a.x;
    const y = b.y - a.y;
    out.set(segment.part, { x, y, len: Math.hypot(x, y) });
  }
  return out;
}

function angleBetweenDeg(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const cos = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (la * lb)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function relabel(body: NormalizedBody, map: readonly number[]): NormalizedBody {
  return Array.from({ length: Math.max(18, body.length) }, (_, i) => body[map[i] ?? i] ?? null);
}

function reflect(body: NormalizedBody): NormalizedBody {
  return body.map(point => (point ? { x: 1 - point.x, y: point.y } : null));
}

function compare(
  guide: Map<LimbPart, Vec>,
  guideRef: number,
  still: Map<LimbPart, Vec>,
  stillRef: number,
  weightOf: (segment: Segment) => number = segment => segment.weight
): { score: number; limbs: LimbDelta[] } | null {
  const limbs: LimbDelta[] = [];
  for (const segment of SEGMENTS) {
    const g = guide.get(segment.part);
    const s = still.get(segment.part);
    if (!g || !s) continue;
    const weight = weightOf(segment);
    const gShare = g.len / guideRef;
    const sShare = s.len / stillRef;
    const gShort = gShare < FORESHORTENED;
    const sShort = sShare < FORESHORTENED;
    let delta: number;
    if (gShort && sShort) continue;
    if ((gShort && sShare > NOT_FORESHORTENED) || (sShort && gShare > NOT_FORESHORTENED)) {
      delta = FORESHORTEN_DELTA_DEG;
    } else {
      delta = angleBetweenDeg(g, s);
    }
    limbs.push({ part: segment.part, deltaDeg: Math.round(delta), weight });
  }
  if (limbs.length < MIN_SEGMENTS || !limbs.some(limb => limb.part === 'torso')) {
    return null;
  }
  let sum = 0;
  let weights = 0;
  for (const limb of limbs) {
    sum += limb.weight * Math.exp(-((limb.deltaDeg / LIMB_SIGMA_DEG) ** 2));
    weights += limb.weight;
  }
  return { score: sum / weights, limbs };
}

/**
 * How one-sided the guide is (0 symmetric – 1 fully one-sided): its own match against its
 * mirror image with the sides relabelled, i.e. a body that does the same with both arms and both
 * legs scores 0.
 */
export function guideAsymmetry(guide: NormalizedBody, aspect: number): number {
  const ref = bodyReferenceLength(guide, aspect);
  if (ref <= 0) return 1;
  const own = segmentVectors(guide, aspect);
  // Mirror the body about its own torso line: reflect, swap sides, and compare limbs relative to
  // the torso so a lying or leaning guide isn't "asymmetric" just for its tilt.
  const mirror = segmentVectors(relabel(reflect(guide), SWAP), aspect);
  const torso = own.get('torso');
  const mirrorTorso = mirror.get('torso');
  if (!torso || !mirrorTorso) return 1;
  const rotate = (v: Vec, from: Vec, to: Vec): Vec => {
    const angle = Math.atan2(to.y, to.x) - Math.atan2(from.y, from.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos, len: v.len };
  };
  const aligned = new Map<LimbPart, Vec>();
  for (const [part, v] of mirror) aligned.set(part, rotate(v, mirrorTorso, torso));
  const limbParts = new Map<LimbPart, Vec>();
  const limbAligned = new Map<LimbPart, Vec>();
  for (const [part, v] of own) {
    if (
      part.includes('arm') ||
      part.includes('thigh') ||
      part.includes('shin') ||
      part === 'torso'
    ) {
      limbParts.set(part, v);
      const m = aligned.get(part);
      if (m) limbAligned.set(part, m);
    }
  }
  const self = compare(limbParts, ref, limbAligned, ref);
  return self ? Math.max(0, Math.min(1, 1 - self.score)) : 1;
}

function isPosture(part: LimbPart): boolean {
  return part === 'torso' || part.includes('thigh') || part.includes('shin');
}

/** Share of an arm segment's weight kept when the guide holds it neutral (hanging). */
export const DEFINING_FLOOR = 0.3;
/** Degrees off neutral at which a guide segment counts fully as part of what the pose is. */
const DEFINING_FULL_DEG = 60;
/** A segment at least this defining… */
export const DEFINING_MISS_SHARE = 0.9;
/** …held at least this many degrees off is a missing piece of the pose. */
export const DEFINING_MISS_DEG = 110;
/**
 * This many missing pieces and the pose itself looks gone (arms down where both were raised,
 * legs straight where the guide kicks). Reported (`gestureMiss`), not acted on: in the 2026-10
 * calibration it fired on 1 of 39 wrong stills and 3 of 167 right ones (sport follow-throughs,
 * a climber's reach); one or two pieces off were as common on right stills as on wrong ones.
 */
export const GESTURE_MISS_COUNT = 3;

/**
 * How much each guide segment defines the pose (0–1): how far it is from a relaxed standing
 * body — torso upright, arms and legs hanging along it — with limbs measured in the torso's own
 * frame (so a lying guide's legs along its body are neutral, its torso tilt is not). A raised
 * arm, a lifted knee or a bent-over torso is what the guide asks for; an arm hanging at the side
 * is where stills vary naturally.
 */
function definingShares(guide: Map<LimbPart, Vec>): Map<LimbPart, number> {
  const out = new Map<LimbPart, number>();
  const torso = guide.get('torso');
  if (!torso) return out;
  const share = (deg: number) => Math.max(0, Math.min(1, deg / DEFINING_FULL_DEG));
  out.set('torso', share(angleBetweenDeg(torso, { x: 0, y: -1 })));
  const down = { x: -torso.x, y: -torso.y };
  for (const [part, v] of guide) {
    if (part === 'torso') continue;
    if (part === 'shoulders') {
      out.set(part, 0.5);
    } else if (part === 'head') {
      out.set(part, share(angleBetweenDeg(v, torso)));
    } else {
      out.set(part, share(angleBetweenDeg(v, down)));
    }
  }
  return out;
}

/**
 * Limb-angle match of one detected body against one guide body, or null when too few segments
 * are read in both (no torso, or under four segments).
 */
export function scoreLimbAngles(
  guide: NormalizedBody,
  detected: NormalizedBody,
  aspects: { guide: number; detected: number }
): LimbAngleMatch | null {
  const guideRef = bodyReferenceLength(guide, aspects.guide);
  if (guideRef <= 0) return null;
  const guideVectors = segmentVectors(guide, aspects.guide);
  const asymmetry = guideAsymmetry(guide, aspects.guide);
  const defining = definingShares(guideVectors);
  // Arms (and the head) vary most on right stills: a hanging arm counts little, a posed one
  // fully. Legs and torso always count in full — they carry the posture.
  const weightOf = (segment: Segment) =>
    isPosture(segment.part)
      ? segment.weight
      : segment.weight *
        (DEFINING_FLOOR + (1 - DEFINING_FLOOR) * (defining.get(segment.part) ?? 0));
  let best: (Omit<LimbAngleMatch, 'definingOff' | 'gestureMiss'> & { rank: number }) | null = null;
  for (const mirrored of [false, true]) {
    for (const swapped of [false, true]) {
      let body = mirrored ? reflect(detected) : detected;
      if (swapped) body = relabel(body, SWAP);
      const ref = bodyReferenceLength(body, aspects.detected);
      if (ref <= 0) continue;
      const result = compare(
        guideVectors,
        guideRef,
        segmentVectors(body, aspects.detected),
        ref,
        weightOf
      );
      if (!result) continue;
      const rank = result.score - (mirrored ? MIRROR_PENALTY * asymmetry : 0);
      if (!best || rank > best.rank) {
        best = {
          rank,
          score: Math.max(0, rank),
          limbs: result.limbs,
          off: [...result.limbs]
            .filter(limb => limb.deltaDeg >= LIMB_OFF_DEG)
            .sort((a, b) => b.deltaDeg * b.weight - a.deltaDeg * a.weight)
            .map(limb => limb.part),
          mirrored,
        };
      }
    }
  }
  if (!best) return null;
  const { rank: _rank, ...match } = best;
  const limbs = match.limbs.map(limb => ({
    ...limb,
    defining: Math.round((defining.get(limb.part) ?? 0) * 100) / 100,
  }));
  const definingOff = limbs
    .filter(limb => limb.defining >= DEFINING_MISS_SHARE && limb.deltaDeg >= DEFINING_MISS_DEG)
    .sort((a, b) => b.deltaDeg - a.deltaDeg)
    .map(limb => limb.part);
  return {
    ...match,
    limbs,
    definingOff,
    gestureMiss: definingOff.length >= GESTURE_MISS_COUNT,
  };
}
