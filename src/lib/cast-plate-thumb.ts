/** Small look-plate thumbnail for a Cast (roster, Gallery Cast filter). */

import { looksOf, type CharacterRecord } from '@/lib/character-os';
import { resolveFittingPlateFromCharacter, resolveLookPlate } from '@/lib/fitting-room';
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

export type CastPlateTile = {
  /** The look id — a plate is a look's picture. */
  id: string;
  label: string;
  thumb?: string;
  hasPlate: boolean;
};

/**
 * One tile per plate (look) of a Cast, newest first. The thumb is that look's own picture; the
 * shared face-lock file is left out (it holds whichever face was locked last, maybe another
 * Cast's), so such a plate shows its initial.
 */
export function castPlateTiles(character: CharacterRecord): CastPlateTile[] {
  return looksOf(character).map(look => {
    const plate = resolveLookPlate(look);
    const url = plate?.imageUrl?.trim() || '';
    return {
      id: look.id,
      label: look.name,
      ...(url && !isIdentityMediaUrl(url) ? { thumb: url } : {}),
      hasPlate: Boolean(url || plate?.filename?.trim()),
    };
  });
}
