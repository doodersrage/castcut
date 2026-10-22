/**
 * Which custom poses (joint editor, "From a photo", My poses) Edit 2511 cannot draw, so Day hands
 * that one still to a Qwen-Image 2.1 engine (resolveDayStillModel: customPoseEngines).
 *
 * Pose bench (2026-10-21, 24 custom poses × 3 engines, judged by eye): Edit 2511 got 29% right
 * against Turbo 58% and Noct-Q 75%. Its misses were the poses off its standing dressed plate —
 * a plank drawn standing with arms overhead 4/4, a lie drawn propped up, back views turned to
 * face the camera (12 of its 18 facing failures) — even when the words were right.
 *
 * Read from the joints only (posture.ts geometry, the vision read and a named pose's own words),
 * not from the pose's description.
 */

import { classifyPosture, bodyReferenceLength } from '@/lib/pose/posture';
import type { NormalizedBody } from '@/lib/pose/library';
import type { PhotoPose } from '@/lib/pose/types';

export type CustomPoseOffPlate = 'lying' | 'horizontal' | 'back-view';

/** Torso this far from upright, not a bend over planted feet: horizontal (a plank, a push-up). */
const HORIZONTAL_TILT_DEG = 55;
/** Left shoulder this far onto the picture's left (her back to the camera), in torso lengths. */
const BACK_VIEW_SHOULDER_CROSS = 0.14;

const R_SHOULDER = 2;
const L_SHOULDER = 5;

const LYING_WORDS_RE =
  /\b(?:lying|lies|lie down|reclin\w*|face down|on (?:her|his) (?:back|front|side|stomach))\b/i;
const HORIZONTAL_WORDS_RE = /\b(?:plank\w*|push-ups?|on all fours)\b/i;
const BACK_VIEW_WORDS_RE = /\b(?:back to the camera|from behind|back view|facing away)\b/i;

function backTurned(body: NormalizedBody, aspect: number): boolean {
  const rs = body[R_SHOULDER];
  const ls = body[L_SHOULDER];
  const ref = bodyReferenceLength(body, aspect);
  if (!rs || !ls || ref <= 0) return false;
  // DWPose labels her own sides: facing the camera her left shoulder is on the picture's right.
  return (ls.x - rs.x) * aspect < -BACK_VIEW_SHOULDER_CROSS * ref;
}

/**
 * Why Edit 2511 would miss this custom pose ('lying', 'horizontal', 'back-view'), or null when it
 * holds it. The lead figure only (a still's custom pose draws the lead first).
 */
export function customPoseOffPlate(photo: PhotoPose | null | undefined): CustomPoseOffPlate | null {
  const lead = photo?.people[0];
  if (!photo || !lead) return null;
  const vision = photo.posture?.posture;
  const words = photo.words ?? '';
  const read = classifyPosture(lead, photo.aspect);
  if (
    vision === 'reclining' ||
    vision?.startsWith('lying-') ||
    read.group === 'lying' ||
    read.group === 'inverted' ||
    LYING_WORDS_RE.test(words)
  ) {
    return 'lying';
  }
  if (
    vision === 'all-fours' ||
    read.posture === 'all-fours' ||
    (read.posture !== 'bending' && (read.tiltDeg ?? 0) >= HORIZONTAL_TILT_DEG) ||
    HORIZONTAL_WORDS_RE.test(words)
  ) {
    return 'horizontal';
  }
  if (read.facing === 'away' || backTurned(lead, photo.aspect) || BACK_VIEW_WORDS_RE.test(words)) {
    return 'back-view';
  }
  return null;
}
