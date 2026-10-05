/**
 * Day "Looks wrong" (pure): the player's own verdict on a landed still, from its card's ⋯ menu.
 * Automatic defect checks were unreliable on the stills that go wrong most (merged bodies, a
 * mixed two-person layout), so one click does what the player would do by hand — the slot is
 * queued again on a new seed with the same prompt — and the verdict counts as a bad outcome for
 * that pose layout × engine in the pose outcome stats (pose-outcome-stats.ts), where the learned
 * weak-pose hint, the pose-pack skip and "Pick the best engine per pose" read it.
 */

import type { DaySlotStill } from '@/lib/day-planner';

/** The card's note on the redone take. */
export const LOOKS_WRONG_MARK = 'Redone — looked wrong';

type StillForVerdict = Pick<DaySlotStill, 'status' | 'imageUrl' | 'promptId' | 'twoTakes'>;

/** Can the player say a still looks wrong? Only once it has landed with a picture. */
export function dayLooksWrongAvailable(still: StillForVerdict | null | undefined): boolean {
  return still?.status === 'completed' && Boolean(still.imageUrl?.trim());
}

/**
 * The takes the verdict is about: the shown take, plus the second of two takes not picked yet
 * (both are on the card, and neither was good enough to keep).
 */
export function dayLooksWrongTakeIds(still: StillForVerdict | null | undefined): string[] {
  if (!dayLooksWrongAvailable(still)) return [];
  const ids = [still?.promptId?.trim(), still?.twoTakes?.promptId?.trim()].filter(
    (id): id is string => Boolean(id)
  );
  return [...new Set(ids)];
}

/** The card's note: this take was queued because the last one looked wrong. */
export function dayLooksWrongMark(
  still: Pick<DaySlotStill, 'redoReason'> | null | undefined
): string | null {
  return still?.redoReason === 'looks-wrong' ? LOOKS_WRONG_MARK : null;
}
