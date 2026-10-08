/**
 * Pose match: how closely a finished still's body pose follows the Image 3 guide.
 *
 * ComfyUI's DWPose preprocessor (comfyui_controlnet_aux) reads the pose back out of the still;
 * this module parses that and scores it against the guide's own keypoints. Pure — detection
 * lives in `pose-detect-server.ts` behind `/api/pose-score`.
 *
 * The check (`limb-angle`, {@link POSE_SCORE_METHOD}) compares the direction each limb points
 * (`pose-limb-score.ts`) and the posture class of each body (`pose-posture.ts`): a still that
 * is framed, sized or cropped differently but holds the same posture passes; one sitting where
 * the guide lies down, or standing where it kneels, misses whatever its limbs score. The old
 * joint-distance score (skeletons aligned, then joint-by-joint distance) is kept on every result
 * as `jointScore` for comparison.
 */

import type { GestureVerdict } from '@/lib/pose-gesture';
import type { NormalizedBody } from '@/lib/pose-library';
import { scoreLimbAngles, type LimbDelta, type LimbPart } from '@/lib/pose-limb-score';
import {
  classifyPosture,
  postureMismatch,
  postureUnsure,
  postureWord,
  withoutEdgeJoints,
  type PostureRead,
} from '@/lib/pose-posture';

type Point = { x: number; y: number };

/** `/api/pose-detect` reply: `available: false` when the DWPose node pack is missing. */
export type PoseDetectResult =
  { available: true; pose: DetectedPose } | { available: false; reason: string };

export type DetectedPose = {
  canvas: { width: number; height: number };
  /** Detected people, normalized 0–1 of the still. */
  people: NormalizedBody[];
  /**
   * Per person (same order as `people`): hand keypoints, when the detector read hands. Points
   * may lie outside 0–1 (a hand guessed off the frame) — the gesture check drops those.
   */
  hands?: DetectedHands[];
};

/** One person's hand keypoints, 0–1 of the still; null for a hand not found. */
export type DetectedHands = {
  left: Array<{ x: number; y: number }> | null;
  right: Array<{ x: number; y: number }> | null;
};

/** Body joints compared: nose, neck, shoulders, elbows, wrists, hips, knees, ankles. */
const SCORED_JOINTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

/** Joints counted toward "this person was found" (a torso plus some limbs). */
const SCORED_LIMBS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [1, 5],
  [2, 3],
  [3, 4],
  [5, 6],
  [6, 7],
  [1, 8],
  [8, 9],
  [9, 10],
  [1, 11],
  [11, 12],
  [12, 13],
];

/**
 * Tolerance, in guide torso lengths: a joint this far from where the guide put it scores
 * e^-1 ≈ 0.37. Chosen so detection jitter on the same pose stays ≈ 0.95 while a kept standing
 * pose against a walking / reaching / lying guide falls well under the 0.6 gate.
 */
const JOINT_SIGMA = 0.35;

/** L/R swap for COCO-18 (detectors disagree with the guide on which side is which in profile). */
const MIRROR_INDEX = [0, 1, 5, 6, 7, 2, 3, 4, 11, 12, 13, 8, 9, 10, 15, 14, 17, 16] as const;

/** Fewer shared limbs than this and the person is treated as not found. */
const MIN_SHARED_LIMBS = 4;

/** Fewer shared joints than this and a body can't be scored. */
const MIN_SHARED_JOINTS = 6;

function parseBody(
  raw: unknown,
  width: number,
  height: number,
  normalized: boolean
): NormalizedBody | null {
  if (!Array.isArray(raw) || raw.length < 18 * 3) {
    return null;
  }
  const body: NormalizedBody = [];
  for (let i = 0; i < 18; i += 1) {
    const x = Number(raw[i * 3]);
    const y = Number(raw[i * 3 + 1]);
    const c = Number(raw[i * 3 + 2]);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      c <= 0 ||
      x < 0 ||
      y < 0 ||
      (x === 0 && y === 0)
    ) {
      body.push(null);
      continue;
    }
    body.push(normalized ? { x, y } : { x: x / width, y: y / height });
  }
  return body.some(Boolean) ? body : null;
}

/**
 * Parse controlnet_aux `openpose_json` (a JSON string or object; a single frame or a list of
 * frames — the first is used). Handles both normalized and pixel coordinates.
 */
