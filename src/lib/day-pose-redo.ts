/**
 * Day "Redo pose misses once" (pure): when a still's pose check (DWPose vs its pose guide) says
 * it missed, the slot is queued once more with the pose spelled out — the same nudge Auto-review
 * sends on a pose reroll (POSE_MISMATCH_NUDGE, which also turns on the pose cue line). Once per
 * take: the redo's own take is never redone, so it can't loop; a take queued later by hand gets
 * its own one redo.
 */

import { DEFAULT_MIN_POSE_MATCH } from '@/lib/pose-score';

export type PoseRedoEntry = {
  /** The take whose pose missed and was queued again. */
  missedTake: string;
  /** The take that redo produced — unset while it renders. */
  redoTake?: string;
};

/** Per slot: the last pose redo. */
export type PoseRedoLedger = Record<string, PoseRedoEntry>;

export type PoseRedoSkip =
  /** The switch is off. */
  | 'off'
  /** Auto-review is on: it checks the pose itself and rerolls misses. */
  | 'auto-review'
  /** No take to tell apart (no prompt id or image). */
  | 'no-take'
  /** This take was already redone. */
  | 'same-take'
  /** This take is the redo — never redone again. */
  | 'redo-take'
  /** The pose wasn't checked (no guide, or no DWPose). */
  | 'no-check'
  /** The pose matched its guide. */
  | 'matched';

export type PoseRedoDecision = { redo: true } | { redo: false; skip: PoseRedoSkip };

/** The id of a still's take: its prompt id, else its image. */
export function poseRedoTakeId(
  still: { promptId?: string; imageUrl?: string } | null | undefined
): string {
  return still?.promptId?.trim() || still?.imageUrl?.trim() || '';
}

/**
 * Record a slot's newly landed take as its pending redo's result (the first take after the
 * miss). Returns the same ledger when nothing changes.
 */
export function notePoseRedoTake(
  ledger: PoseRedoLedger,
  slotId: string,
  take: string
): PoseRedoLedger {
  const entry = ledger[slotId];
  if (!entry || entry.redoTake || !take || take === entry.missedTake) {
    return ledger;
  }
  return { ...ledger, [slotId]: { ...entry, redoTake: take } };
}

/** Should this still be queued again for its pose? (Call after {@link notePoseRedoTake}.) */
export function poseRedoDecision(input: {
  enabled: boolean;
  autoReview: boolean;
  slotId: string;
  take: string;
  /** The pose check's match (0–1); null when no check ran. */
  poseScore: number | null | undefined;
  minPoseMatch?: number;
  ledger: PoseRedoLedger;
}): PoseRedoDecision {
  if (!input.enabled) return { redo: false, skip: 'off' };
  if (input.autoReview) return { redo: false, skip: 'auto-review' };
  const take = input.take.trim();
  if (!take) return { redo: false, skip: 'no-take' };
  const entry = input.ledger[input.slotId];
  if (entry?.missedTake === take) return { redo: false, skip: 'same-take' };
  // A redo still rendering: whatever lands next is its result.
  if (entry && (!entry.redoTake || entry.redoTake === take)) {
    return { redo: false, skip: 'redo-take' };
  }
  const score = input.poseScore;
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return { redo: false, skip: 'no-check' };
  }
  if (score >= (input.minPoseMatch ?? DEFAULT_MIN_POSE_MATCH)) {
    return { redo: false, skip: 'matched' };
  }
  return { redo: true };
}

/** The slot card's mark: the redo rendering, or the take it produced. */
export function poseRedoMark(ledger: PoseRedoLedger, slotId: string, take: string): string | null {
  const entry = ledger[slotId];
  if (!entry || !take) return null;
  if (!entry.redoTake) return 'Redoing for the pose…';
  return entry.redoTake === take ? 'Redone for the pose' : null;
}
