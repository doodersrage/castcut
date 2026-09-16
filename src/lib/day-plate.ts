import { activeLook, type CharacterRecord } from '@/lib/character-os';
import {
  galleryEntryDownloadUrls,
  galleryEntryPrimaryViewUrl,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { resolveFittingPlateFromCharacter, type FittingPlate } from '@/lib/fitting-room';

export type DayPlateSource = 'keeper' | 'cast';

/** Identity / preview still for Day — Outfit Keep preferred for display. */
export type DayPlate = FittingPlate & {
  source: DayPlateSource;
};

/**
 * Qwen Edit 2511 VL anchors body pose from Image 1. Keep must stay Image 1 for
 * worn-kit fidelity (Cast-as-Image-1 drops the outfit). Pose unlock is prompt-led.
 */
export function isQwenEdit2511PoseStickyModel(model?: string | null): boolean {
  return /qwen-image-edit-2511/i.test(String(model ?? ''));
}

/**
 * Optional Image 2 packshot while Keep stays Image 1 — same garment-reinforce
 * pattern Outfit/Fitting uses. Never put Cast on Image 1 for Day Keep restages.
 */
export function resolveDayGarmentReinforce(input: {
  plateSource?: DayPlateSource | null;
  packshotUrl?: string | null;
}): { imageUrl: string } | null {
  if (input.plateSource !== 'keeper') {
    return null;
  }
  const url = input.packshotUrl?.trim();
  return url ? { imageUrl: url } : null;
}

/**
 * Resolve the Day display plate: latest Outfit keeper when available, else Cast look.
 * Queue Image 1 uses this Keep when present (outfit continuity).
 */
export function resolveDayPlate(input: {
  character: CharacterRecord | null | undefined;
  gallery?: ComfyGalleryEntry[] | null;
}): DayPlate | null {
  const character = input.character;
  if (!character) {
    return null;
  }

  let look;
  try {
    look = activeLook(character);
  } catch {
    look = undefined;
  }
  const keeperIds = [...(look?.keeperEntryIds ?? [])].map(id => id.trim()).filter(Boolean);
  const gallery = input.gallery ?? [];
  if (keeperIds.length > 0 && gallery.length > 0) {
    for (let index = keeperIds.length - 1; index >= 0; index -= 1) {
      const keeperId = keeperIds[index]!;
      const entry = gallery.find(item => item.id === keeperId && item.status === 'completed');
      if (!entry) {
        continue;
      }
      const imageUrl = galleryEntryPrimaryViewUrl(entry)?.trim();
      if (!imageUrl) {
        continue;
      }
      const download = galleryEntryDownloadUrls(entry);
      const filename =
        download.filename[0]?.trim() || entry.images[0]?.filename?.trim() || undefined;
      return {
        imageUrl,
        filename,
        isolated: false,
        isolateSubject: false,
        source: 'keeper',
      };
    }
  }

  const cast = resolveFittingPlateFromCharacter(character);
  if (!cast?.filename?.trim() && !cast?.imageUrl?.trim()) {
    return null;
  }
  return {
    ...cast,
    source: 'cast',
  };
}

/**
 * Display/queue plate helper. Prefer Keep for Image 1 when present; Cast only
 * when there is no Keep (face plate alone — no worn kit to preserve).
 */
export function resolveDayQueueIdentityPlate(input: {
  character: CharacterRecord | null | undefined;
  displayPlate?: DayPlate | null;
}): DayPlate | null {
  if (input.displayPlate?.source === 'keeper') {
    return input.displayPlate;
  }
  const cast = resolveFittingPlateFromCharacter(input.character);
  if (cast?.filename?.trim() || cast?.imageUrl?.trim()) {
    return {
      ...cast,
      source: 'cast',
    };
  }
  return input.displayPlate ?? null;
}

/** Stable key for the resolved Day plate so isolate overrides invalidate on change. */
export function dayPlateSourceKey(plate: DayPlate | null | undefined): string {
  if (!plate) {
    return '';
  }
  const url = plate.originalUrl?.trim() || plate.imageUrl?.trim() || '';
  const filename = plate.originalFilename?.trim() || plate.filename?.trim() || '';
  return `${plate.source}:${filename || url}`;
}

export type DayPlateIsolateCache = {
  isolateSubject?: boolean;
  referenceIsolated?: boolean;
  plateIsolateSourceKey?: string;
  plateImageUrl?: string;
  plateImageFilename?: string;
  plateOriginalUrl?: string;
  plateOriginalFilename?: string;
};

/**
 * Plate shown / queued for Day — applies isolate-on-white override when it matches
 * the current source plate, or falls back to the Cast original when isolate is off.
 */
export function resolveDayPlateForIsolate(input: {
  basePlate: DayPlate | null;
  isolateSubject: boolean;
  cache: DayPlateIsolateCache;
}): DayPlate | null {
  const base = input.basePlate;
  if (!base) {
    return null;
  }
  const sourceKey = dayPlateSourceKey(base);
  if (!input.isolateSubject) {
    const originalUrl = base.originalUrl?.trim() || base.imageUrl?.trim() || '';
    const originalFilename = base.originalFilename?.trim() || base.filename?.trim() || '';
    return {
      ...base,
      imageUrl: originalUrl || undefined,
      filename: originalFilename || undefined,
      isolated: false,
      isolateSubject: false,
    };
  }
  const overrideKey = input.cache.plateIsolateSourceKey?.trim() || '';
  const overrideUrl = input.cache.plateImageUrl?.trim() || '';
  const overrideFilename = input.cache.plateImageFilename?.trim() || '';
  if (
    input.cache.referenceIsolated === true &&
    overrideKey === sourceKey &&
    (overrideUrl || overrideFilename)
  ) {
    return {
      ...base,
      imageUrl: overrideUrl || base.imageUrl,
      filename: overrideFilename || base.filename,
      originalUrl: input.cache.plateOriginalUrl?.trim() || base.originalUrl || base.imageUrl,
      originalFilename:
        input.cache.plateOriginalFilename?.trim() || base.originalFilename || base.filename,
      isolated: true,
      isolateSubject: true,
    };
  }
  if (base.isolated === true) {
    return { ...base, isolateSubject: true };
  }
  return {
    ...base,
    imageUrl: base.originalUrl?.trim() || base.imageUrl,
    filename: base.originalFilename?.trim() || base.filename,
    isolated: false,
    isolateSubject: true,
  };
}

/** True when isolate is on but the cutout for this plate is not ready yet. */
export function dayPlateIsolatePending(input: {
  basePlate: DayPlate | null;
  isolateSubject: boolean;
  cache: DayPlateIsolateCache;
}): boolean {
  if (!input.isolateSubject || !input.basePlate) {
    return false;
  }
  if (input.basePlate.isolated === true) {
    return false;
  }
  const sourceKey = dayPlateSourceKey(input.basePlate);
  return !(
    input.cache.referenceIsolated === true &&
    (input.cache.plateIsolateSourceKey?.trim() || '') === sourceKey &&
    Boolean(input.cache.plateImageUrl?.trim() || input.cache.plateImageFilename?.trim())
  );
}
