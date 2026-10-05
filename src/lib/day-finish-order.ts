/**
 * Day's order of work after a still lands (pure). Balanced runs the pose check (DWPose, a few
 * seconds) and its vision questions BEFORE Face finish (a 40–80 s pass on another model): a take
 * the check redoes is replaced anyway, so finishing its face first was wasted GPU time, and the
 * redo started a pass later than it had to. Face finish then waits for each take's check to
 * settle — the check kept it (matched, or already redone once), or could not run.
 *
 * Auto-review (Best) keeps its own order: it reviews the finished face, so it still waits for
 * Face finish.
 */

/** True when the pose-redo check owns the Day's checks and runs before Face finish. */
export function dayChecksRunBeforeFaceFinish(settings: {
  faceFinish: boolean;
  redoPoseMisses: boolean;
  autoReviewStills: boolean;
}): boolean {
  return settings.faceFinish && settings.redoPoseMisses && !settings.autoReviewStills;
}

/** Per slot: the take whose checks have settled (kept — no redo is coming for it). */
export type DaySettledTakes = Readonly<Record<string, string>>;

export type DayChecksGate = {
  settledTakes: DaySettledTakes;
  /** The pose check can't run this session (no DWPose): nothing to wait for. */
  checksOff: boolean;
};

/** Record a slot's take as checked and kept. Returns the same object when nothing changes. */
export function settleDayTake(
  settled: DaySettledTakes,
  slotId: string,
  take: string
): DaySettledTakes {
  if (!slotId || !take || settled[slotId] === take) return settled;
  return { ...settled, [slotId]: take };
}

/** Should Face finish leave this take for now, because its checks haven't settled yet? */
export function faceFinishAwaitsChecks(
  gate: DayChecksGate | null | undefined,
  slotId: string,
  take: string
): boolean {
  if (!gate || gate.checksOff) return false;
  return gate.settledTakes[slotId] !== take;
}
