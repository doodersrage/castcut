/**
 * Pose match: how closely a finished still's body pose follows the Image 3 guide.
 *
 * ComfyUI's DWPose preprocessor (comfyui_controlnet_aux) reads the pose back out of the still;
 * this module parses that and scores it against the guide's own keypoints. Pure — detection
 * lives in `pose-detect-server.ts` behind `/api/pose-score`.
 *
 * The score aligns the two skeletons first (position and size drop out), then measures how far
 * each joint lands from the guide: a still that is framed or scaled differently but holds the
 * same body pose passes; one that kept Image 1's standing pose when the guide said "walk",
 * "reach" or "lie" does not.
 */

import type { NormalizedBody } from '@/lib/pose-library';

type Point = { x: number; y: number };

/** `/api/pose-detect` reply: `available: false` when the DWPose node pack is missing. */
export type PoseDetectResult =
  { available: true; pose: DetectedPose } | { available: false; reason: string };

export type DetectedPose = {
  canvas: { width: number; height: number };
  /** Detected people, normalized 0–1 of the still. */
  people: NormalizedBody[];
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
    people?: Array<{ pose_keypoints_2d?: unknown }>;
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
  const people = rows
    .map(row => parseBody(row.pose_keypoints_2d, width, height, normalized))
    .filter((body): body is NormalizedBody => Boolean(body));
  return { canvas: { width, height }, people };
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

export type PoseMatchResult = {
  /** Mean over guide people of their best-matched detected person (0–1). */
  score: number;
  expectedPeople: number;
  detectedPeople: number;
  /** Per guide person (lead first); null = no detected body matched it. */
  perPerson: Array<number | null>;
  /** For each guide person, the detected index it matched (or -1). */
  assignment: number[];
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
 * Score a detected pose against the guide. Guide people are matched to detected people by the
 * best overall assignment (≤3 guide people, ≤4 largest detections), so a partner on the other
 * side of the frame still pairs with the right skeleton.
 */
export function scorePoseMatch(input: {
  guide: NormalizedBody[];
  guideAspect: number;
  detected: DetectedPose;
}): PoseMatchResult {
  const detectedAspect =
    input.detected.canvas.width > 0 && input.detected.canvas.height > 0
      ? input.detected.canvas.width / input.detected.canvas.height
      : input.guideAspect;
  const guide = input.guide.slice(0, 3);
  const candidates = input.detected.people
    .map((body, index) => ({ body, index }))
    .sort((a, b) => limbCount(b.body) - limbCount(a.body))
    .slice(0, 4);
  const matrix = guide.map(g =>
    candidates.map(c =>
      scoreBodyMatch(g, c.body, { guide: input.guideAspect, detected: detectedAspect })
    )
  );
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
  const perPerson = guide.map((_, g) => {
    const c = best.picks[g] ?? -1;
    return c >= 0 ? (matrix[g]![c] ?? null) : null;
  });
  const score =
    guide.length === 0
      ? 0
      : perPerson.reduce<number>((sum, value) => sum + (value ?? 0), 0) / guide.length;
  return {
    score: Math.round(score * 100) / 100,
    expectedPeople: guide.length,
    detectedPeople: input.detected.people.filter(body => limbCount(body) >= MIN_SHARED_LIMBS)
      .length,
    perPerson,
    assignment: guide.map((_, g) => {
      const c = best.picks[g] ?? -1;
      return c >= 0 ? candidates[c]!.index : -1;
    }),
  };
}

/** Below this the still is treated as not following its guide (reroll while budget remains). */
export const DEFAULT_MIN_POSE_MATCH = 0.6;

/** A kept still at or above this is good enough to add its detected pose to the library. */
export const POSE_LIBRARY_MIN_SCORE = 0.8;

/** One readable line for the Day status strip / slot badge. */
export function describePoseMatch(result: PoseMatchResult): string {
  const pct = Math.round(result.score * 100);
  const heads =
    result.detectedPeople !== result.expectedPeople
      ? ` · ${result.detectedPeople} of ${result.expectedPeople} people found`
      : '';
  return `pose match ${pct}%${heads}`;
}

/** Prompt nudge for a still that ignored its guide. */
export const POSE_MISMATCH_NUDGE =
  'Match the Image 3 skeleton exactly — torso angle, both arms and both legs; do not keep the Image 1 standing pose.';
