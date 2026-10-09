/** Plain reading of a beat's words, shared by the renderers and Play's recipes. */

import { stripNegatedClauses } from './negated-clauses';

/**
 * A beat that has her lying down ("lying on the rug", "propped back on her elbows on the grass").
 * Not a sprawl in a chair — that is a sit.
 */
export function beatLiesDown(beat: string | null | undefined): boolean {
  const text = stripNegatedClauses(beat ?? '');
  return (
    /\b(?:lying|lies|laying|reclining)\b|\bpropped\s+back\s+on\s+(?:her|both)\s+elbows\b/i.test(
      text
    ) ||
    (/\bsprawled\b/i.test(text) && !/\b(?:arm)?chair\b/i.test(text))
  );
}
