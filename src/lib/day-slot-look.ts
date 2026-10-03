/**
 * A look per Day slot. A Cast can have several looks (a plate, an outfit lock or a kept outfit
 * each); a slot can be made in one of them without changing the active look — its plate (and the
 * face crop / dressed plate made from it) and its outfit. Unset, or the active look, the slot
 * queues exactly as before: the same record, plate and outfit picks come back.
 */
import { activeLook, characterWithLook, looksOf, type CharacterRecord } from './character-os';
import type { ComfyGalleryEntry } from './comfyui-gallery';
import { resolveDayPlate, resolveDayPlateForIsolate, type DayPlate } from './day-plate';
import type { DaySlot } from './day-planner';
import { keptOutfitHasPhoto, outfitPicks, type OutfitPicks } from './outfit-handoff';

/** What dresses a Day still: the outfit lock (a kit) and the clothing photo / shoes picks. */
export type DaySlotOutfit = OutfitPicks & { lockedWardrobeId?: string };

export type DaySlotLook = {
  /** The slot's own look, when it is not the active one (undefined: the active look). */
  lookId?: string;
  /** The Cast as the still sees it: with the slot's look applied (not stored). */
  character: CharacterRecord | null | undefined;
  /**
   * The slot look's Day plate (its latest Outfit keeper, else its Cast plate). Undefined for the
   * active look: Day's own plate (with its isolate cut-out) stands.
   */
  plate?: DayPlate | null;
  /** The outfit for this still: Day's picks, or the slot look's own outfit. */
  outfit: DaySlotOutfit;
};

/** The look a slot names, when it is one of the Cast's and not the active one. */
export function daySlotOwnLookId(
  character: CharacterRecord | null | undefined,
  slot: Pick<DaySlot, 'lookId'> | null | undefined
): string | undefined {
  const id = slot?.lookId?.trim();
  if (!id || !character) return undefined;
  if (activeLook(character).id === id) return undefined;
  return looksOf(character).some(look => look.id === id) ? id : undefined;
}

/**
 * Resolve the look a Day slot is made in. `outfit` is Day's current dressing (the session's
 * outfit lock and Day's clothing photo / shoes), returned untouched for the active look.
 *
 * A slot look with an outfit of its own (an outfit lock, or a clothing photo kept on it) wears
 * that: its kit, or its photo, never the other's; its kept shoes when it has some, else Day's.
 * A slot look with no outfit of its own wears Day's picks. The plate is that look's: its latest
 * Outfit keeper, else its Cast plate; with Isolate on it is the look's stored cut-out when it has
 * one (Day's isolate cut-out is made for the active look's plate only).
 */
export function resolveDaySlotLook(input: {
  character: CharacterRecord | null | undefined;
  slot: Pick<DaySlot, 'lookId'> | null | undefined;
  outfit: DaySlotOutfit;
  gallery?: ComfyGalleryEntry[] | null;
  isolateSubject?: boolean;
}): DaySlotLook {
  const lookId = daySlotOwnLookId(input.character, input.slot);
  if (!lookId || !input.character) {
    return { character: input.character, outfit: input.outfit };
  }
  const character = characterWithLook(input.character, lookId);
  const look = activeLook(character);
  const basePlate = resolveDayPlate({ character, gallery: input.gallery });
  const plate = resolveDayPlateForIsolate({
    basePlate,
    isolateSubject: input.isolateSubject === true,
    cache: {},
  });
  return { lookId, character, plate, outfit: daySlotLookOutfit(look, input.outfit) };
}

/** The outfit a (non-active) look dresses its slot in; see resolveDaySlotLook. */
export function daySlotLookOutfit(
  look: Pick<ReturnType<typeof activeLook>, 'lockedWardrobeId' | 'keptOutfit'>,
  dayOutfit: DaySlotOutfit
): DaySlotOutfit {
  const lock = look.lockedWardrobeId?.trim() || undefined;
  const kept = look.keptOutfit ? outfitPicks(look.keptOutfit) : {};
  const keptPhoto = keptOutfitHasPhoto(kept);
  if (!lock && !keptPhoto) {
    return dayOutfit;
  }
  const keptShoes = Boolean(kept.footwear || kept.footwearImageFilename || kept.footwearImageUrl);
  return {
    lockedWardrobeId: keptPhoto ? undefined : lock,
    customGarmentImageUrl: keptPhoto ? kept.customGarmentImageUrl : undefined,
    customGarmentImageFilename: keptPhoto ? kept.customGarmentImageFilename : undefined,
    customGarmentDescription: keptPhoto ? kept.customGarmentDescription : undefined,
    footwear: keptShoes ? kept.footwear : dayOutfit.footwear,
    footwearImageUrl: keptShoes ? kept.footwearImageUrl : dayOutfit.footwearImageUrl,
    footwearImageFilename: keptShoes ? kept.footwearImageFilename : dayOutfit.footwearImageFilename,
  };
}
