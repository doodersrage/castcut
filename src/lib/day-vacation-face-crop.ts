'use client';

import type { CharacterRecord } from '@/lib/character-os';
import type { DayPlate } from '@/lib/day-plate';
import { resolveDayFaceOnlyPlate } from '@/lib/day-plate';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnFill,
  isolateSubjectOnWhite,
  ISOLATE_FILL_NEUTRAL,
  loadImageBlobFromUrls,
} from '@/lib/isolate-subject';
import { cropPortraitFaceRegionFromBlob } from '@/lib/portrait-face-crop';
import { resolveQueueInputImage } from '@/lib/queue-input-image';

type FaceBreakResult = {
  facePlate: DayPlate | null;
  /** Always null — full-body Image 2 cutouts teach studio voids on Edit-2511. */
  outfitVlPlate: DayPlate | null;
  bodyPlate: DayPlate | null;
  autoCropped: boolean;
};

/**
 * One stable face crop per Day queue — re-uploading a new face file every slot
 * is a major identity-drift source on Lightning (each slot invents from slightly
 * different Image 1 + IP pixels).
 */
let faceBreakCache: { key: string; result: FaceBreakResult } | null = null;
let identityVlCache: { key: string; plate: DayPlate } | null = null;

export function clearDayVacationFaceBreakCache(): void {
  faceBreakCache = null;
  identityVlCache = null;
}

function faceBreakCacheKey(input: {
  bodyPlate: DayPlate | null | undefined;
  character?: CharacterRecord | null;
}): string {
  const body = input.bodyPlate;
  const cast = resolveDayFaceOnlyPlate(input.character);
  return [
    input.character?.id ?? '',
    cast?.filename ?? '',
    cast?.imageUrl ?? '',
    body?.filename ?? '',
    body?.imageUrl ?? '',
    body?.originalFilename ?? '',
    body?.originalUrl ?? '',
    'face-v3-white-cutout',
  ].join('\0');
}

/**
 * Re-upload a garment / Keep still as `day-outfit-vl-*` so Qwen Edit treats Image 2
 * as VL vision only (no ReferenceLatent pose pin).
 * When `neutralBackdrop` is set, MODNet-cut the subject onto mid-gray so white Keep
 * voids cannot become the scene background.
 *
 * Face-break Day must NOT call this with a full-body Keep — gray cutouts still teach
 * a studio-void composition on Edit-2511. Prefer clothing-only packshots, or skip
 * Image 2 and dress from the garment description text.
 */
export async function uploadDayOutfitVlPlate(input: {
  imageUrl?: string | null;
  filename?: string | null;
  model?: string | null;
  comfyUrl?: string | null;
  /** Cut subject onto mid-gray; on failure return null (skip Image 2) rather than white Keep. */
  neutralBackdrop?: boolean;
}): Promise<DayPlate | null> {
  const comfyUrl = input.comfyUrl?.trim() || undefined;
  const urls = collectIsolateSourceUrls({
    imageUrl: input.imageUrl?.trim() || undefined,
    filename: input.filename?.trim() || undefined,
    comfyUrl,
  });
  if (urls.length === 0) {
    return null;
  }
  try {
    let blob = await loadImageBlobFromUrls(urls);
    const stamp = Date.now();
    if (input.neutralBackdrop) {
      try {
        blob = await isolateSubjectOnFill(
          blob,
          `day-outfit-cut-${stamp}.png`,
          ISOLATE_FILL_NEUTRAL
        );
      } catch {
        // Prefer no Image 2 over a white-void Keep that paints studio backgrounds.
        return null;
      }
    }
    const outfitFile = new File([blob], `day-outfit-vl-${stamp}.png`, {
      type: blob.type || 'image/png',
      lastModified: stamp,
    });
    const outfitUploaded = await resolveQueueInputImage({
      file: outfitFile,
      filename: outfitFile.name,
      model: input.model ?? undefined,
      comfyUrl,
    });
    const outfitFilename = outfitUploaded?.filename?.trim();
    if (!outfitFilename) {
      return null;
    }
    return {
      filename: outfitFilename,
      imageUrl: undefined,
      isolated: false,
      isolateSubject: false,
      source: 'keeper',
    };
  } catch {
    return null;
  }
}

/**
 * Lightning Vacation: full Keep/Cast as Image 1. Filename must NOT be VL-skip
 * (`day-vacation-id-vl-*`) so ReferenceLatent can pin identity. Pose comes from
 * text (no Image 3) so RL does not fight a pose diagram. Same file every slot.
 */