export function parseOpenPoseJson(raw: unknown): DetectedPose | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    value = value[0];
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const frame = value as {
    people?: Array<{
      pose_keypoints_2d?: unknown;
      hand_left_keypoints_2d?: unknown;
      hand_right_keypoints_2d?: unknown;
    }>;
    canvas_width?: number;
    canvas_height?: number;
  };
  const width = Number(frame.canvas_width) || 0;
  const height = Number(frame.canvas_height) || 0;
  const rows = Array.isArray(frame.people) ? frame.people : [];
  const coords = rows.flatMap(row =>
    Array.isArray(row.pose_keypoints_2d) ? (row.pose_keypoints_2d as unknown[]) : []
  );
  const xy = coords
    .filter((_, i) => i % 3 !== 2)
    .map(Number)
    .filter(n => Number.isFinite(n));
  // Some builds emit 0–1, others pixels; pixels need a canvas to normalize against.
  const normalized = xy.length > 0 && xy.every(n => n <= 1.5);
  if (!normalized && !(width > 0 && height > 0)) {
    return null;
  }
  const parsed = rows
    .map(row => ({
      body: parseBody(row.pose_keypoints_2d, width, height, normalized),
      hands: {
        left: parseHand(row.hand_left_keypoints_2d, width, height, normalized),
        right: parseHand(row.hand_right_keypoints_2d, width, height, normalized),
      },
    }))
    .filter((entry): entry is { body: NormalizedBody; hands: DetectedHands } =>
      Boolean(entry.body)
    );
  const people = parsed.map(entry => entry.body);
  // Hands only when the detector ran with hand detection (aligned with `people`).
  const anyHands = parsed.some(entry => entry.hands.left || entry.hands.right);
  return anyHands
    ? { canvas: { width, height }, people, hands: parsed.map(entry => entry.hands) }
    : { canvas: { width, height }, people };
}

/** One hand's confident keypoints (21 in DWPose), normalized; null when none were found. */
function parseHand(
  raw: unknown,
  width: number,
  height: number,
  normalized: boolean
): Array<{ x: number; y: number }> | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 2 < raw.length; i += 3) {
    const x = Number(raw[i]);
    const y = Number(raw[i + 1]);
    const c = Number(raw[i + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || c <= 0 || (x === 0 && y === 0)) continue;
    if (!normalized && !(width > 0 && height > 0)) return null;
    points.push(normalized ? { x, y } : { x: x / width, y: y / height });
  }
  return points.length > 0 ? points : null;
}

/**
 * 0–1 similarity of one detected body to one guide body, or null when too few joints overlap.
 *
 * Aligns the detected skeleton onto the guide (best translation + uniform scale, in true pixel
 * proportions), then scores each shared joint by how far it lands from the guide joint, in guide
 * torso lengths: `exp(-(d / σ)²)`. Framing and size differences drop out; a different body pose
 * does not. Takes the better of as-is and L/R-swapped (detectors and guides disagree on sides in
 * profile and back views).
 */
export function scoreBodyMatch(
  guide: NormalizedBody,
  detected: NormalizedBody,
  aspects: { guide: number; detected: number }
): number | null {
  const neck = guide[1];
  const hips = [guide[8], guide[11]].filter((p): p is Point => Boolean(p));
  if (!neck || hips.length === 0) {
    return null;
  }
  const midHip = {
    x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
    y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length,
  };
  const torso = Math.hypot((midHip.x - neck.x) * aspects.guide, midHip.y - neck.y);
  if (torso < 1e-4) {
    return null;
  }
  const scoreWith = (map: readonly number[]) => {
    const pairs = SCORED_JOINTS.flatMap(index => {
      const g = guide[index];
      const d = detected[map[index]!];
      return g && d
        ? [
            {
              g: { x: g.x * aspects.guide, y: g.y },
              d: { x: d.x * aspects.detected, y: d.y },
            },
          ]
        : [];
    });
    if (pairs.length < MIN_SHARED_JOINTS) {
      return null;
    }
    const mean = (points: Point[]) => ({
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    });
    const cg = mean(pairs.map(pair => pair.g));
    const cd = mean(pairs.map(pair => pair.d));
    let cross = 0;
    let norm = 0;
    for (const { g, d } of pairs) {
      cross += (g.x - cg.x) * (d.x - cd.x) + (g.y - cg.y) * (d.y - cd.y);
      norm += (d.x - cd.x) ** 2 + (d.y - cd.y) ** 2;
    }
    const scale = norm > 1e-9 ? Math.max(0, cross / norm) : 1;
    let sum = 0;
    for (const { g, d } of pairs) {
      const dx = g.x - cg.x - scale * (d.x - cd.x);
      const dy = g.y - cg.y - scale * (d.y - cd.y);
      const distance = Math.hypot(dx, dy) / torso;
      sum += Math.exp(-((distance / JOINT_SIGMA) ** 2));
    }
    return sum / pairs.length;
  };
  const identity = [...Array(18).keys()];
  const straight = scoreWith(identity);
  const swapped = scoreWith(MIRROR_INDEX);
  if (straight == null) return swapped;
  if (swapped == null) return straight;
  return Math.max(straight, swapped);
}

