'use client';

import type { DayPlate } from '@/lib/day-plate';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { cropPortraitFaceRegionFromBlob } from '@/lib/portrait-face-crop';
import { resolveQueueInputImage } from '@/lib/queue-input-image';

/**
 * Re-upload a garment / Keep still as `day-outfit-vl-*` so Qwen Edit treats Image 2
 * as VL vision only (no ReferenceLatent pose pin).
 */
export async function uploadDayOutfitVlPlate(input: {
  imageUrl?: string | null;
  filename?: string | null;
  model?: string | null;
  comfyUrl?: string | null;
}): Promise<DayPlate | null> {
  const comfyUrl = input.comfyUrl?.trim() || undefined;
  const urls = collectIsolateSourceUrls({
    imageUrl: input.imageUrl,
    filename: input.filename,
    comfyUrl,
  });
  if (urls.length === 0) {
    return null;
  }
  try {
    const blob = await loadImageBlobFromUrls(urls);
    const stamp = Date.now();
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
 * Crop a face window from the Outfit Keep (or Cast) plate for Vacation/Suggestive
 * upright pose breaks. Full-body Keep as Image 1 ReferenceLatent freezes MID-STRIDE /
 * WAVING / DANCING as a fashion stand — face-only Image 1 unlocks Image 3 stance
 * while Image 2 carries the worn kit as VL-only (no ReferenceLatent).
 */
export async function resolveDayVacationFaceBreakPlate(input: {
  bodyPlate: DayPlate | null | undefined;
  model?: string | null;
  comfyUrl?: string | null;
}): Promise<{
  facePlate: DayPlate | null;
  /** Keep body re-uploaded as day-outfit-vl-* so Qwen skips ReferenceLatent. */
  outfitVlPlate: DayPlate | null;
  bodyPlate: DayPlate | null;
  autoCropped: boolean;
}> {
  const body = input.bodyPlate ?? null;
  if (!body) {
    return { facePlate: null, outfitVlPlate: null, bodyPlate: null, autoCropped: false };
  }

  try {
    const comfyUrl = input.comfyUrl?.trim() || undefined;
    const urls = collectIsolateSourceUrls({
      imageUrl: body.imageUrl ?? body.originalUrl,
      filename: body.filename ?? body.originalFilename,
      comfyUrl,
    });
    const blob = await loadImageBlobFromUrls(urls);
    const stamp = Date.now();

    const faceFile = await cropPortraitFaceRegionFromBlob(blob, `day-vacation-face-${stamp}.png`, {
      heightRatio: 0.28,
      aspect: 0.9,
      topInsetRatio: 0.01,
    });
    const faceUploaded = await resolveQueueInputImage({
      file: faceFile,
      filename: faceFile.name,
      model: input.model ?? undefined,
      comfyUrl,
    });
    const faceFilename = faceUploaded?.filename?.trim();
    if (!faceFilename) {
      return { facePlate: null, outfitVlPlate: null, bodyPlate: body, autoCropped: false };
    }

    // Re-upload full Keep under day-outfit-vl-* so Image 2 is VL vision only —
    // ReferenceLatent on the standing Keep re-pins catalog pose even after face-crop Image 1.
    const outfitVlPlate = await uploadDayOutfitVlPlate({
      imageUrl: body.imageUrl ?? body.originalUrl,
      filename: body.filename ?? body.originalFilename,
      model: input.model,
      comfyUrl,
    });

    return {
      facePlate: {
        filename: faceFilename,
        imageUrl: undefined,
        isolated: false,
        isolateSubject: false,
        source: body.source,
      },
      outfitVlPlate,
      bodyPlate: body,
      autoCropped: true,
    };
  } catch {
    return { facePlate: null, outfitVlPlate: null, bodyPlate: body, autoCropped: false };
  }
}
