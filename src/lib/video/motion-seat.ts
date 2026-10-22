/**
 * Copy moves: a seat put into the still before she sits. Wan Animate 2 draws the background from
 * the reference still, not from the prompt — a "wooden chair behind her" in Place alone left her
 * sitting on air. With the chair edited into the still (Rapid AIO, a plain edit), she sits on it.
 * Client-safe: words only (the edit runs in motion-seat-server.ts).
 */

/** The longest seat description kept ("a wooden chair", "a grey sofa"). */
export const SEAT_MAX = 80;

/** A seat description from a form field: trimmed, one line, null when empty. */
export function cleanSeat(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, SEAT_MAX).trim();
  return text || null;
}

/** "a wooden chair" → "the wooden chair" (for the motion line). */
export function theSeat(seat: string): string {
  return seat.trim().replace(/^(a|an|one|some)\s+/i, 'the ');
}

/** The edit: the seat on the floor right behind her, everything else as it is. */
export function seatStillPrompt(seat: string): string {
  return [
    `Add ${seat} standing on the floor directly behind the person, centered behind them and partly hidden behind their legs, facing the same way they face (its front toward where they look), its seat at about the height of their knees, ready for them to sit straight down onto it.`,
    'If that seat already stands right behind them, keep it as it is.',
    'Keep the person, face, expression, pose, body, clothing, shoes, the framing, the light and the rest of the place exactly as they are.',
  ].join(' ');
}

/**
 * A still that already shows a seat behind or under her needs no edit — the edit may add a second
 * one. The vision model's yes/no question (asked through /api/pose-gesture).
 */
export const SEAT_SEEN_QUESTION = {
  id: 'seat',
  text: 'Is there a chair, armchair, sofa, couch, bench, stool, bed or other seat right behind or under the person, close enough that they could sit straight down onto it?',
  label: 'a seat behind them',
} as const;

/** How sure a "yes" must be before the edit is left off. */
export const SEAT_SEEN_MIN_CONFIDENCE = 60;

/**
 * The vision model's answer → true (a seat is there: leave the edit off), false (none), or null
 * (no answer, unsure, or a hesitant yes: keep the edit on, as without the check).
 */
export function seatSeenFromAnswers(
  answers: ReadonlyArray<{
    id: string;
    answer: 'yes' | 'no' | 'unsure';
    confidence: number;
  }> | null
): boolean | null {
  const answer = answers?.find(entry => entry.id === SEAT_SEEN_QUESTION.id);
  if (!answer) return null;
  if (answer.answer === 'no') return false;
  if (answer.answer === 'yes' && answer.confidence >= SEAT_SEEN_MIN_CONFIDENCE) return true;
  return null;
}