/**
 * Which score drives the pose check. `limb-angle` (limb directions + posture class) replaced
 * `joint-distance` (aligned joint positions, {@link scoreBodyMatch}) after the 2026-10 calibration
 * below; flip it back to compare — the other score is still on every result.
 */
export type PoseScoreMethod = 'limb-angle' | 'joint-distance';
export const POSE_SCORE_METHOD: PoseScoreMethod = 'limb-angle';

/** One guide person's posture against the body matched to it. */
export type PosturePair = {
  guide: PostureRead;
  /** Null when no detected body matched this guide person. */
  still: PostureRead | null;
  /** Confident reads in incompatible groups (lying vs sitting, standing vs kneeling…). */
  mismatch: boolean;
  /**
   * The guide's posture is clear but the still's read is a guess in another group: worth the
   * vision model's posture question (`pose-posture-question.ts`).
   */
  unsure: boolean;
};

export type PoseMatchResult = {
  /**
   * The pose check's score (0–1), by {@link POSE_SCORE_METHOD}. Limb-angle: the verdict (posture,
   * gesture, missing person) puts it under or over {@link DEFAULT_MIN_POSE_MATCH}, the limb score
   * places it within that band ({@link limbVerdictScore}).
   */
  score: number;
  method: PoseScoreMethod;
  /** Old joint-distance score (mean over guide people), kept for comparison. */
  jointScore: number;
  /** Limb-angle score (mean over guide people) before any posture cap. */
  limbScore: number;
  expectedPeople: number;
  detectedPeople: number;
  /**
   * Bodies in the still beyond what the guide drew (a third person in a duo, a stranger beside
   * a solo). Counts only bodies that fill a real share of the frame, so background passers-by
   * and stray limb fragments don't count.
   */
  extraPeople: number;
  /** Per guide person (lead first); null = no detected body matched it. */
  perPerson: Array<number | null>;
  /** For each guide person, the detected index it matched (or -1). */
  assignment: number[];
  /** Per guide person: posture read of the guide and of its matched body. */
  posture: PosturePair[];
  /** Some guide person's matched body is in another posture: a miss whatever the angles say. */
  postureMiss: boolean;
  /**
   * No miss called, but a posture read is unsure in another group. The vision posture question
   * (`pose-posture-question.ts`) is asked whenever the lead's still read is unsure.
   */
  postureUnsure: boolean;
  /**
   * Some guide person's matched body holds three or more of the guide's defining segments far
   * elsewhere (both raised arms down, the kicking leg planted…). Reported only — it isn't a
   * reliable miss (see `GESTURE_MISS_COUNT`).
   */
  gestureMiss: boolean;
  /**
   * The beat's gesture (hands vs the guide + the vision model's action questions), when it was
   * checked (`applyGestureVerdict` in `pose-gesture.ts`). A miss also puts `score` in the miss band.
   */
  gestureCheck?: GestureVerdict;
  /** The lead's segments that point clearly elsewhere than the guide's, worst first. */
  offLimbs: LimbPart[];
  /** The lead's per-segment direction differences. */
  limbDeltas: LimbDelta[];
};

function permutations(items: number[], size: number): number[][] {
  if (size === 0) return [[]];
  const out: number[][] = [];
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest, size - 1)) {
      out.push([item, ...tail]);
    }
  });
  return out;
}

function limbCount(body: NormalizedBody): number {
  return SCORED_LIMBS.filter(([a, b]) => body[a] && body[b]).length;
}

/**
 * How much of the frame a detected person fills: the diagonal of their visible keypoints (so a
 * lying pose counts as much as a standing one), aspect-corrected. Bystanders in the background
 * are small; a fragment with under two limbs counts for little.
 */
