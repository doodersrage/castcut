/**
 * Day "Best of two for hard poses" (pure): a still whose pose guide draws a hard pose — lying,
 * kneeling, crouching, on the floor, climbing, bending — gets a second take with a new seed, and
 * when both have landed the one whose pose reads closer to the guide is kept. The other stays
 * beside it as the alternate take (the same-seed redo's compare: `DaySlotStill.previousTake`),
 * so the player can still pick it. Never more than two: the second take is never doubled again.
 *
 * The state lives on the still itself — `previousTake.kind === 'best-of-two'` marks the second
 * take, `bestOfTwo` the finished pick — so a reload mid-pair still finishes the pair once.
 *
 * With the Castcut node pack installed the pair is ONE job (castcut-nodes.ts): both takes render
 * as a batch, the pose check runs inside the job and the closer take is saved as the still;
 * `bestOfTwoJob` marks it until the job's report fills the same fields.
 */

import { castcutViewUrl, type CastcutBestOfTwoReport } from '@/lib/castcut-nodes';
import type { DaySlotStill } from '@/lib/day-planner';
import type { NormalizedBody } from '@/lib/pose-library';
import { scorePoseMatch, type DetectedPose } from '@/lib/pose-score';

/**
 * Pose-guide layouts (the first part of a guide's pose key, `layout:people`) that Day stills miss
 * most: off the feet, folded or inverted bodies. Plain bases (`lie`, `kneel`, `crouch`), the
 * everyday floor / bend / climb stances, floor and inverted sport moves, and the lying or kneeling
 * intimate layouts.
 */
export const DAY_HARD_POSE_LAYOUTS: ReadonlySet<string> = new Set([
  'lie',
  'kneel',
  'crouch',
  'sit_floor',
  'lounge_elbows',
  'lie_front',
  'lie_side',
  'bend_pick',
  'climb',
  'sport_pushup',
  'sport_plank',
  'sport_yoga_dog',
  'sport_handstand',
  'sport_slide',
  'missionary',
  'mating_press',
  'bent',
  'prone',
  'spoon',
  'scissors',
  'oral',
  'sixty_nine',
  'facesit',
  'kneeling',
  'afterglow',
]);

const NO_LAYOUTS: ReadonlySet<string> = new Set();
let learnedHardLayoutsSource: () => ReadonlySet<string> = () => NO_LAYOUTS;

/**
 * Layouts the player keeps re-rolling (play-metrics rerollProneLayouts) count as hard poses too.
 * Set by the Day hook — this module stays free of browser storage.
 */
export function setLearnedHardLayoutsSource(source: () => ReadonlySet<string>): void {
  learnedHardLayoutsSource = source;
}

/** Is this guide's pose (its pose key, `layout:people`, or a bare layout) a hard one? */
export function isDayHardPose(poseKey: string | null | undefined): boolean {
  const layout = poseKey?.split(':')[0]?.trim();
  return Boolean(
    layout && (DAY_HARD_POSE_LAYOUTS.has(layout) || learnedHardLayoutsSource().has(layout))
  );
}

/**
 * How well a take's pose follows its guide (0–1, higher is closer). An adapter so a newer pose
 * score can replace this one without touching the decision code.
 */
export type TakePoseScorer = (input: {
  guide: NormalizedBody[];
  guideAspect: number;
  detected: DetectedPose;
}) => number;

export const scoreTakePose: TakePoseScorer = input => scorePoseMatch(input).score;

/** The id of a still's take: its prompt id, else its image. */
export function bestOfTwoTakeId(
  still: { promptId?: string; imageUrl?: string } | null | undefined
): string {
  return still?.promptId?.trim() || still?.imageUrl?.trim() || '';
}

export type BestOfTwoSkip =
  /** The switch is off. */
  | 'off'
  /** Auto-review is on: it checks the pose itself and rerolls misses. */
  | 'auto-review'
  /** The still hasn't landed (or has no image). */
  | 'not-landed'
  /** The guide's pose isn't a hard one (or no guide was queued). */
  | 'easy-pose'
  /** A same-seed redo is being compared — the player is choosing. */
  | 'comparing'
  /** The pair is done — this still is the pick. */
  | 'picked'
  /** The pose wasn't checked (no DWPose) — two takes can't be told apart. */
  | 'no-check';

