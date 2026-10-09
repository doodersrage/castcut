/**
 * Compact spoon recipe for FLUX.2 Klein Day stills (clothed moods).
 *
 * Klein puts a third body into a spoon still whatever the long Day brief says: the spoon guide's
 * two skeletons overlap, and Klein reads the overlap as another person (a third head in nearly
 * every seed, with or without the RefControl pose LoRA, prompt trims, or a named outfit for
 * him). FLUX.2 weights the start of the prompt and has no negative prompts, so a short,
 * front-loaded description of where each body lies works better than the ~3k-char brief.
 * Live on the real Day spoon graph (Klein 9B Distilled, 8 seeds): this recipe without a guide
 * drew two people 6/8; with the overlapping spoon guide, 0/8. Queued from the real Day screen
 * (plate only, 8 seeds): two people 5/8, where the brief + spoon guide had drawn a third body in
 * nearly every seed.
 */

import { CLOTHED_SPOON_RE } from './day-pose-guide';
import { KLEIN_SPOON_RECIPE_MARK } from './prompt-recipe-mark';
import { isFluxKleinModel } from './model-denoise-defaults';
import { inferPoseGuidePartner } from './pose-guide-prompt';

/**
 * The Klein spoon recipe applies: Klein, a clothed mood, a spoon beat, and a partner the beat
 * names as a man (the only case tested). Day then sends the recipe with no pose guide and no
 * face crop — the plate alone, as tested. Separating the two skeletons was worse: Klein drew
 * the upper one as a third person floating over the bed (8/8).
 */
export function kleinSpoonRecipeApplies(input: {
  model: string | null | undefined;
  /** Intimate / Raunchy (isDayAdultMood) — those moods keep the adult path. */
  adultMood: boolean;
  beat: string | null | undefined;
}): boolean {
  const beat = input.beat ?? '';
  return (
    isFluxKleinModel(input.model) &&
    !input.adultMood &&
    CLOTHED_SPOON_RE.test(beat) &&
    inferPoseGuidePartner(beat) === 'man'
  );
}

export { KLEIN_SPOON_RECIPE_MARK };

/** "outfit-tailored-cobalt-slip-dress" → "tailored cobalt slip dress". */
function readableOutfit(outfit: string | null | undefined): string {
  return (outfit ?? '')
    .trim()
    .replace(/^outfit-/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

export function buildKleinSpoonRecipe(input: {
  /** Slot outfit label or kit id; empty = her own outfit from Image 1. */
  outfit?: string | null;
  setting?: string | null;
  /** Clothes for the male partner (KLEIN_MALE_PARTNER_OUTFIT_LINE's garments). */
  partnerOutfit: string;
}): string {
  const outfit = readableOutfit(input.outfit);
  const setting = input.setting?.trim();
  return [
    KLEIN_SPOON_RECIPE_MARK,
    'The woman from image 1 lies in front, facing the camera, her head on the pillow.',
    'Her boyfriend lies close behind her, his chest against her back and one arm over her waist, his head just above and behind hers.',
    `${outfit ? `She wears a ${outfit}` : 'She wears her own outfit from image 1'}; he wears ${input.partnerOutfit}.`,
    setting ? `Setting: ${setting}.` : '',
    'Soft natural light, photorealistic, same face as image 1.',
  ]
    .filter(Boolean)
    .join(' ');
}