function prominence(body: NormalizedBody, aspect: number): number {
  const points = body.filter((point): point is Point => Boolean(point));
  if (points.length < 3) return 0;
  const xs = points.map(point => point.x * aspect);
  const ys = points.map(point => point.y);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return limbCount(body) >= 2 ? diagonal : diagonal * 0.25;
}

/** A body counts toward the headcount from two limbs and about a third of the frame's diagonal. */
const HEADCOUNT_MIN_LIMBS = 2;
const HEADCOUNT_MIN_PROMINENCE = 0.3;

/**
 * People clearly in the still. Live (2026-10-01, 19 two-women stills): flagged 3 of 5 with a
 * third person and 0 of 14 correct ones — it under-counts (a face behind a body, a lone head),
 * never over-counted, so only "more than expected" is acted on.
 */
export function countProminentPeople(detected: DetectedPose): number {
  const aspect =
    detected.canvas.width > 0 && detected.canvas.height > 0
      ? detected.canvas.width / detected.canvas.height
      : 1;
  return detected.people.filter(
    body =>
      limbCount(body) >= HEADCOUNT_MIN_LIMBS && prominence(body, aspect) >= HEADCOUNT_MIN_PROMINENCE
  ).length;
}

/**
 * Score a detected pose against the guide. Guide people are matched to detected people by the
 * best overall assignment among the same number of largest detections (≤3), so a partner on the
 * other side of the frame still pairs with the right skeleton and bystanders are ignored.
 */
export function scorePoseMatch(input: {
  guide: NormalizedBody[];
  guideAspect: number;
  detected: DetectedPose;
  /** Defaults to {@link POSE_SCORE_METHOD}. */
  method?: PoseScoreMethod;
}): PoseMatchResult {
  const method = input.method ?? POSE_SCORE_METHOD;
  const detectedAspect =
    input.detected.canvas.width > 0 && input.detected.canvas.height > 0
      ? input.detected.canvas.width / input.detected.canvas.height
      : input.guideAspect;
  const aspects = { guide: input.guideAspect, detected: detectedAspect };
  const guide = input.guide.slice(0, 3);
  // Only as many detections as the guide has people, largest first — otherwise a small bystander
  // in the background could "match" the guide better than the lead and inflate the score.
  const candidates = input.detected.people
    .map((body, index) => ({ body, index, size: prominence(body, detectedAspect) }))
    .sort((a, b) => b.size - a.size)
    .slice(0, Math.max(1, Math.min(3, input.guide.length)));
  const joint = guide.map(g => candidates.map(c => scoreBodyMatch(g, c.body, aspects)));
  // Limb angles and posture skip joints clamped onto the frame edge (cropped legs).
  const seen = candidates.map(c => withoutEdgeJoints(c.body));
  const limb = guide.map(g => seen.map(body => scoreLimbAngles(g, body, aspects)));
  const matrix =
    method === 'limb-angle' ? limb.map(row => row.map(match => match?.score ?? null)) : joint;
  const slots = Math.min(guide.length, candidates.length);
  let best: { total: number; picks: number[] } = { total: -1, picks: [] };
  for (const guideOrder of permutations([...guide.keys()], slots)) {
    for (const candOrder of permutations([...candidates.keys()], slots)) {
      let total = 0;
      const picks = guide.map(() => -1);
      guideOrder.forEach((g, i) => {
        const c = candOrder[i]!;
        total += matrix[g]![c] ?? 0;
        picks[g] = c;
      });
      if (total > best.total) {
        best = { total, picks };
      }
    }
  }
  const pick = (g: number) => best.picks[g] ?? -1;
  const meanOver = (values: Array<number | null>) =>
    guide.length === 0
      ? 0
      : values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / guide.length;
  const jointPer = guide.map((_, g) => (pick(g) >= 0 ? (joint[g]![pick(g)] ?? null) : null));
  const limbPer = guide.map((_, g) => (pick(g) >= 0 ? (limb[g]![pick(g)]?.score ?? null) : null));
  const posture = guide.map((body, g): PosturePair => {
    const guideRead = classifyPosture(body, input.guideAspect);
    const c = pick(g);
    const stillRead = c >= 0 ? classifyPosture(seen[c]!, detectedAspect) : null;
    return {
      guide: guideRead,
      still: stillRead,
      mismatch: stillRead ? postureMismatch(guideRead, stillRead) : false,
      unsure: stillRead ? postureUnsure(guideRead, stillRead) : false,
    };
  });
  const postureMiss = posture.some(pair => pair.mismatch);
  const gestureMiss = guide.some((_, g) => pick(g) >= 0 && limb[g]![pick(g)]?.gestureMiss === true);
  const jointScore = meanOver(jointPer);
  // Over the people actually read: DWPose under-counts (a partner hidden behind the lead), and
  // a missing body is never acted on here — the headcount checks report it.
  const readLimbs = limbPer.filter((value): value is number => value !== null);
  const limbScore =
    readLimbs.length > 0 ? readLimbs.reduce((sum, value) => sum + value, 0) / readLimbs.length : 0;
  // Nobody found: a miss, as before. Somebody found but too little of them read to compare
  // (a dim still, a body mostly out of frame): no verdict — it sits on the gate and passes.
  const anyone = guide.some((_, g) => pick(g) >= 0);
  const score =
    method !== 'limb-angle'
      ? jointScore
      : readLimbs.length > 0
        ? limbVerdictScore(limbScore, postureMiss)
        : anyone && !postureMiss
          ? LIMB_ANGLE_MIN_POSE_MATCH
          : 0;
  const lead = pick(0) >= 0 ? limb[0]![pick(0)] : null;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    score: round(score),
    method,
    jointScore: round(jointScore),
    limbScore: round(limbScore),
    gestureMiss,
    expectedPeople: guide.length,
    detectedPeople: input.detected.people.filter(body => limbCount(body) >= MIN_SHARED_LIMBS)
      .length,
    extraPeople: Math.max(0, countProminentPeople(input.detected) - input.guide.length),
    perPerson: method === 'limb-angle' ? limbPer : jointPer,
    assignment: guide.map((_, g) => (pick(g) >= 0 ? candidates[pick(g)]!.index : -1)),
    posture,
    postureMiss,
    postureUnsure: !postureMiss && posture.some(pair => pair.unsure),
    offLimbs: lead?.off ?? [],
    limbDeltas: lead?.limbs ?? [],
  };
}

