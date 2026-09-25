/**
 * Which take to show: when a Story beat or Day slot has several stills, prefer the one that
 * followed its pose guide and looks like the Cast — not just the newest.
 *
 * Pure; no browser or ComfyUI.
 */

export type TakeScores = {
  /** Pose match 0–1, when measured. */
  pose?: number | null;
  /** Face similarity 0–1, when measured (solo stills). */
  face?: number | null;
  /** Vision review overall 1–5 (Day Auto-review), when reviewed. */
  overall?: number | null;
};

export type TakeThresholds = { minPose: number; minFace: number };

/** A pose-score lead this large counts as clearly better even with the same misses. */
export const BETTER_TAKE_POSE_MARGIN = 0.15;

function misses(take: TakeScores, thresholds: TakeThresholds): number {
  return (
    (take.pose != null && take.pose < thresholds.minPose ? 1 : 0) +
    (take.face != null && take.face < thresholds.minFace ? 1 : 0)
  );
}

function measured(take: TakeScores): boolean {
  return take.pose != null || take.face != null;
}

/** True when `a` is clearly better than `b` (never on a vision score that is worse). */
export function isClearlyBetterTake(
  a: TakeScores,
  b: TakeScores,
  thresholds: TakeThresholds
): boolean {
  if (!measured(a) || !measured(b)) return false;
  if (a.overall != null && b.overall != null && a.overall < b.overall) return false;
  const missA = misses(a, thresholds);
  const missB = misses(b, thresholds);
  if (missA !== missB) return missA < missB;
  return (a.pose ?? 0) - (b.pose ?? 0) >= BETTER_TAKE_POSE_MARGIN;
}

/**
 * Index of a take clearly better than the current one (the best such take), or null to keep
 * the current take. Unmeasured takes never win or lose.
 */
export function betterTakeIndex(
  takes: TakeScores[],
  currentIndex: number,
  thresholds: TakeThresholds
): number | null {
  const current = takes[currentIndex];
  if (!current) return null;
  let best: number | null = null;
  takes.forEach((take, index) => {
    if (index === currentIndex || !isClearlyBetterTake(take, current, thresholds)) return;
    if (best === null || isClearlyBetterTake(take, takes[best]!, thresholds)) {
      best = index;
    } else if (
      misses(take, thresholds) === misses(takes[best]!, thresholds) &&
      (take.pose ?? 0) > (takes[best]!.pose ?? 0)
    ) {
      best = index;
    }
  });
  return best;
}
