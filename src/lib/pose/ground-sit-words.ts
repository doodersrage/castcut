/**
 * The ground-sit redo's words and card lines (dependency-free, so the engine renderers can read
 * them): see `ground-sit-redo.ts`.
 */

export type GroundSitKind = 'crouch' | 'off-balance';

/** The redo's pose words end with this: it marks a words-only ground-sit redo's prompt. */
export const GROUND_SIT_REDO_TAIL = 'held high off the ground, never sitting';

/**
 * The pose words for the words-only redo. Off balance: the wording that stood sport_ski-5 up 6/6
 * (sheet D, "N1"); a crouch: the same weight-on-her-feet ending.
 */
export function groundSitRedoWords(kind: GroundSitKind, lead: 'she' | 'he' = 'she'): string {
  const possessive = lead === 'he' ? 'his' : 'her';
  return kind === 'off-balance'
    ? `in a low ski racer's crouch on both feet, knees bent, leaning into a turn, ${possessive} bottom ${GROUND_SIT_REDO_TAIL}`
    : `in a deep crouch on both feet, knees bent, ${possessive} bottom ${GROUND_SIT_REDO_TAIL}`;
}

/** A prompt written for a words-only ground-sit redo (its POSE FIRST / Pose: words). */
export function isGroundSitRedoPrompt(prompt: string): boolean {
  return prompt.includes(GROUND_SIT_REDO_TAIL);
}

/** The card line on the redo's take. */
export const GROUND_SIT_REDO_MARK = 'Redone without the pose map — she sat on the ground';
/** The card line while the redo renders. */
export const GROUND_SIT_REDOING_MARK = 'Redoing without the pose map — she sat on the ground…';

/** A ground-sit line for a man lead ("he sat on the ground"); as written for anyone else. */
export function groundSitLineFor(line: string, lead: string | null | undefined): string {
  return lead === 'man' ? line.replace(/\bshe\b/g, 'he').replace(/\bher\b/g, 'his') : line;
}
