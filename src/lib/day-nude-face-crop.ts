'use client';

import type { CharacterRecord } from '@/lib/character-os';
import {
  dayNudeNeedsAutoFaceCrop,
  resolveDayCastPlate,
  resolveDayFaceOnlyPlate,
  type DayPlate,
} from '@/lib/day-plate';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { cropPortraitFaceRegionFromBlob } from '@/lib/portrait-face-crop';
import { resolveQueueInputImage } from '@/lib/queue-input-image';

/**
 * Resolve Image 1 for nude Day: distinct Cast face when present, else a
 * geometric top-center crop from the Cast body plate (so beige lingerie pixels
 * never enter ReferenceLatent / IP-Adapter). Falls back to the body plate only
 * when crop/upload fails.
 */
export async function resolveDayNudeIdentityPlateWithFaceCrop(input: {
  character: CharacterRecord | null | undefined;
  model?: string | null;
  comfyUrl?: string | null;
}): Promise<{ plate: DayPlate | null; autoCropped: boolean }> {
  const face = resolveDayFaceOnlyPlate(input.character);
  if (face) {
    return { plate: face, autoCropped: false };
  }

  const body = resolveDayCastPlate(input.character);
  if (!body || !dayNudeNeedsAutoFaceCrop(input.character)) {
    return { plate: body, autoCropped: false };
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
    const file = await cropPortraitFaceRegionFromBlob(blob, `day-nude-face-${stamp}.png`, {
      // Tight window — Cast underwear plates put bra straps just below the head.
      heightRatio: 0.24,
      aspect: 0.9,
      topInsetRatio: 0.012,
    });
    const uploaded = await resolveQueueInputImage({
      file,
      filename: file.name,
      model: input.model ?? undefined,
      comfyUrl,
    });
    const filename = uploaded?.filename?.trim();
    if (!filename) {
      return { plate: body, autoCropped: false };
    }
    return {
      plate: {
        filename,
        imageUrl: undefined,
        isolated: false,
        isolateSubject: false,
        source: 'cast',
      },
      autoCropped: true,
    };
  } catch {
    return { plate: body, autoCropped: false };
  }
}