export type BestOfTwoDecision =
  /** First take of a hard pose: queue the second (keep this one as the alternate). */
  | { action: 'queue-second'; firstScore: number }
  /** Second take landed: keep the closer one. */
  | { action: 'pick'; keep: 'first' | 'second'; firstScore: number; secondScore: number }
  | { action: 'none'; skip: BestOfTwoSkip };

type StillForPair = Pick<
  DaySlotStill,
  'status' | 'imageUrl' | 'promptId' | 'previousTake' | 'bestOfTwo'
>;

/** Is this still the second take of a pair that hasn't been picked yet? */
export function bestOfTwoPending(still: StillForPair | null | undefined): boolean {
  return still?.previousTake?.kind === 'best-of-two' && !still.bestOfTwo;
}

/**
 * The better of two takes by pose score: the second (newer) one unless the first is strictly
 * closer. A take with no score loses to one with a score.
 */
export function pickBetterTake(
  firstScore: number | null | undefined,
  secondScore: number | null | undefined
): 'first' | 'second' {
  const first = typeof firstScore === 'number' && Number.isFinite(firstScore) ? firstScore : null;
  const second =
    typeof secondScore === 'number' && Number.isFinite(secondScore) ? secondScore : null;
  if (second == null) return first == null ? 'second' : 'first';
  if (first == null) return 'second';
  return first > second ? 'first' : 'second';
}

/** What to do with a landed still (its pose already scored, or null when no check ran). */
export function bestOfTwoDecision(input: {
  enabled: boolean;
  autoReview: boolean;
  still: StillForPair | null | undefined;
  /** The guide queued with this take (its pose key); unset = no guide. */
  poseKey: string | null | undefined;
  poseScore: number | null | undefined;
}): BestOfTwoDecision {
  if (!input.enabled) return { action: 'none', skip: 'off' };
  if (input.autoReview) return { action: 'none', skip: 'auto-review' };
  const still = input.still;
  if (still?.status !== 'completed' || !still.imageUrl?.trim()) {
    return { action: 'none', skip: 'not-landed' };
  }
  const previous = still.previousTake;
  if (previous?.kind === 'best-of-two') {
    if (still.bestOfTwo) return { action: 'none', skip: 'picked' };
    // Only the take queued after the first counts as the second.
    if (previous.promptId && previous.promptId === bestOfTwoTakeId(still)) {
      return { action: 'none', skip: 'picked' };
    }
    const firstScore = previous.poseScore ?? null;
    const secondScore = finiteScore(input.poseScore);
    if (firstScore == null && secondScore == null) return { action: 'none', skip: 'no-check' };
    return {
      action: 'pick',
      keep: pickBetterTake(firstScore, secondScore),
      firstScore: firstScore ?? 0,
      secondScore: secondScore ?? 0,
    };
  }
  if (previous) return { action: 'none', skip: 'comparing' };
  if (!isDayHardPose(input.poseKey)) return { action: 'none', skip: 'easy-pose' };
  const score = finiteScore(input.poseScore);
  if (score == null) return { action: 'none', skip: 'no-check' };
  return { action: 'queue-second', firstScore: score };
}

