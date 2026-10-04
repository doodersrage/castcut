/**
 * Posture question (pure): the pose check's vision fallback when the still's keypoints can't say
 * what the body is doing.
 *
 * The posture check (`pose-score.ts`) calls a miss only on confident reads. A still standing in
 * front of a kneeling, sitting or lying guide often comes back from DWPose as an unconfident
 * read (legs cut by the frame, a foreshortened torso), so no miss was called and the limb angles
 * alone scored it 0.83–0.95. Whenever the guide's posture is clear and the still's read is not,
 * the vision model is asked one yes/no question phrased from the guide's posture ("Is she
 * kneeling down?", "Is she lying down?"), in the same call as the gesture check's questions
 * (`pose-gesture.ts`), and a clear "no" is a posture miss.
 *
 * Calibrated 2026-10-04 (scripts/pose-posture-calibrate.mts, nsfwvision-qwen3-vl-8b-v3) on 269
 * stills with a drawn guide, posture judged by eye: the custom-pose words A/B on Rapid (standing
 * stills against kneel / cross-legged / lying guides), the gesture check's 243 Day stills and 9
 * live Day lying stills — 31 in the wrong posture, 238 right. The keypoints alone called none of
 * the 31 (all unconfident reads). Asked on 121 (29 wrong, 92 right):
 *
 *   question wording                                    caught wrong   new false alarms on right
 *   "standing up on her feet?" / "lying down?"          28/31 (90%)       6/238 (2.5%)
 *   + lying: "lying or reclining, not … upright?"       25/31 (81%)       0/238
 *     standing: "upright on her feet (… posing) …?"
 *   + standing: "standing on her feet, not sitting,     28/31 (90%)       1/238 (0.4%)
 *     kneeling or lying down?" (shipped)
 *
 * "Lying down?" got "no" on a body propped on an elbow or reclined on a chaise (5 of the 6 false
 * alarms); "… posing" let seated stills through. The one false alarm left is a one-legged dance
 * pose. Missed: a side-lunge guide (its read isn't confident, so nothing is asked) and a
 * standing guide answered "yes" for a man lying on the grass. The model answers 95 either way,
 * so the confidence bar barely matters.
 */

import {
  GESTURE_NO_CONFIDENCE,
  type GestureAnswer,
  type GestureLead,
  type GestureQuestion,
} from '@/lib/pose-gesture';
import { postureWord, type PostureClass } from '@/lib/pose-posture';
import {
  LIMB_ANGLE_MIN_POSE_MATCH,
  limbVerdictScore,
  type PoseMatchResult,
} from '@/lib/pose-score';

/** The posture question's id among the still's vision questions. */
export const POSTURE_QUESTION_ID = 'posture';

type Pronouns = { subject: string; possessive: string; be: string };

const PRONOUNS: Record<GestureLead, Pronouns> = {
  woman: { subject: 'she', possessive: 'her', be: 'Is' },
  man: { subject: 'he', possessive: 'his', be: 'Is' },
  person: { subject: 'the person', possessive: 'their', be: 'Is' },
};

/**
 * The question per guide posture. Asked about the posture as a whole, not the guide's exact
 * limbs: a still kneeling on both knees for a one-knee guide holds the posture (the limb score
 * and the gesture check judge the rest).
 */
const QUESTION: Record<Exclude<PostureClass, 'unknown'>, (p: Pronouns) => string> = {
  standing: p =>
    `${p.be} ${p.subject} standing on ${p.possessive} feet, not sitting, kneeling or lying down?`,
  sitting: p => `${p.be} ${p.subject} sitting down?`,
  kneeling: p => `${p.be} ${p.subject} kneeling, with a knee on the ground?`,
  crouching: p => `${p.be} ${p.subject} crouching or squatting down low?`,
  'all-fours': p => `${p.be} ${p.subject} on ${p.possessive} hands and knees?`,
  'lying-back': p => `${p.be} ${p.subject} lying or reclining, not standing or sitting upright?`,
  'lying-side': p => `${p.be} ${p.subject} lying or reclining, not standing or sitting upright?`,
  'lying-front': p => `${p.be} ${p.subject} lying or reclining, not standing or sitting upright?`,
  bending: p => `${p.be} ${p.subject} bending forward at the waist?`,
  'upside-down': p => `${p.be} ${p.subject} upside down?`,
};

/**
 * Is the posture question worth asking for this match? The lead's guide posture is a confident
 * read, the still's matched body is read but not confidently, and the check hasn't already
 * missed (a confident mismatch, a gesture miss, nobody found).
 */
export function wantsPostureQuestion(result: PoseMatchResult | null | undefined): boolean {
  if (!result || result.method !== 'limb-angle') return false;
  if (result.postureMiss || result.score < LIMB_ANGLE_MIN_POSE_MATCH) return false;
  const lead = result.posture[0];
  return Boolean(
    lead &&
    lead.guide.confident &&
    lead.guide.posture !== 'unknown' &&
    lead.still &&
    !lead.still.confident
  );
}

/** The yes/no posture question for a match, or null when it isn't worth asking. */
export function postureQuestion(
  result: PoseMatchResult | null | undefined,
  lead: GestureLead = 'woman'
): GestureQuestion | null {
  if (!result || !wantsPostureQuestion(result)) return null;
  const posture = result.posture[0]!.guide.posture;
  if (posture === 'unknown') return null;
  return {
    id: POSTURE_QUESTION_ID,
    text: QUESTION[posture](PRONOUNS[lead]),
    label: postureWord(posture),
  };
}

/**
 * Fold the model's answer into the match: a "no" at or above `noConfidence` is a posture miss
 * on the lead (its score drops into the miss band, as a confident posture miss does). Any other
 * answer, or none, leaves the match as it was.
 */
export function applyPostureAnswer(
  result: PoseMatchResult,
  question: GestureQuestion | null | undefined,
  answers: readonly GestureAnswer[] | null | undefined,
  noConfidence: number = GESTURE_NO_CONFIDENCE
): PoseMatchResult {
  if (!question) return result;
  const answer = answers?.find(entry => entry.id === question.id);
  const lead = result.posture[0];
  if (!answer || answer.answer !== 'no' || answer.confidence < noConfidence || !lead?.still) {
    return result;
  }
  const posture = result.posture.map((pair, index) =>
    index === 0
      ? {
          ...pair,
          // The keypoints' guess stands for the still's posture only when it differs from the
          // guide's; otherwise all that is known is "not that".
          still:
            pair.still && pair.still.group !== pair.guide.group
              ? pair.still
              : { ...pair.still!, posture: 'unknown' as const, group: 'unknown' as const },
          mismatch: true,
          unsure: false,
        }
      : pair
  );
  return {
    ...result,
    posture,
    postureMiss: true,
    postureUnsure: false,
    score: Math.round(limbVerdictScore(result.limbScore, true) * 100) / 100,
  };
}
