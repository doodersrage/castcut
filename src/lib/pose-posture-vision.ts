/**
 * Optional vision check for the pose check's posture (pure): when the keypoints can't tell —
 * the guide clearly lies down, the still's read is a guess at sitting (`postureUnsure`) — the
 * vision model is asked what the person is doing, and its answer settles it.
 *
 * Conservative by design: a miss is called only when the model's answer disagrees with the
 * guide AND agrees with what the keypoints guessed. In the 2026-10 calibration the model read
 * clear postures right (lying vs sitting, plank vs standing, front vs back) but called a seat
 * reclined against cushions "lying" — so on its own it would both miss and invent misses.
 */

import {
  postureGroupsAgree,
  type PostureClass,
  type PostureFacing,
  type PostureGroup,
  postureGroup,
} from '@/lib/pose-posture';
import {
  LIMB_ANGLE_MIN_POSE_MATCH,
  limbVerdictScore,
  type PoseMatchResult,
} from '@/lib/pose-score';

export type VisionPosture = {
  posture: PostureClass;
  group: PostureGroup;
  facing: PostureFacing;
};

/** The one question asked (no system prompt; short two-line answer). */
export const POSTURE_VISION_PROMPT = [
  'Look at the main person in this image (the largest, most central one). What is their body doing?',
  'Answer with exactly two lines, nothing else:',
  'POSTURE: one of standing, sitting, kneeling, crouching, lying-back, lying-front, lying-side, bending, other',
  'FACING: one of camera, away, side',
].join('\n');

const POSTURE_WORDS: Array<[RegExp, PostureClass]> = [
  [/lying[\s-]*(on\s+(the|her|his|their)\s+)?back|supine/, 'lying-back'],
  [/lying[\s-]*(on\s+(the|her|his|their)\s+)?(front|stomach|belly)|prone/, 'lying-front'],
  [/lying[\s-]*(on\s+(the|her|his|their)\s+)?side/, 'lying-side'],
  [/\blying\b|\blies\b|reclin/, 'lying-back'],
  [/kneel/, 'kneeling'],
  [/crouch|squat/, 'crouching'],
  [/sitting|seated|\bsits?\b/, 'sitting'],
  [/bending|bent over/, 'bending'],
  [/standing|walking|running|\bstands?\b/, 'standing'],
];

/** Read the model's reply; null when it names no posture we know. */
export function parseVisionPosture(text: string | null | undefined): VisionPosture | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const postureLine = /posture\s*:\s*([^\n]+)/.exec(lower)?.[1] ?? lower;
  const posture = POSTURE_WORDS.find(([pattern]) => pattern.test(postureLine))?.[1];
  if (!posture) return null;
  const facingLine = /facing\s*:\s*([^\n]+)/.exec(lower)?.[1] ?? '';
  const facing: PostureFacing = /\baway\b|\bback\b/.test(facingLine)
    ? 'away'
    : /camera|front/.test(facingLine)
      ? 'camera'
      : 'unknown';
  return { posture, group: postureGroup(posture), facing };
}

/**
 * Fold the vision answer into a pose match: for each unsure pair, the model's group must
 * disagree with the guide's and agree with the keypoints' guess to call a posture miss. Returns
 * the result unchanged when nothing flips (or the method isn't limb-angle).
 */
export function applyVisionPosture(
  result: PoseMatchResult,
  vision: VisionPosture | null
): PoseMatchResult {
  if (!vision || result.method !== 'limb-angle' || !result.postureUnsure) return result;
  // The model describes the main person: the lead.
  const lead = result.posture[0];
  if (!lead?.unsure || !lead.still) return { ...result, postureUnsure: false };
  const miss =
    vision.group !== 'unknown' &&
    !postureGroupsAgree(vision.group, lead.guide.group) &&
    postureGroupsAgree(vision.group, lead.still.group);
  if (!miss) return { ...result, postureUnsure: false };
  const posture = result.posture.map((pair, index) =>
    index === 0 ? { ...pair, mismatch: true, unsure: false } : pair
  );
  return {
    ...result,
    posture,
    postureMiss: true,
    postureUnsure: false,
    score: Math.round(limbVerdictScore(result.limbScore, true) * 100) / 100,
  };
}

/** Is a pose match worth the vision question? (A clear miss or hit never is.) */
export function wantsVisionPosture(result: PoseMatchResult | null | undefined): boolean {
  return Boolean(
    result &&
    result.method === 'limb-angle' &&
    result.postureUnsure &&
    result.score >= LIMB_ANGLE_MIN_POSE_MATCH
  );
}
