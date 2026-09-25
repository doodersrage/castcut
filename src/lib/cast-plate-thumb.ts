/** Small look-plate thumbnail for a Cast (roster, Gallery Cast filter). */

import type { CharacterRecord } from '@/lib/character-os';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import { cacheBustIdentityMediaUrl } from '@/lib/gallery-media-client';

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
