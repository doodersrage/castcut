/** Leads every Rapid duo recipe — reinforce / queue steering skip their long packs on it. */
export const RAPID_DUO_RECIPE_MARK = 'Explicit sex photo:';

export function isRapidDuoRecipePrompt(prompt: string | null | undefined): boolean {
  return (prompt ?? '').includes(RAPID_DUO_RECIPE_MARK);
}
