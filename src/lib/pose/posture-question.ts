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
 *
 * Sat on the ground for a crouch (2026-10-22). A crouch and a seat on the ground draw the same
 * flat joints — hips low, knees bent — and so does a body leaning off its feet, as a carving
 * skier does (sport_ski-5: both feet well to one side of the hips). Every Qwen-Image 2.1 engine
 * sat sport_ski-5 down on the grass, legs out in front, and its joints matched the guide (0.98 –
 * 1.00), both reads a confident "standing": no miss, nothing asked. Union pose control and
 * "never sitting" words changed nothing. For such a guide ({@link groundSitLookalike}) the
 * question is asked whatever the still's read, and a clear "no" is a miss read as sitting.
 * Pose bench (nsfwvision-qwen3-vl-8b-v3), per wording — sat stills caught / on-feet stills
 * flagged:
 *
 *   wording                                                     sat (ski-5)   on its feet
 *   "up on her feet, bottom off the ground, not sitting?"       22/72         12/12 squats "no"
 *   "sitting on the ground, bottom resting on the grass?"       11/72 yes     0
 *   "legs stretched out in front of her, along the ground?"     56/102 yes    5/151 (bends)
 *   "knees bent sharply with her feet under her hips, as in     99/102 no     ski-1 Turbo 3/3
 *    a crouch or squat?" (shipped)
 *
 * The on-feet stills: crouch-1…5, sport_squat-1…5, kneel-5 (66 asked, Turbo / Noct-Q, none
 * flagged), sport_ski-1 / -4 and sport_ski-5 rendered on her feet without the map (6/6 "yes"). A
 * crouch leaning off its feet (sport_ski-1) is a fair "no" to "feet under her hips", so it is not
 * asked. A floor sit for a crouch guide is "no" too (sit_floor stills 16/16). In the app's
 * prompt, the pose check now calls 97 of the 102 seated sport_ski-5 stills a miss (6 before),
 * and no new miss among the other 446 bench stills (posebench3, the lean bench, the crouches).
 */

import {
  GESTURE_NO_CONFIDENCE,
  type GestureAnswer,
  type GestureLead,
  type GestureQuestion,
} from '@/lib/pose/gesture';
import { describePoseFigure } from '@/lib/pose/describe';
import type { NormalizedBody } from '@/lib/pose/library';
import {
  bodyReferenceLength,
  classifyPosture,
  postureWord,
  type PostureClass,
} from '@/lib/pose/posture';
import {
  LIMB_ANGLE_MIN_POSE_MATCH,
  limbVerdictScore,
  type PoseMatchResult,
} from '@/lib/pose/score';

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

/** The on-its-feet question's label: a "no" reads the still as sitting. */
export const GROUND_SIT_LABEL = 'on the feet';

/** Feet this far (body reference lengths) to one side of the hips: she is off balance. */
const OFF_BALANCE_FEET = 0.6;

/**
 * A guide on its feet whose flat joints a seat on the ground matches: a crouch or squat with the
 * feet under the hips (its words say so — a cross-legged floor sit reads low too, and its words
 * say sitting), or a body standing off its feet, the feet well to one side of the hips (a
 * carving skier, sport_ski-5). Null for any other guide — a crouch leaning off its feet too
 * (sport_ski-1: rendered right, on her feet, but "feet under her hips?" is then a fair "no").
 */
export function groundSitLookalike(
  body: NormalizedBody | null | undefined,
  aspect: number
): 'crouch' | 'off-balance' | null {
  if (!body || !(aspect > 0)) return null;
  const read = classifyPosture(body, aspect);
  if (read.posture !== 'crouching' && read.posture !== 'standing') return null;
  const stance = describePoseFigure(body, { aspect }).stance;
  const ref = bodyReferenceLength(body, aspect);
  const hips = [body[8], body[11]].filter(point => point != null);
  const ankles = [body[10], body[13]].filter(point => point != null);
  const offBalance =
    ref > 0 &&
    hips.length > 0 &&
    ankles.length === 2 &&
    Math.abs(
      (ankles.reduce((sum, point) => sum + point.x, 0) / 2 -
        hips.reduce((sum, point) => sum + point.x, 0) / hips.length) *
        aspect
    ) >=
      OFF_BALANCE_FEET * ref;
  if (read.posture === 'crouching') {
    return /^in a (?:deep )?squat/.test(stance) && !offBalance ? 'crouch' : null;
  }
  // Both feet down and standing (a stride or a one-legged pose puts a foot out on its own).
  if (read.posture !== 'standing' || !/^standing(?:,|$| with)/.test(stance)) return null;
  return offBalance ? 'off-balance' : null;
}

/**
 * The guide is one a seat on the ground looks like ({@link groundSitLookalike}) and the check
 * hasn't already missed: ask whether the still is on its feet, whatever its own read says.
 */
function wantsGroundSitQuestion(
  result: PoseMatchResult,
  guide: { body: NormalizedBody | null | undefined; aspect: number }
): boolean {
  if (result.method !== 'limb-angle') return false;
  if (result.postureMiss || result.score < LIMB_ANGLE_MIN_POSE_MATCH) return false;
  if (!result.posture[0]?.still) return false;
  return groundSitLookalike(guide.body, guide.aspect) !== null;
}

/**
 * The yes/no posture question for a match, or null when it isn't worth asking. With the lead's
 * `guide` body, a guide a seat on the ground looks like gets the on-its-feet question instead.
 */
export function postureQuestion(
  result: PoseMatchResult | null | undefined,
  lead: GestureLead = 'woman',
  guide?: { body: NormalizedBody | null | undefined; aspect: number }
): GestureQuestion | null {
  if (!result) return null;
  if (guide && wantsGroundSitQuestion(result, guide)) {
    const p = PRONOUNS[lead];
    return {
      id: POSTURE_QUESTION_ID,
      text: `Are ${p.possessive} knees bent sharply with ${p.possessive} feet under ${p.possessive} hips, as in a crouch or squat?`,
      label: GROUND_SIT_LABEL,
    };
  }
  if (!wantsPostureQuestion(result)) return null;
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
  const groundSit = question.label === GROUND_SIT_LABEL;
  const posture = result.posture.map((pair, index) =>
    index === 0
      ? {
          ...pair,
          // Not on its feet before a crouch: sat on the ground. Otherwise the keypoints' guess
          // stands for the still's posture only when it differs from the guide's; else all that
          // is known is "not that".
          still: groundSit
            ? { ...pair.still!, posture: 'sitting' as const, group: 'seated' as const }
            : pair.still && pair.still.group !== pair.guide.group
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
    ...(groundSit ? { groundSitMiss: true } : {}),
    postureUnsure: false,
    score: Math.round(limbVerdictScore(result.limbScore, true) * 100) / 100,
  };
}
