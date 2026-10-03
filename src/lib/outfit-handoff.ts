/**
 * Outfit's clothing and shoes, handed to Day and Story. Each tool kept its own copy of the
 * clothing photo and the shoes, and nothing carried Outfit's picks over: a photo and shoes picked
 * in Outfit left Day dressing her from an auto kit, barefoot or in old shoes (only a catalog kit
 * crossed, through shared.lockedWardrobeId). Outfit now writes its picks into both whenever they
 * change; a later choice made in Day or Story stands until Outfit changes again.
 */
import type { DaySlot } from './day-planner';

/** Not a kit: what a try-on from a clothing photo records as its wardrobe id. */
export const CUSTOM_GARMENT_WARDROBE_ID = 'custom-garment';

export type OutfitPicks = {
  customGarmentImageUrl?: string;
  customGarmentImageFilename?: string;
  customGarmentDescription?: string;
  footwear?: string;
  footwearImageUrl?: string;
  footwearImageFilename?: string;
};

const PICK_FIELDS = [
  'customGarmentImageUrl',
  'customGarmentImageFilename',
  'customGarmentDescription',
  'footwear',
  'footwearImageUrl',
  'footwearImageFilename',
] as const;

export function outfitPicks(source: OutfitPicks | null | undefined): OutfitPicks {
  const picks: OutfitPicks = {};
  for (const field of PICK_FIELDS) {
    const value = source?.[field]?.trim();
    if (value) picks[field] = value;
  }
  return picks;
}

/** A stable signature: Outfit hands over only when this changes. */
export function outfitPicksSignature(source: OutfitPicks | null | undefined): string {
  return JSON.stringify(outfitPicks(source));
}

/** The patch for Day's or Story's settings: Outfit's picks, unset fields cleared. */
export type OutfitHandoffPatch = Record<keyof OutfitPicks, string | undefined>;

export function outfitHandoffPatch(source: OutfitPicks | null | undefined): OutfitHandoffPatch {
  const picks = outfitPicks(source);
  return {
    customGarmentImageUrl: picks.customGarmentImageUrl,
    customGarmentImageFilename: picks.customGarmentImageFilename,
    customGarmentDescription: picks.customGarmentDescription,
    footwear: picks.footwear,
    footwearImageUrl: picks.footwearImageUrl,
    footwearImageFilename: picks.footwearImageFilename,
  };
}

/**
 * Day's slots when Outfit hands over a clothing photo: kits Day picked itself (auto) give way, so
 * the photo is worn; kits the player chose on a slot stay. The 'custom-garment' placeholder is
 * never a kit.
 */
export function slotsForOutfitPhoto(slots: DaySlot[], hasPhoto: boolean): DaySlot[] {
  return slots.map(slot =>
    slot.wardrobeId === CUSTOM_GARMENT_WARDROBE_ID || (hasPhoto && slot.wardrobeAuto)
      ? { ...slot, wardrobeId: undefined, wardrobeAuto: undefined }
      : slot
  );
}

/** A real catalog kit id, or '' (drops the photo placeholder). */
export function realKitId(id: string | null | undefined): string {
  const trimmed = id?.trim() || '';
  return trimmed === CUSTOM_GARMENT_WARDROBE_ID ? '' : trimmed;
}

/** Write Outfit's picks into Day's and Story's settings (browser only). */
export async function handOffOutfitPicks(source: OutfitPicks): Promise<void> {
  const {
    DEFAULT_DAY_TOOL_CACHE,
    DEFAULT_ROLEPLAY_TOOL_CACHE,
    loadToolSettings,
    saveToolSettings,
  } = await import('./settings-cache');
  const patch = outfitHandoffPatch(source);
  const hasPhoto = Boolean(patch.customGarmentImageFilename || patch.customGarmentImageUrl);
  const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
  saveToolSettings('day', {
    ...day,
    ...patch,
    slots: slotsForOutfitPhoto(day.slots ?? [], hasPhoto),
  });
  const story = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
  saveToolSettings('roleplay', {
    ...story,
    ...patch,
    // A photo is the outfit; Story's kit would outrank it.
    ...(hasPhoto ? { wardrobeId: undefined } : {}),
  });
}
