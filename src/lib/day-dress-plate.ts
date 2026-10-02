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

export type DayDressPlateEntry = {
  /** What it was made from (dayDressPlateKey). */
  key: string;
  /** ComfyUI input filename of the dressed plate. */
  filename: string;
  imageUrl?: string;
  at: number;
};

/** Outfit arcs use two kits a day; keep a few so switching back does not re-render. */
export const DAY_DRESS_PLATE_CACHE_LIMIT = 6;

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

export function findDayDressPlate(
  cache: readonly DayDressPlateEntry[] | null | undefined,
  key: string
): DayDressPlateEntry | null {
  return cache?.find(entry => entry.key === key && entry.filename?.trim()) ?? null;
}

/** Newest first, one entry per key, capped. */
export function rememberDayDressPlate(
  cache: readonly DayDressPlateEntry[] | null | undefined,
  entry: DayDressPlateEntry
): DayDressPlateEntry[] {
  return [entry, ...(cache ?? []).filter(item => item.key !== entry.key)].slice(
    0,
    DAY_DRESS_PLATE_CACHE_LIMIT
  );
}

/** Drop one key (its file is gone from ComfyUI's input folder). */
export function forgetDayDressPlate(
  cache: readonly DayDressPlateEntry[] | null | undefined,
  key: string
): DayDressPlateEntry[] {
  return (cache ?? []).filter(item => item.key !== key);
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
