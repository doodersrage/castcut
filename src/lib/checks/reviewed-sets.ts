/**
 * The checks measured on the reviewed sets (FINISHING_PLAN Phase 4): each set's takes as their
 * checks recorded them (docs/consistency/*-set.json) and the reviewer's labels (*-labels.json),
 * read back through the same findings code the app uses (checkQuality, ruleMisses). Run with the
 * unit tests, so a change to a check's rule shows in its numbers. Pure.
 *
 * The bar, from FINISHING_PLAN Phase 4: under 10% of rejected takes have no finding, and any
 * check that triggers a reroll is at least 70% precise — or it only advises.
 */
import type { ComfyGalleryEntry, GalleryPlayChecks } from '../gallery/comfyui-gallery-entry';
import { DEFAULT_MIN_POSE_MATCH } from '../pose/score';
import {
  checkQuality,
  ruleMisses,
  type CheckQualityRow,
  type RuleMissRow,
  type WrongReason,
} from './check-quality';
import type { FindingDecision } from './finding-decisions';
import { findingsForGalleryEntry, type ContinuityRule } from './findings';

/** A take as a reviewed set keeps it. */
export type ReviewedTake = {
  promptId: string;
  checked?: boolean;
  pose?: number | null;
  poseMiss?: boolean;
  face?: number | null;
  faceMiss?: boolean;
  autoReview?: { outfitMiss?: string; placeMiss?: string; gestureMiss?: string };
};

/** A set's labels: each finding right or wrong, the takes rejected and why. */
export type ReviewedLabels = {
  findings: { id: string; label: 'confirmed' | 'false-positive' }[];
  looksWrong?: string[];
  wrongBecause?: Record<string, WrongReason[]>;
};

/**
 * What each still rule does on a miss today: `rerolls` when it redoes, rerolls or counts as a run
 * miss to render again; `advises` when it only flags. Pose match (and the gesture question folded
 * into it) advises since 2026-11-14: 44% right on T5.
 */
export const RULE_ACTION: Partial<Record<ContinuityRule, 'rerolls' | 'advises'>> = {
  'face-miss': 'rerolls',
  'pose-miss': 'advises',
  'outfit-miss': 'rerolls',
  'place-miss': 'rerolls',
  // 12 of 16 on s19's finals, one reviewer (still/room.ts): advisory.
  'room-miss': 'advises',
  'marks-missing': 'rerolls',
  'realism-miss': 'rerolls',
};

export const PRECISION_BAR = 0.7;
/** Fewer decided findings than this say too little to hold a check to the bar. */
export const PRECISION_MIN_DECIDED = 10;
export const NO_FINDING_BAR = 0.1;

/** A reviewed take as the Gallery entry its checks would have left. */
export function reviewedTakeEntry(
  take: ReviewedTake
): Pick<ComfyGalleryEntry, 'promptId' | 'playChecks'> {
  if (take.checked === false) return { promptId: take.promptId };
  const review = take.autoReview ?? {};
  const pose = typeof take.pose === 'number' ? take.pose : undefined;
  const checks: GalleryPlayChecks = {
    at: 0,
    ...(pose !== undefined
      ? { pose, poseMiss: pose < DEFAULT_MIN_POSE_MATCH }
      : take.poseMiss
        ? { poseMiss: true }
        : {}),
    ...(typeof take.face === 'number' ? { face: take.face } : {}),
    ...(take.faceMiss ? { faceMiss: true } : {}),
    ...(review.outfitMiss?.trim() ? { outfitMiss: review.outfitMiss.trim() } : {}),
    ...(review.placeMiss?.trim() ? { placeMiss: review.placeMiss.trim() } : {}),
    ...(review.gestureMiss?.trim() ? { gestureMiss: review.gestureMiss.trim() } : {}),
  };
  return { promptId: take.promptId, playChecks: checks };
}

export type ReviewedRuleRow = Pick<CheckQualityRow, 'rule' | 'found'> & {
  right: number;
  wrong: number;
  /** right / (right + wrong); null with nothing decided. */
  precision: number | null;
};

export type ReviewedSetMeasure = {
  rows: ReviewedRuleRow[];
  misses: RuleMissRow[];
  /** Takes the reviewer rejected; of them the ones never checked, and checked ones no check flagged. */
  rejected: number;
  rejectedUnchecked: number;
  rejectedNoFinding: number;
};

/** One reviewed set, measured. Cut-only findings (outfit jumps) come from the labels. */
export function measureReviewedSet(
  takes: readonly ReviewedTake[],
  labels: ReviewedLabels
): ReviewedSetMeasure {
  const entries = takes.map(reviewedTakeEntry);
  const decisions: FindingDecision[] = labels.findings.map(finding => ({
    id: finding.id,
    decision: finding.label === 'confirmed' ? 'accepted' : 'dismissed',
    at: 0,
  }));
  const quality = checkQuality(entries, decisions);
  const rows = quality.rows.map(row => {
    const decided = row.accepted + row.dismissed;
    return {
      rule: row.rule,
      found: row.found,
      right: row.accepted,
      wrong: row.dismissed,
      precision: decided ? row.accepted / decided : null,
    };
  });
  const rejectedIds = new Set([
    ...(labels.looksWrong ?? []),
    ...Object.keys(labels.wrongBecause ?? {}),
  ]);
  const byId = new Map(entries.map(entry => [entry.promptId, entry]));
  let rejected = 0;
  let rejectedUnchecked = 0;
  let rejectedNoFinding = 0;
  for (const id of rejectedIds) {
    const entry = byId.get(id);
    if (!entry) continue;
    rejected += 1;
    if (!entry.playChecks) rejectedUnchecked += 1;
    else if (findingsForGalleryEntry(entry).length === 0) rejectedNoFinding += 1;
  }
  return {
    rows,
    misses: ruleMisses(entries, labels.wrongBecause ?? {}),
    rejected,
    rejectedUnchecked,
    rejectedNoFinding,
  };
}

/** Rules that reroll, summed over the sets: under the bar with enough decided findings. */
export function rerollRulesUnderBar(
  sets: readonly ReviewedSetMeasure[]
): { rule: ContinuityRule; right: number; decided: number }[] {
  const totals = new Map<ContinuityRule, { right: number; decided: number }>();
  for (const set of sets) {
    for (const row of set.rows) {
      if (RULE_ACTION[row.rule] !== 'rerolls') continue;
      const total = totals.get(row.rule) ?? { right: 0, decided: 0 };
      total.right += row.right;
      total.decided += row.right + row.wrong;
      totals.set(row.rule, total);
    }
  }
  return [...totals]
    .filter(
      ([, total]) =>
        total.decided >= PRECISION_MIN_DECIDED && total.right / total.decided < PRECISION_BAR
    )
    .map(([rule, total]) => ({ rule, ...total }));
}