/** Old joint-distance gate: below it a still missed its guide. */
export const JOINT_DISTANCE_MIN_POSE_MATCH = 0.6;

/**
 * Limb-angle gate. The limb-angle check decides by verdict, not by a cut on the angle score:
 * a still misses when its posture differs from the guide's (sitting where the guide lies down,
 * standing where it kneels) — confident keypoint reads, or the vision model saying "no" to the
 * guide's posture when the still's read is unsure (`pose-posture-question.ts`) — or when nobody
 * was found. The score carries that verdict across the gate: a hit
 * maps the limb score into [gate, 1], a miss into [0, gate × 0.8], so every consumer comparing a
 * stored score with the gate (Day review, redo, Story, Outfit review, the Gallery badge,
 * best-take restore) keeps working, and a closer still scores higher on its side. A body found
 * but too little of it read to compare sits on the gate (no verdict).
 *
 * Calibrated 2026-10-03 (scripts/pose-check-calibrate.mts) on 206 stills judged by eye against
 * their intended pose — 39 wrong, 167 right: the Rapid 2026-10-01 sweep before the recipe fix
 * (62) and after it (74), Qwen-Image 2.1 without a map (61), live Day lying stills (9):
 *
 *   check                               caught wrong   precision   false alarms on right
 *   joint-distance < 0.6 (old gate)     26/39 (67%)        21%        96/167 (57%)
 *   joint-distance < 0.4                13/39 (33%)        22%        45/167 (27%)
 *   limb-angle score alone < 0.5        13/39 (33%)        29%        32/167 (19%)
 *   limb-angle score alone < 0.3         5/39 (13%)        38%         8/167  (5%)
 *   3+ defining segments 110°+ off       1/39  (3%)        25%         3/167  (2%)
 *   posture class (this check)           6/39 (15%)        75%         2/167  (1%)
 *
 * The old score's precision (21%) is the base rate (39/206 = 19%): it flagged at random. Of the
 * 15 wrong stills whose posture was wrong (sat / knelt / stood instead), the check catches 5; the
 * other 24 wrong ones kept the posture and missed a gesture (an arm left down for cook, drink,
 * point, selfie) — no 2D-skeleton cut separated those from right stills' natural variation, so
 * they're left to the gesture check (`pose-gesture.ts`: the beat's action asked of the vision
 * model, 93% of gesture misses caught at 4% false alarms). Raise recall here only with new
 * labelled data.
 */
