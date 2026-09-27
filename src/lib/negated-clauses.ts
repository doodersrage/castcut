/**
 * Drop negated clauses ("never solo Cast", "not a standing portrait", "no third person") before
 * reading a pose or headcount from beat / prompt text. Those clauses are locks, not the scene —
 * read literally, "never Cast alone" made partner beats solo and "never solo" made every Day duo
 * guide a missionary fallback. Runs to the next clause break.
 */
export function stripNegatedClauses(text: string): string {
  return text.replace(/\b(?:never|not|no)\b[^.,;:—\n]*/gi, ' ');
}
