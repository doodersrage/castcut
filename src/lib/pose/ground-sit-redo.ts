/**
 * Ground-sit recovery (pure): the redo for a still drawn sitting on the ground for a crouch or a
 * body leaning off its feet (`groundSitLookalike` in `posture-question.ts`).
 *
 * Every Qwen-Image 2.1 engine sits sport_ski-5 (a carving skier, both feet well to one side of
 * the hips) down on the grass whenever its pose map is attached: 0/5 with the map, 0/5 with Union
 * pose control, 0/9 with crouch words added (Turbo-8, Noct-Q). Without the map and with crouch
 * words that keep her weight on her feet she stood 6/6 (Turbo-8 and Noct-Q, three seeds each,
 * 2026-10-22) — her on-feet crouch then answered "yes" to the ground-sit question 6/6. So when the
 * pose check calls the ground-sit miss (and only that miss), the redo is rendered words-only:
 * no pose map, the pose words replaced by {@link groundSitRedoWords} — with the guide's facing
 * ("facing the camera, her face and chest toward the viewer", "her back to the camera"…), which
 * only the map had said.
 *
 * Its limbs then match the guide loosely (0.51–0.58 against a custom pose's 0.75 bar: a crouch
 * leaning into a turn, not the guide's exact joints), so the redo is judged posture first: a
 * keypoint posture read that puts her on her feet is no miss, the vision model's ground-sit
 * question decides, and the limbs need only {@link WORDS_ONLY_MIN_LIMB_SCORE}.
 */

import { describePoseFigure } from '@/lib/pose/describe';
import { groundSitLookalike } from '@/lib/pose/posture-question';
import type { NormalizedBody } from '@/lib/pose/library';
import type { PostureGroup } from '@/lib/pose/posture';
import { limbVerdictScore, type PoseMatchResult } from '@/lib/pose/score';
import { groundSitRedoWords, type GroundSitKind } from '@/lib/pose/ground-sit-words';

export {
  GROUND_SIT_REDO_MARK,
  GROUND_SIT_REDOING_MARK,
  GROUND_SIT_REDO_TAIL,
  groundSitLineFor,
  groundSitRedoWords,
  isGroundSitRedoPrompt,
  type GroundSitKind,
} from '@/lib/pose/ground-sit-words';

/**
 * The words-only redo a checked still asks for, or null: only the ground-sit miss (the vision
 * model said she is not on her feet before a crouch / off-balance guide) — never another miss.
 */
export function groundSitRedoFor(
  match: Pick<PoseMatchResult, 'groundSitMiss'> | null | undefined,
  guide: { body: NormalizedBody | null | undefined; aspect: number },
  lead: 'she' | 'he' = 'she'
): { kind: GroundSitKind; words: string } | null {
  if (match?.groundSitMiss !== true) return null;
  const kind = groundSitLookalike(guide.body, guide.aspect);
  if (!kind || !guide.body) return null;
  // Which way the guide faces: the map said it, the words must now.
  const facing = describePoseFigure(guide.body, {
    aspect: guide.aspect,
    possessive: lead === 'he' ? 'his' : 'her',
  }).view;
  return { kind, words: groundSitRedoWords(kind, lead, facing) };
}

/**
 * A words-only redo's limbs miss only under this. Its words draw the posture, not the guide's
 * exact joints: the on-feet ski crouches scored 0.51–0.58, the seated ones they replace 0.98+.
 */
export const WORDS_ONLY_MIN_LIMB_SCORE = 0.4;

/**
 * Still reads the crouch words draw, against a guide in another group (the skier reads
 * "standing"): low (a crouch) or bent forward. A still standing straight up still misses.
 */
const ON_FEET: ReadonlySet<PostureGroup> = new Set(['bent', 'low']);

/**
 * Judge a words-only redo (score it with `customPose: false`, then call this before the vision
 * check): a keypoint posture miss whose still reads crouched or bent (against the skier's
 * "standing") is dropped — the ground-sit question decides — and the limbs need only
 * {@link WORDS_ONLY_MIN_LIMB_SCORE}. A still read seated or lying still misses.
 */
export function judgeWordsOnlyRedo(match: PoseMatchResult): PoseMatchResult {
  if (match.method !== 'limb-angle') return match;
  const read = match.perPerson.some(value => value !== null);
  if (!read) return match;
  const posture = match.posture.map(pair =>
    pair.mismatch && pair.still && ON_FEET.has(pair.still.group)
      ? { ...pair, mismatch: false }
      : pair
  );
  const postureMiss = posture.some(pair => pair.mismatch);
  const limbMiss = match.limbScore < WORDS_ONLY_MIN_LIMB_SCORE;
  const score = limbVerdictScore(
    match.limbScore,
    postureMiss || limbMiss,
    limbMiss && !postureMiss
  );
  return {
    ...match,
    posture,
    postureMiss,
    limbMiss,
    limbBar: WORDS_ONLY_MIN_LIMB_SCORE,
    score: Math.round(score * 100) / 100,
  };
}