function finiteScore(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The alternate kept while the second take renders (queueSlot's `keepTake`). */
export function bestOfTwoFirstTake(
  still: Pick<DaySlotStill, 'promptId'>,
  shownImage: string,
  firstScore: number
): NonNullable<DaySlotStill['previousTake']> {
  return {
    imageUrl: shownImage,
    ...(still.promptId?.trim() ? { promptId: still.promptId.trim() } : {}),
    kind: 'best-of-two',
    poseScore: firstScore,
  };
}

/**
 * The still patch once both takes have landed: the second kept as it is (the first stays as the
 * alternate), or the first put back with the second as the alternate.
 */
export function bestOfTwoPickPatch(
  still: Pick<DaySlotStill, 'slotId' | 'promptId' | 'previousTake'>,
  secondShownImage: string,
  decision: { keep: 'first' | 'second'; firstScore: number; secondScore: number }
): DaySlotStill {
  const first = still.previousTake;
  if (decision.keep === 'second' || !first) {
    return {
      slotId: still.slotId,
      ...(first ? { previousTake: { ...first, poseScore: decision.firstScore } } : {}),
      bestOfTwo: { keptScore: decision.secondScore, otherScore: decision.firstScore },
    };
  }
  return {
    slotId: still.slotId,
    promptId: first.promptId,
    imageUrl: first.imageUrl,
    status: 'completed',
    // The first take's image is already the one it showed (its face finish, if it had one).
    finishedUrl: undefined,
    finishedFor: undefined,
    clipPromptId: undefined,
    clipUrl: undefined,
    clipStatus: undefined,
    previousTake: {
      imageUrl: secondShownImage,
      ...(still.promptId?.trim() ? { promptId: still.promptId.trim() } : {}),
      kind: 'best-of-two',
      poseScore: decision.secondScore,
    },
    bestOfTwo: { keptScore: decision.firstScore, otherScore: decision.secondScore },
  };
}

/** The second take failed: put the first back on its own (no pair left to compare). */
export function bestOfTwoFailedPatch(
  still: Pick<DaySlotStill, 'slotId' | 'previousTake' | 'status'>
): DaySlotStill | null {
  const first = still.previousTake;
  if (first?.kind !== 'best-of-two' || still.status !== 'error') return null;
  return {
    slotId: still.slotId,
    promptId: first.promptId,
    imageUrl: first.imageUrl,
    status: 'completed',
    finishedUrl: undefined,
    finishedFor: undefined,
    previousTake: undefined,
    bestOfTwo: undefined,
  };
}

/**
 * Queue this take as Best of two in ONE job (the Castcut node pack)? Same rules as queueing the
 * second take today — the switch on, Auto-review off, a hard-pose guide, a fresh take (not a
 * same-seed redo or the second take of an old-style pair) — plus the pack being installed.
 */
export function bestOfTwoAsOneJob(input: {
  enabled: boolean;
  autoReview: boolean;
  poseKey: string | null | undefined;
  /** A same-seed redo or a kept take rides along: never batched. */
  keepsATake: boolean;
  packInstalled: boolean;
}): boolean {
  return (
    input.enabled &&
    !input.autoReview &&
    input.packInstalled &&
    !input.keepsATake &&
    isDayHardPose(input.poseKey)
  );
}

/** Is this landed still a one-job pair whose report hasn't been read yet? */
export function bestOfTwoJobPending(
  still:
    | Pick<DaySlotStill, 'status' | 'promptId' | 'bestOfTwoJob' | 'previousTake' | 'bestOfTwo'>
    | null
    | undefined
): boolean {
  return Boolean(
    still?.bestOfTwoJob &&
    still.status === 'completed' &&
    still.promptId?.trim() &&
    !still.previousTake &&
    !still.bestOfTwo
  );
}

/**
 * The still patch from a one-job pair's report: the job already saved the closer take as the
 * still; the other take goes beside it as the alternate (as a two-job pair leaves it). Null when
 * the report has fewer than two takes — the still then goes on as a plain first take.
 */
export function bestOfTwoJobPatch(
  still: Pick<DaySlotStill, 'slotId'>,
  report: Pick<CastcutBestOfTwoReport, 'bestIndex' | 'otherIndex' | 'scores' | 'alternate'>
): DaySlotStill | null {
  if (report.scores.length < 2 || report.bestIndex === report.otherIndex || !report.alternate) {
    return null;
  }
  const kept = report.scores[report.bestIndex] ?? null;
  const other = report.scores[report.otherIndex] ?? null;
  return {
    slotId: still.slotId,
    previousTake: {
      imageUrl: castcutViewUrl(report.alternate),
      kind: 'best-of-two',
      poseScore: other ?? 0,
    },
    bestOfTwo: { keptScore: kept ?? 0, otherScore: other ?? 0 },
  };
}

/** The slot card's mark: the second take rendering, or the pick. */
export function bestOfTwoMark(
  still: (StillForPair & Pick<DaySlotStill, 'bestOfTwoJob'>) | null | undefined
): string | null {
  if (still?.bestOfTwoJob && !still.previousTake && !still.bestOfTwo) {
    return still.status === 'completed' ? null : 'Two takes for the pose…';
  }
  if (still?.previousTake?.kind !== 'best-of-two') return null;
  const pick = still.bestOfTwo;
  if (!pick) return 'Second take for the pose…';
  return `Best of two · pose ${Math.round(pick.keptScore * 100)}% (other ${Math.round(pick.otherScore * 100)}%)`;
}