export async function resolveDayVacationIdentityVlPlate(input: {
  bodyPlate: DayPlate | null | undefined;
  character?: CharacterRecord | null;
  model?: string | null;
  comfyUrl?: string | null;
}): Promise<DayPlate | null> {
  const body = input.bodyPlate ?? null;
  if (!body) {
    return null;
  }
  const cacheKey = `${faceBreakCacheKey(input)}\0keep-rl-v1`;
  if (identityVlCache?.key === cacheKey) {
    return identityVlCache.plate;
  }
  const comfyUrl = input.comfyUrl?.trim() || undefined;
  const urls = collectIsolateSourceUrls({
    imageUrl: body.imageUrl?.trim() || body.originalUrl?.trim() || undefined,
    filename: body.filename?.trim() || body.originalFilename?.trim() || undefined,
    comfyUrl,
  });
  if (urls.length === 0) {
    return body.filename?.trim() ? body : null;
  }
  try {
    const blob = await loadImageBlobFromUrls(urls);
    const stamp = 'day-shared';
    // day-vacation-keep-* is NOT in the VL-only skip list — ReferenceLatent holds face.
    const file = new File([blob], `day-vacation-keep-${stamp}.png`, {
      type: blob.type || 'image/png',
    });
    const uploaded = await resolveQueueInputImage({
      file,
      filename: file.name,
      model: input.model ?? undefined,
      comfyUrl,
    });
    const filename = uploaded?.filename?.trim();
    if (!filename) {
      return body.filename?.trim() ? body : null;
    }
    const plate: DayPlate = {
      filename,
      imageUrl: undefined,
      isolated: false,
      isolateSubject: false,
      source: body.source,
    };
    identityVlCache = { key: cacheKey, plate };
    return plate;
  } catch {
    return body.filename?.trim() ? body : null;
  }
}

async function isolateFaceCropOnWhite(file: File): Promise<File> {
  try {
    return await isolateSubjectOnWhite(file, file.name);
  } catch {
    return file;
  }
}

async function uploadFaceCropFile(input: {
  file: File;
  model?: string | null;
  comfyUrl?: string | null;
  source: DayPlate['source'];
}): Promise<DayPlate | null> {
  const uploaded = await resolveQueueInputImage({
    file: input.file,
    filename: input.file.name,
    model: input.model ?? undefined,
    comfyUrl: input.comfyUrl ?? undefined,
  });
  const faceFilename = uploaded?.filename?.trim();
  if (!faceFilename) {
    return null;
  }
  return {
    filename: faceFilename,
    imageUrl: undefined,
    isolated: false,
    isolateSubject: false,
    source: input.source,
  };
}

/**
 * Face-only Image 1 for Vacation/Suggestive pose unlock on Edit-2511.
 * Prefer Cast face lock when available. Cut the tight face onto white so
 * dark plate rooms cannot overlay the invented SETTING. Never pad onto mid-gray
 * (Edit-2511 copies that void). Never attach a full-body Keep as Image 2.
 * Results are cached for the Day queue so all four slots share one face plate.
 */
export async function resolveDayVacationFaceBreakPlate(input: {
  bodyPlate: DayPlate | null | undefined;
  character?: CharacterRecord | null;
  model?: string | null;
  comfyUrl?: string | null;
}): Promise<FaceBreakResult> {
  const body = input.bodyPlate ?? null;
  if (!body) {
    return { facePlate: null, outfitVlPlate: null, bodyPlate: null, autoCropped: false };
  }

  const cacheKey = faceBreakCacheKey(input);
  if (faceBreakCache?.key === cacheKey) {
    return faceBreakCache.result;
  }

  try {
    const comfyUrl = input.comfyUrl?.trim() || undefined;
    // Stable name across slots — cache still guarantees one crop/upload path.
    const stamp = 'day-shared';

    const castFace = resolveDayFaceOnlyPlate(input.character);
    let facePlate: DayPlate | null = null;
    let autoCropped = false;

    if (castFace?.filename || castFace?.imageUrl) {
      const castUrls = collectIsolateSourceUrls({
        imageUrl: castFace.imageUrl?.trim() || undefined,
        filename: castFace.filename?.trim() || undefined,
        comfyUrl,
      });
      if (castUrls.length > 0) {
        try {
          const castBlob = await loadImageBlobFromUrls(castUrls);
          const castFaceFile = await cropPortraitFaceRegionFromBlob(
            castBlob,
            // Prefix must match day-vacation-face* so Lightning skips ReferenceLatent
            // (same VL-only path as Keep auto-crops — cast-face* used to pin RL).
            `day-vacation-face-cast-${stamp}.png`,
            {
              heightRatio: 0.42,
              aspect: 0.88,
              topInsetRatio: 0.01,
            }
          );
          facePlate = await uploadFaceCropFile({
            file: await isolateFaceCropOnWhite(castFaceFile),
            model: input.model,
            comfyUrl,
            source: 'cast',
          });
        } catch {
          facePlate = null;
        }
      }
    }

    if (!facePlate) {
      const urls = collectIsolateSourceUrls({
        imageUrl: body.imageUrl?.trim() || body.originalUrl?.trim() || undefined,
        filename: body.filename?.trim() || body.originalFilename?.trim() || undefined,
        comfyUrl,
      });
      const blob = await loadImageBlobFromUrls(urls);
      const faceFile = await cropPortraitFaceRegionFromBlob(
        blob,
        `day-vacation-face-${stamp}.png`,
        {
          heightRatio: 0.3,
          aspect: 0.85,
          topInsetRatio: 0.01,
        }
      );
      facePlate = await uploadFaceCropFile({
        file: await isolateFaceCropOnWhite(faceFile),
        model: input.model,
        comfyUrl,
        source: body.source,
      });
      autoCropped = Boolean(facePlate);
    }

    const result: FaceBreakResult = !facePlate
      ? { facePlate: null, outfitVlPlate: null, bodyPlate: body, autoCropped: false }
      : {
          facePlate,
          outfitVlPlate: null,
          bodyPlate: body,
          autoCropped: autoCropped || facePlate.source === 'cast',
        };
    faceBreakCache = { key: cacheKey, result };
    return result;
  } catch {
    return { facePlate: null, outfitVlPlate: null, bodyPlate: body, autoCropped: false };
  }
}
