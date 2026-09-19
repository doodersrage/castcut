import { activeLook, type CharacterRecord } from '@/lib/character-os';
import {
  galleryEntryDownloadUrls,
  galleryEntryPrimaryViewUrl,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { resolveFittingPlateFromCharacter, type FittingPlate } from '@/lib/fitting-room';
import { resolveCastFaceForPlate } from '@/lib/look-outfit-plate';

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
 * Lightning 2511 cannot hold a face crop as identity (no IP/InstantID) and
 * pose-guide Image 3 leaks as a color overlay. Use the full Keep/Cast plate
 * as Image 1 with ReferenceLatent and drive pose from text.
 */
export function isDayVacationLightningIdentityVlModel(model?: string | null): boolean {
  return isQwenEdit2511PoseStickyModel(model) && /lightning/i.test(String(model ?? ''));
}

/**
 * Optional Image 2 packshot while Keep stays Image 1 — same garment-reinforce
 * pattern Outfit/Fitting uses. Never put Cast on Image 1 for Day Keep restages.
 * Custom BYO clothing attaches for Keep (reinforce) and Cast (try-on Image 2).
 */
export function resolveDayGarmentReinforce(input: {
  plateSource?: DayPlateSource | null;
  packshotUrl?: string | null;
  customGarmentUrl?: string | null;
  customGarmentFilename?: string | null;
}): { imageUrl?: string; imageFilename?: string; source: 'custom' | 'packshot' } | null {
  const customFilename = input.customGarmentFilename?.trim();
  const customUrl = input.customGarmentUrl?.trim();
  if (customUrl || customFilename) {
    if (input.plateSource !== 'keeper' && input.plateSource !== 'cast') {
      return null;
    }
    return {
      ...(customUrl ? { imageUrl: customUrl } : {}),
      ...(customFilename ? { imageFilename: customFilename } : {}),
      source: 'custom',
    };
  }
  if (input.plateSource !== 'keeper') {
    return null;
  }
  const url = input.packshotUrl?.trim();
  return url ? { imageUrl: url, source: 'packshot' } : null;
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

  return resolveDayCastPlate(character);
}

/** Cast look plate only — no Outfit Keep garments (Sport kit replace). */
export function resolveDayCastPlate(
  character: CharacterRecord | null | undefined
): DayPlate | null {
  if (!character) {
    return null;
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
 * Face / IP crop when it is a real face-only asset. Returns null when the
 * “face” lock is the same file as the Cast body plate (Cast sync often copies
 * the underwear plate into ipAdapter) — callers should fall back to the body
 * plate and discard clothing in the prompt instead of dropping Image 1.
 */
export function resolveDayFaceOnlyPlate(
  character: CharacterRecord | null | undefined
): DayPlate | null {
  const face = resolveCastFaceForPlate(character);
  if (!face?.filename?.trim() && !face?.imageUrl?.trim()) {
    return null;
  }
  if (castFaceDuplicatesBodyPlate(character)) {
    return null;
  }
  return {
    filename: face.filename?.trim() || undefined,
    imageUrl: face.imageUrl?.trim() || undefined,
    isolated: false,
    isolateSubject: false,
    source: 'cast',
  };
}

/**
 * True when Cast IP/face lock points at the same asset as the Cast body plate.
 */
export function castFaceDuplicatesBodyPlate(
  character: CharacterRecord | null | undefined
): boolean {
  const face = resolveCastFaceForPlate(character);
  if (!face) {
    return false;
  }
  const body = resolveDayCastPlate(character);
  if (!body) {
    return false;
  }
  const faceFile = (face.filename ?? '').trim().toLowerCase();
  const bodyFile = (body.filename ?? body.originalFilename ?? '').trim().toLowerCase();
  if (faceFile && bodyFile && faceFile === bodyFile) {
    return true;
  }
  const faceUrl = (face.imageUrl ?? '').trim().toLowerCase();
  const bodyUrl = (body.imageUrl ?? body.originalUrl ?? '').trim().toLowerCase();
  if (faceUrl && bodyUrl && faceUrl === bodyUrl) {
    return true;
  }
  const faceBase = faceFile.split(/[/\\]/).pop() || '';
  const bodyBase = bodyFile.split(/[/\\]/).pop() || '';
  if (faceBase && bodyBase && faceBase === bodyBase) {
    return true;
  }
  return false;
}

/**
 * True when nude Day should auto-crop a face window from the Cast body plate
 * (no distinct face lock, or face lock is the same lingerie file).
 */
export function dayNudeNeedsAutoFaceCrop(character: CharacterRecord | null | undefined): boolean {
  if (!character) {
    return false;
  }
  if (resolveDayFaceOnlyPlate(character)) {
    return false;
  }
  return Boolean(resolveDayCastPlate(character));
}

/**
 * Nude adult Day: prefer a distinct face crop; otherwise Cast body plate as a
 * sync fallback (queue path auto-crops a top-center face window when needed).
 */
export function resolveDayQueueIdentityPlate(input: {
  character: CharacterRecord | null | undefined;
  displayPlate?: DayPlate | null;
  /** When true, never queue Outfit Keep as Image 1. */
  preferCastPlate?: boolean;
  /**
   * When true (nude omit-garment): use a distinct face crop if available,
   * else Cast body plate (queue may replace with an auto face crop).
   */
  preferFaceOnlyPlate?: boolean;
}): DayPlate | null {
  if (input.preferFaceOnlyPlate) {
    return resolveDayFaceOnlyPlate(input.character) ?? resolveDayCastPlate(input.character) ?? null;
  }
  if (input.preferCastPlate) {
    return resolveDayCastPlate(input.character) ?? input.displayPlate ?? null;
  }
  if (input.displayPlate?.source === 'keeper') {
    return input.displayPlate;
  }
  return resolveDayCastPlate(input.character) ?? input.displayPlate ?? null;
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
