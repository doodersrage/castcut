/**
 * Drop negated clauses ("never solo Cast", "not a standing portrait", "no third person") before
 * reading a pose or headcount from beat / prompt text. Those clauses are locks, not the scene —
 * read literally, "never Cast alone" made partner beats solo and "never solo" made every Day duo
 * guide a missionary fallback. Runs to the next clause break.
 */
export function stripNegatedClauses(text: string): string {
  return text.replace(/\b(?:never|not|no)\b[^.,;:—\n]*/gi, ' ');
}

/**
 * The scene a prompt describes, without its locks and conditions: "Never a topless, bottomless,
 * or sports-bra-only look" (Sport's running kit) and "zero fabric when the beat is nude" say
 * nothing about this still. "never" and "without" run to the sentence break (they lead lists);
 * "when", "if" and "unless" to the next clause break.
 */
export function stripLocksAndConditions(text: string): string {
  return stripNegatedClauses(text.replace(/\b(?:never|without)\b[^.;:\n]*/gi, ' ')).replace(
    /\b(?:when|if|unless)\b[^.,;:—\n]*/gi,
    ' '
  );
}
