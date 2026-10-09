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

/** What a look records when a try-on is kept on it (character-os: CharacterLookOutfit). */
export type KeptLookOutfit = OutfitPicks & {
  entryId?: string;
  dressPlateKey?: string;
  wardrobeId?: string;
};

/**
 * The look's outfit from a kept try-on: its kit, or (a try-on from a clothing photo) Outfit's
 * clothing photo; the shoes picked in Outfit either way. A kit try-on carries no photo.
 */
export function keptLookOutfitFromTryOn(
  tryOn: { wardrobeId?: string; galleryEntryId?: string; dressPlateKey?: string },
  picks: OutfitPicks | null | undefined
): KeptLookOutfit {
  const kit = realKitId(tryOn.wardrobeId);
  const chosen = outfitPicks(picks);
  const shoes: OutfitPicks = {
    footwear: chosen.footwear,
    footwearImageUrl: chosen.footwearImageUrl,
    footwearImageFilename: chosen.footwearImageFilename,
  };
  return outfitPicksWith(
    {
      entryId: tryOn.galleryEntryId?.trim() || undefined,
      dressPlateKey: tryOn.dressPlateKey?.trim() || undefined,
    },
    kit ? { wardrobeId: kit, ...shoes } : chosen
  );
}

function outfitPicksWith(base: KeptLookOutfit, extra: KeptLookOutfit): KeptLookOutfit {
  const merged: KeptLookOutfit = {};
  for (const [key, value] of Object.entries({ ...base, ...extra })) {
    if (typeof value === 'string' && value.trim()) {
      merged[key as keyof KeptLookOutfit] = value.trim();
    }
  }
  return merged;
}

/** True when the look's outfit is a clothing photo (not a kit). */
export function keptOutfitHasPhoto(outfit: OutfitPicks | null | undefined): boolean {
  return Boolean(
    outfit?.customGarmentImageFilename?.trim() || outfit?.customGarmentImageUrl?.trim()
  );
}

/**
 * Switching to another look: what one tool's settings (Outfit, Day or Story) take. The new
 * look's kept outfit is put in (its photo and shoes; a kit look clears the photo, its kit is the
 * Cast's outfit lock). A look with no kept outfit takes out only what the previous look put in
 * (a photo or shoes still equal to its kept ones), so a choice made in the tool since stays.
 * Null: nothing to change.
 */
export function lookOutfitSwitchPatch(
  session: OutfitPicks,
  previous: KeptLookOutfit | null | undefined,
  next: KeptLookOutfit | null | undefined
): OutfitHandoffPatch | null {
  if (next) {
    const patch = outfitHandoffPatch(next);
    return outfitPicksSignature(session) === outfitPicksSignature(patch) ? null : patch;
  }
  if (!previous) {
    return null;
  }
  const current = outfitPicks(session);
  const kept = outfitPicks(previous);
  const samePhoto =
    keptOutfitHasPhoto(kept) &&
    current.customGarmentImageFilename === kept.customGarmentImageFilename &&
    current.customGarmentImageUrl === kept.customGarmentImageUrl;
  const sameShoes =
    Boolean(kept.footwear || kept.footwearImageFilename || kept.footwearImageUrl) &&
    current.footwear === kept.footwear &&
    current.footwearImageFilename === kept.footwearImageFilename &&
    current.footwearImageUrl === kept.footwearImageUrl;
  if (!samePhoto && !sameShoes) {
    return null;
  }
  return outfitHandoffPatch({
    ...current,
    ...(samePhoto
      ? {
          customGarmentImageUrl: undefined,
          customGarmentImageFilename: undefined,
          customGarmentDescription: undefined,
        }
      : {}),
    ...(sameShoes
      ? { footwear: undefined, footwearImageUrl: undefined, footwearImageFilename: undefined }
      : {}),
  });
}

export type OutfitHandoffOptions = {
  /** The Day's kit after the hand-off (default: the session's outfit lock as saved). */
  kitId?: string | null;
  /** The Cast whose Day this is (default: the active Cast). */
  characterId?: string | null;
  /** Leave Story alone. */
  story?: boolean;
  /** Leave Day alone (Keep writes Day's settings itself, in one write with its slots). */
  day?: boolean;
};

/**
 * Write Outfit's picks into Day's and Story's settings (browser only). Day's slots follow the
 * new outfit (day-outfit-scope.ts): what an earlier Day-wide choice left on them goes, a slot's
 * own look or kit picked by hand stays and is listed for Day's notice. `source` null: only the
 * kit or the look changed — Day's slots follow, the photo / shoes and Story are untouched.
 */
export async function handOffOutfitPicks(
  source: OutfitPicks | null,
  options: OutfitHandoffOptions = {}
): Promise<void> {
  const [
    { loadSettingsCache, loadToolSettings, saveToolSettings },
    { DEFAULT_DAY_TOOL_CACHE, DEFAULT_ROLEPLAY_TOOL_CACHE },
    { activeLook, getCharacter, looksOf },
    { dayAfterOutfitHandoff },
  ] = await Promise.all([
    import('./settings-cache'),
    import('./play-settings'),
    import('./character-os'),
    import('./day-outfit-scope'),
  ]);
  if (options.day !== false) {
    const shared = loadSettingsCache().shared;
    const character = getCharacter(options.characterId?.trim() || shared.activeCharacterId);
    const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    saveToolSettings('day', {
      ...day,
      ...dayAfterOutfitHandoff(day, {
        ...(source ? { picks: source } : {}),
        kitId: options.kitId !== undefined ? options.kitId : shared.lockedWardrobeId,
        activeLookId: character ? activeLook(character).id : undefined,
        lookIds: character ? looksOf(character).map(look => look.id) : undefined,
        at: Date.now(),
      }),
    });
  }
  if (!source || options.story === false) {
    return;
  }
  const patch = outfitHandoffPatch(source);
  const hasPhoto = Boolean(patch.customGarmentImageFilename || patch.customGarmentImageUrl);
  const story = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
  saveToolSettings('roleplay', {
    ...story,
    ...patch,
    // A photo is the outfit; Story's kit would outrank it.
    ...(hasPhoto ? { wardrobeId: undefined } : {}),
  });
}
