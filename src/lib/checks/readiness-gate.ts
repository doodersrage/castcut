export const DEFAULT_READINESS_MIN_SCORE = 60;

export function isReadinessQueueAllowed(
  score: number,
  minScore = DEFAULT_READINESS_MIN_SCORE
): boolean {
  return score >= minScore;
}

export function readinessGateMessage(
  score: number,
  minScore = DEFAULT_READINESS_MIN_SCORE
): string {
  return `Prompt readiness is ${score}/100 (minimum ${minScore} recommended before queueing). Fix issues below or queue anyway.`;
}
