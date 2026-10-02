/**
 * Day "dress plate": dress the Cast once — the picked clothing and shoes on the look plate, on
 * white — then start every clothed still from that plate instead of dressing her again in each
 * still from a clothing image.
 *
 * Live on Edit 2511 Lightning (2026-10-02, Vacation, lace dress photo + white sneaker kit, one
 * seed): from the dressed plate 8/8 one-person stills wore the exact dress and the sneakers with
 * the pose held; with a Cast partner (whose face takes the clothing image's slot) the lead wore
 * the exact dress 4/4, where the dress described in words came out as a bustier and skirt 3/4.
 * One extra render (about a minute) per outfit-and-shoes combination, then reused.
 */

import { buildFittingOutfitPrompt } from '@/lib/fitting-room';
import { isDayAdultMood, normalizeDayMood } from '@/lib/day-planner';
import { poseProfileForModel } from '@/lib/pose/pose-model-profile';

export {
  DAY_DRESS_PLATE_CACHE_LIMIT,
  findDayDressPlate,
  forgetDayDressPlate,
  rememberDayDressPlate,
  type DayDressPlateEntry,
} from '@/lib/dress-plate-cache';

/**
 * Whether this still starts from a dress plate. Not for the adult moods (Intimate / Raunchy),
 * Sport (the sport's own kit replaces the outfit), a still that drops the clothing, an Outfit
 * Keep (already a dressed plate), or when neither clothing nor shoes were picked.
 */
export function dayDressPlateApplies(input: {
  model: string | null | undefined;
  dayMood: string | null | undefined;
  plateSource?: 'keeper' | 'cast' | null;
  /** A clothing photo or a kit the player picked (not one the Day picked for itself). */
  clothingPicked: boolean;
  /** Shoes picked (a kit, a photo or words) and not barefoot-by-default "auto". */
  footwearPicked: boolean;
  /** The still drops the garment (nude beat) or replaces the outfit (Sport). */
  omitGarment?: boolean;
  replaceOutfit?: boolean;
}): boolean {
  if (!poseProfileForModel(input.model).dressPlate) return false;
  const mood = normalizeDayMood(input.dayMood);
  if (isDayAdultMood(mood) || mood === 'sport') return false;
  if (input.omitGarment || input.replaceOutfit) return false;
  if (input.plateSource !== 'cast') return false;
  return input.clothingPicked || input.footwearPicked;
}

/**
 * Story's version of the rule: clothed (not an adult-rated) photo stories with a plate and
 * clothing or shoes picked, on an engine with a dress plate, for a beat that keeps its clothes.
 */
export function storyDressPlateApplies(input: {
  model: string | null | undefined;
  adult: boolean;
  photoMode: boolean;
  hasPlate: boolean;
  clothingPicked: boolean;
  footwearPicked: boolean;
  omitGarment?: boolean;
}): boolean {
  if (!poseProfileForModel(input.model).dressPlate) return false;
  if (input.adult || !input.photoMode || !input.hasPlate || input.omitGarment) return false;
  return input.clothingPicked || input.footwearPicked;
}

/** The outfit line for a still that starts from a dressed plate (Story; Day's recipes say it). */
export const DRESS_PLATE_OUTFIT_LINE =
  'OUTFIT (mandatory): she wears exactly the outfit and the shoes she has on in Image 1 — unchanged, fully dressed.';

/**
 * A Story still's prompt, reworded for a dressed plate. The scene writer's fallback says
 * "replace the reference clothing with the beat outfit" and, with no clothing image, the pose
 * map is the second image, not the third — live, the first still from a dressed plate came out
 * in a sequin dress until both were fixed (and the edit opener stopped saying the wardrobe may
 * change: queue these with the balanced edit strength).
 */
export function storyDressPlatePrompt(prompt: string): string {
  const reworded = prompt
    .replace(
      /replace the reference clothing with the beat outfit,?\s*/gi,
      'keep the exact outfit and shoes she wears in the reference photo, '
    )
    .replace(
      /\bdiscard Image 1 (?:clothes|clothing|wardrobe|outfit)\b/gi,
      'keep the Image 1 outfit'
    );
  return /\bImage 2\b/.test(reworded) ? reworded : reworded.replace(/\bImage 3\b/g, 'Image 2');
}

/** One key per plate + clothing + shoes + engine family: any change makes a new dress plate. */
export function dayDressPlateKey(input: {
  plate: string;
  clothing: string;
  footwear: string;
  model: string | null | undefined;
}): string {
  return [
    poseProfileForModel(input.model).family,
    input.plate.trim(),
    input.clothing.trim(),
    input.footwear.trim(),
  ].join('|');
}

/**
 * The try-on that makes the dress plate: Outfit's own try-on brief, full body with both feet in
 * frame (a three-quarter crop would lose the shoes) in the plate's plain standing pose.
 */
export function buildDayDressPlatePrompt(input: {
  outfitLabel: string;
  characterName?: string;
  hasGarmentReference: boolean;
  garmentDescription?: string;
  footwearLine?: string;
  footwearImage?: 'combined' | 'alone' | null;
}): string {
  return buildFittingOutfitPrompt({ ...input, isolated: true }).replace(
    'output: single full-body or three-quarter fashion still of the same person in the new kit',
    'output: single full-body still of the same person in the new kit — head to feet in frame, both feet and shoes visible, the same relaxed standing pose facing the camera'
  );
}

/** What the status line and the tray notice say while the plate renders. */
export function dayDressPlateStatus(input: {
  name?: string | null;
  clothing: boolean;
  footwear: boolean;
}): string {
  const who = input.name?.trim() || 'the lead';
  const what =
    input.clothing && input.footwear
      ? 'the outfit and shoes'
      : input.clothing
        ? 'the outfit'
        : 'the shoes';
  return `Dressing ${who} first — one plate with ${what} (about a minute), then the stills start from it.`;
}
