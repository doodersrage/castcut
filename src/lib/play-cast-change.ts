/**
 * Play's Cast-change clean-up (registered with settings-cache by play-features.ts): the Day is
 * parked under its Cast, and Outfit / Day / Story plates of the previous Cast are dropped.
 */

import { swapDayForCast } from './day-cast-park';
import type { ToolSettingsCache } from './settings-cache';

/**
 * Clear Cast-bound Play tool plates when activeCharacterId changes.
 * Outfit/Day/Story otherwise keep the previous look plate or isolate cutout.
 */
export function scrubPlayToolCachesOnCastChange(
  tools: ToolSettingsCache,
  previousCast = '',
  nextCast = ''
): ToolSettingsCache {
  let next: ToolSettingsCache = { ...tools };

  if (next.day) {
    next = {
      ...next,
      day: {
        ...next.day,
        // The Day is parked under the Cast it belongs to and the next Cast's comes back.
        ...swapDayForCast(next.day, previousCast, nextCast),
        referenceIsolated: false,
        plateIsolateSourceKey: undefined,
        plateCharacterId: undefined,
        plateImageUrl: undefined,
        plateImageFilename: undefined,
        plateOriginalUrl: undefined,
        plateOriginalFilename: undefined,
      },
    };
  }

  if (next.fitting) {
    next = {
      ...next,
      fitting: {
        ...next.fitting,
        referenceIsolated: false,
        referenceImageUrl: undefined,
        referenceImageFilename: undefined,
        referenceOriginalUrl: undefined,
        referenceOriginalFilename: undefined,
        previewPlateFilename: undefined,
        previewPlateUrl: undefined,
        previewPlateSourceKey: undefined,
        // Keep the in-flight Look plate job. It belongs to pendingOutfitPlateCharacterId,
        // not the Cast being activated, and must not be dropped or stamped here.
        // Allow Cast look reseed after switch (user clear still sets this true).
        suppressAutoPlateSeed: false,
        // Another Cast's try-ons are not this one's to keep.
        compareTryOns: undefined,
        pendingTryOn: undefined,
      },
    };
  }

  if (next.roleplay) {
    next = {
      ...next,
      roleplay: {
        ...next.roleplay,
        referenceIsolated: false,
        referenceImageUrl: undefined,
        referenceImageFilename: undefined,
        referenceOriginalUrl: undefined,
        referenceOriginalFilename: undefined,
      },
    };
  }

  return next;
}
