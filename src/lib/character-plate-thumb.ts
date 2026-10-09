/** Small look-plate thumbnail for a Cast (roster, Gallery Cast filter) and its Looks tiles. */

import { looksOf, type CharacterLook, type CharacterRecord } from '@/lib/character-os';
import type { PortraitTile } from '@/components/ui/PortraitTileStrip';
import { getCachedClothingLabel, humanizeClothingId } from '@/lib/clothing-catalog-client';
import { resolveFittingPlateFromCharacter, resolveLookPlate } from '@/lib/character-plate';
import { cacheBustIdentityMediaUrl, isIdentityMediaUrl } from '@/lib/gallery-media-client';

/** Look plate URL for a Cast, or '' — look plates only, never the face-lock IP fallback. */
export function castPlateThumbUrl(character: CharacterRecord): string {
  const plate = resolveFittingPlateFromCharacter(character);
  const hasLookPlate = Boolean(
    character.reference?.originalUrl?.trim() ||
    character.reference?.isolatedUrl?.trim() ||
    character.looks?.some(
      look => look.reference?.originalUrl?.trim() || look.reference?.isolatedUrl?.trim()
    )
  );
  if (!hasLookPlate) {
    return '';
  }
  const url = plate?.imageUrl?.trim();
  return url ? cacheBustIdentityMediaUrl(url) : '';
}

/** Old builds named every saved look "New look" — those (and blank names) read as "Look N". */
const PLACEHOLDER_LOOK_NAME = /^new look$/i;

/**
 * What a look is called on its tile. `number` is the look's place oldest-first (1 = first look),
 * so adding a look never renumbers the others. The stored name is left as it is.
 */
export function castLookDisplayName(name: string | undefined, number: number): string {
  const trimmed = name?.trim() ?? '';
  return trimmed && !PLACEHOLDER_LOOK_NAME.test(trimmed) ? trimmed : `Look ${number}`;
}

/** Name for a look about to be added: the next free "Look N" among the tiles' names. */
export function nextCastLookName(character: CharacterRecord): string {
  const looks = looksOf(character);
  const taken = new Set(
    looks.map((look, index) => castLookDisplayName(look.name, looks.length - index).toLowerCase())
  );
  let number = looks.length + 1;
  while (taken.has(`look ${number}`)) {
    number += 1;
  }
  return `Look ${number}`;
}

/** Readable outfit-lock name: the catalog label when loaded, else the humanized kit id. */
export function castLookOutfitLabel(
  wardrobeId: string | undefined,
  keptOutfit?: CharacterLook['keptOutfit']
): string {
  const id = wardrobeId?.trim();
  if (!id) {
    return keptPhotoOutfitLabel(keptOutfit);
  }
  return getCachedClothingLabel(id) ?? humanizeClothingId(id);
}

/** Longest caption a kept clothing photo's description gets under a look's tile. */
export const CAST_LOOK_OUTFIT_CAPTION_MAX = 40;

/**
 * A look's kept clothing photo, in words: its description, clipped at a word for the tile
 * caption ("a clothing photo" when it was never described). '' without a kept photo.
 */
export function keptPhotoOutfitLabel(keptOutfit: CharacterLook['keptOutfit']): string {
  if (
    !keptOutfit?.customGarmentImageFilename?.trim() &&
    !keptOutfit?.customGarmentImageUrl?.trim()
  ) {
    return '';
  }
  const words = keptOutfit.customGarmentDescription?.replace(/\s+/g, ' ').trim() ?? '';
  if (!words) {
    return 'Clothing photo';
  }
  if (words.length <= CAST_LOOK_OUTFIT_CAPTION_MAX) {
    return words;
  }
  const cut = words.slice(0, CAST_LOOK_OUTFIT_CAPTION_MAX - 1);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > 12 ? cut.slice(0, atWord) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

export type CastPlateTile = {
  /** The look id — a plate is a look's picture. */
  id: string;
  label: string;
  thumb?: string;
  hasPlate: boolean;
  /** The look's outfit, as words: its lock, else its kept clothing photo (absent with neither). */
  outfit?: string;
};

/**
 * One tile per look of a Cast, newest first — every look, with or without a plate. The thumb is
 * that look's own picture, never another look's; the shared face-lock file is left out too (it
 * holds whichever face was locked last, maybe another Cast's), so such a plate shows its initial.
 */
export function castPlateTiles(
  character: CharacterRecord,
  options?: { outfitLabel?: (wardrobeId: string) => string }
): CastPlateTile[] {
  const looks = looksOf(character);
  const outfitLabel = options?.outfitLabel ?? castLookOutfitLabel;
  return looks.map((look: CharacterLook, index) => {
    const plate = resolveLookPlate(look);
    const url = plate?.imageUrl?.trim() || '';
    const wardrobeId = look.lockedWardrobeId?.trim();
    const outfit = wardrobeId
      ? outfitLabel(wardrobeId).trim()
      : keptPhotoOutfitLabel(look.keptOutfit);
    return {
      id: look.id,
      label: castLookDisplayName(look.name, looks.length - index),
      ...(url && !isIdentityMediaUrl(url) ? { thumb: url } : {}),
      hasPlate: Boolean(url || plate?.filename?.trim()),
      ...(outfit ? { outfit } : {}),
    };
  });
}

/** A look's tile: its own plate, or an Add plate box — never another look's picture. */
export function castLookPortraitTile(
  tile: CastPlateTile,
  options?: { placeholder?: string }
): PortraitTile {
  const outfit = tile.outfit ? ` · ${tile.outfit}` : '';
  return {
    id: tile.id,
    label: tile.label,
    title: tile.hasPlate ? `${tile.label}${outfit}` : `${tile.label}${outfit} — no plate yet`,
    thumb: tile.thumb,
    caption: tile.outfit,
    ...(tile.hasPlate ? {} : { placeholder: options?.placeholder ?? 'Add plate' }),
  };
}