export const LIMB_ANGLE_MIN_POSE_MATCH = 0.5;
export const DEFAULT_MIN_POSE_MATCH =
  POSE_SCORE_METHOD === 'limb-angle' ? LIMB_ANGLE_MIN_POSE_MATCH : JOINT_DISTANCE_MIN_POSE_MATCH;

/** Top of the miss band (a miss never scores above this). */
export const POSE_MISS_SCORE_CAP = Math.round(LIMB_ANGLE_MIN_POSE_MATCH * 0.8 * 100) / 100;

/** Limb score (0–1) and verdict → the one 0–1 pose score consumers compare with the gate. */
export function limbVerdictScore(limbScore: number, miss: boolean): number {
  const limb = Math.max(0, Math.min(1, limbScore));
  return miss
    ? limb * POSE_MISS_SCORE_CAP
    : LIMB_ANGLE_MIN_POSE_MATCH + (1 - LIMB_ANGLE_MIN_POSE_MATCH) * limb;
}

/**
 * A kept still at or above this is good enough to add its detected pose to the library
 * (limb-angle: a hit whose limbs score ≥ 0.7).
 */
export const POSE_LIBRARY_MIN_SCORE =
  POSE_SCORE_METHOD === 'limb-angle' ? limbVerdictScore(0.7, false) : 0.8;

/**
 * The first posture miss in words, for the miss panel and the redo nudge
 * (`{ guide: 'lying on the back', still: 'sitting' }`); null when no posture differs.
 */
export function posturePairWords(
  result: Pick<PoseMatchResult, 'posture'> | null | undefined
): { guide: string; still: string } | null {
  const pair = result?.posture.find(entry => entry.mismatch && entry.still);
  return pair?.still
    ? { guide: postureWord(pair.guide.posture), still: postureWord(pair.still.posture) }
    : null;
}

/** One readable line for the Day status strip / slot badge. */
export function describePoseMatch(result: PoseMatchResult): string {
  const pct = Math.round(result.score * 100);
  const heads =
    result.detectedPeople !== result.expectedPeople
      ? ` · ${result.detectedPeople} of ${result.expectedPeople} people found`
      : '';
  if (result.extraPeople > 0) {
    return `pose match ${pct}% · ${result.expectedPeople + result.extraPeople} people in frame, expected ${result.expectedPeople}`;
  }
  const posture = result.postureMiss ? posturePairWords(result) : null;
  if (posture) {
    return `pose match ${pct}% · ${posture.still}, guide ${posture.guide}${heads}`;
  }
  const missed = result.gestureCheck?.miss ? result.gestureCheck.missed : null;
  if (missed) {
    return `pose match ${pct}% · missed: ${missed}${heads}`;
  }
  return `pose match ${pct}%${heads}`;
}

/** Prompt nudge for a still that ignored its guide. */
export const POSE_MISMATCH_NUDGE =
  'Match the Image 3 skeleton exactly — torso angle, both arms and both legs; do not keep the Image 1 standing pose.';

const WORD_POSTURES: ReadonlyArray<
  [RegExp, 'standing' | 'sitting' | 'kneeling' | 'lying' | 'all-fours']
> = [
  [/\bon (?:all fours|her hands and knees|his hands and knees)\b/i, 'all-fours'],
  [/\b(?:lies|lying|lie down|lay|on (?:her|his) (?:back|stomach|side))\b/i, 'lying'],
  [/\b(?:kneels|kneeling|on (?:her|his) knees)\b/i, 'kneeling'],
  [/\b(?:sits|sitting|seated|perche[sd]|perching|straddl\w*)\b/i, 'sitting'],
  [/\b(?:stands|standing)\b/i, 'standing'],
];

function postureGroup(posture: string): string {
  return posture.startsWith('lying') ? 'lying' : posture;
}

/**
 * The pose map's lead posture contradicts the posture the scene's own words give (a standing
 * guide for "she sits on the edge of the sink"). The words win the render, so a "pose miss"
 * against that map is the map's fault: a redo nudged "Fix the pose: body standing" onto a
 * sitting beat (2026-10-08). Null words or no stated posture: no contradiction.
 */
export function guidePostureContradictsWords(
  match: Pick<PoseMatchResult, 'posture'> | null | undefined,
  words: string | null | undefined
): boolean {
  const guide = match?.posture?.[0]?.guide?.posture;
  if (!guide || !words) return false;
  const stated = WORD_POSTURES.find(([re]) => re.test(words))?.[1];
  if (!stated) return false;
  return postureGroup(guide) !== stated;
}
