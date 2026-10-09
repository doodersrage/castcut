/** Leads every Rapid duo recipe — reinforce / queue steering skip their long packs on it. */
export const RAPID_DUO_RECIPE_MARK = 'Explicit sex photo:';

/** Leads every Rapid solo recipe — same treatment as the duo one. */
export const RAPID_SOLO_RECIPE_MARK = 'Explicit solo photo:';

/** Leads every Rapid clothed Suggestive recipe. */
export const RAPID_SUGGESTIVE_RECIPE_MARK = 'Suggestive photo:';

/** Leads every Rapid Vacation recipe. */
export const RAPID_VACATION_RECIPE_MARK = 'Vacation photo:';

/** Leads the compact clothed recipe for Everyday / Sport / themed days (Edit 2511). */
export const DAY_CLOTHED_RECIPE_MARK = 'Day photo:';

/** Leads every FLUX.2 Klein spoon recipe (klein-duo-recipe.ts). */
export const KLEIN_SPOON_RECIPE_MARK =
  'Photo of exactly two adults lying on their sides on a bed, spooning.';

/** A compact Rapid recipe (duo or solo) — its length is the point, so nothing appends to it. */
export function isRapidDuoRecipePrompt(prompt: string | null | undefined): boolean {
  const text = prompt ?? '';
  return (
    text.includes(RAPID_DUO_RECIPE_MARK) ||
    text.includes(RAPID_SOLO_RECIPE_MARK) ||
    text.includes(RAPID_SUGGESTIVE_RECIPE_MARK) ||
    text.includes(RAPID_VACATION_RECIPE_MARK) ||
    text.includes(DAY_CLOTHED_RECIPE_MARK) ||
    text.includes(KLEIN_SPOON_RECIPE_MARK)
  );
}
