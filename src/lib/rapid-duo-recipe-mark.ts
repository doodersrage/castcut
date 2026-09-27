/** Leads every Rapid duo recipe — reinforce / queue steering skip their long packs on it. */
export const RAPID_DUO_RECIPE_MARK = 'Explicit sex photo:';

/** Leads every Rapid solo recipe — same treatment as the duo one. */
export const RAPID_SOLO_RECIPE_MARK = 'Explicit solo photo:';

/** A compact Rapid recipe (duo or solo) — its length is the point, so nothing appends to it. */
export function isRapidDuoRecipePrompt(prompt: string | null | undefined): boolean {
  const text = prompt ?? '';
  return text.includes(RAPID_DUO_RECIPE_MARK) || text.includes(RAPID_SOLO_RECIPE_MARK);
}
