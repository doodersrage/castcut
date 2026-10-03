/**
 * Who sits where in an oral beat — shared by the Rapid duo recipe (rapid-duo-recipe.ts) and the
 * oral pose map (day-pose-guide.ts), so the words and the drawing agree.
 *
 * The oral map used to draw the receiver upright on her knees with the giver kneeling beside her,
 * while the recipe sat her on the edge of the couch with him kneeling between her thighs. Rapid
 * followed neither: the man came out lying upside down on his back under her (user's Day
 * Intimate still, 2026-10-03).
 */
import { stripNegatedClauses } from './negated-clauses';

const SURFACE_RE =
  /\b(?:on|onto|against|over|across|in|into|off|at)\s+(?:the|a|an|his|her|their)\s+((?:(?:arm|edge|foot|end)\s+of\s+the\s+(?:bed|couch|sofa|chair))|(?:(?!(?:at|on|in|of|the|a|an|to|by|with)\b)[\w’'-]+\s+){0,2}?(?:bed(?:\s+edge)?|daybed|couch|sofa|armchair|chair|sink|counter|desk|table|wall|floor|rug|shower|window|door|fridge|wardrobe|cabinet|stairs|bench|vanity|dresser|mattress|sheets))\b/i;

/** The furniture the beat puts them on ("the hotel armchair", "the bathroom sink"). */
export function rapidDuoSurface(beat: string): string | null {
  const match = stripNegatedClauses(beat).match(SURFACE_RE)?.[1]?.trim();
  if (!match) {
    return null;
  }
  const noun = match.replace(/\s+/g, ' ').toLowerCase();
  // Sheets and a mattress are the bed: "in the late-morning sheets" made "the edge of the
  // late-morning sheets". A bed word before them stays ("the rumpled sheets" → "rumpled bed").
  const sheets = noun.match(/^(?:(.+)\s+)?(?:sheets|mattress)$/);
  if (sheets) {
    const kind = sheets[1]?.match(/\b(?:unmade|rumpled|hotel|tangled)$/)?.[0];
    return kind ? `${kind} bed` : 'bed';
  }
  return noun;
}

/** A floor / rug can't be sat on the edge of — oral there has the receiver standing. */
export function isFloorSurface(surface: string | null): boolean {
  return Boolean(surface && /\b(?:floor|rug|carpet|ground|tiles?|mat)\b/i.test(surface));
}

/** She gives ("she goes down on him", "giving her partner oral") vs he gives ("going down on her"). */
export function sheGivesOral(beat: string): boolean {
  return (
    /\b(?:she|her)\s+(?:goes|going|went)\s+down\s+on\s+(?:him|her\s+partner|a\s+partner)\b|\bgiving\s+(?:him|her\s+partner|a\s+partner)\s+(?:oral|head|a\s+blow)|\bbetween\s+his\s+(?:legs|knees|thighs)\b|\b(?:blow\s*job|fellatio|sucking\s+(?:him|his))\b/i.test(
      beat
    ) &&
    !/\b(?:down\s+on\s+her\b(?!\s+partner)|between\s+her\s+thighs|mouth\s+on\s+her\b|cunnilingus)/i.test(
      beat
    )
  );
}

/** A seat in the beat that the receiver sits on the edge of (the recipe's seated oral). */
export const ORAL_SEAT_RE =
  /\b(?:bed|mattress|sheets|couch|sofa|chair|armchair|counter|desk|table)\b/i;

/**
 * Guide text for a 69 / face-sitting beat on Rapid, which renders it as seated oral
 * (day-slot-pose.ts). Read back by {@link oralReceiverSeated}.
 */
export const SEATED_ORAL_GUIDE_TEXT = 'seated oral sex';

/**
 * True when the man + woman Rapid recipe seats the receiver on an edge with the giver kneeling
 * between her knees: she gives anywhere but on a floor (he sits on the bed edge), or he gives
 * kneeling at a seat. A piano bench keeps its own kneel-up drawing.
 */
export function oralReceiverSeated(text: string | null | undefined): boolean {
  const beat = text?.trim() || '';
  if (!beat || /\b(?:piano\s+bench|piano\s+stool|bench)\b/i.test(beat)) {
    return false;
  }
  if (beat.toLowerCase().includes(SEATED_ORAL_GUIDE_TEXT)) {
    return true;
  }
  if (sheGivesOral(beat)) {
    return !isFloorSurface(rapidDuoSurface(beat));
  }
  return /\bkneel/i.test(beat) && ORAL_SEAT_RE.test(beat);
}
