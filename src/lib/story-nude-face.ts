'use client';

import type { CharacterRecord } from '@/lib/character-os';
import { resolveDayCastPlate } from '@/lib/day-plate';
import { resolveDayNudeIdentityPlateWithFaceCrop } from '@/lib/day-nude-face-crop';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { cropPortraitFaceRegionFromBlob } from '@/lib/portrait-face-crop';
import { resolveQueueInputImage } from '@/lib/queue-input-image';

/**
 * Face-only Image 1 for nude Story beats — same fix as Day Intimate/Raunchy. A Cast underwear
 * plate as Image 1 (and identity image) puts beige lingerie pixels in the reference, and the
 * still keeps them however hard the prompt says "nude". Prefers the Cast's own face plate, else
 * crops the face off the Cast plate, else off the Story reference photo. Cached per source, so a
 * Story reuses one crop. Null when nothing could be cropped (caller keeps the full plate).
 */
const cache = new Map<string, string>();

export async function resolveStoryNudeFaceFilename(input: {
  character?: CharacterRecord | null;
  referenceFilename?: string | null;
  referenceUrl?: string | null;
  model?: string | null;
  comfyUrl?: string | null;
}): Promise<string | null> {
  const referenceFilename = input.referenceFilename?.trim() || '';
  const referenceUrl = input.referenceUrl?.trim() || '';
  const key = [input.character?.id ?? '', referenceFilename, referenceUrl].join('\0');
  const hit = cache.get(key);
  if (hit) return hit;

  let filename: string | null = null;
  if (input.character) {
    const { plate } = await resolveDayNudeIdentityPlateWithFaceCrop({
      character: input.character,
      model: input.model,
      comfyUrl: input.comfyUrl,
    });
    const body = resolveDayCastPlate(input.character);
    const picked = plate?.filename?.trim();
    // The helper falls back to the body plate when it can't crop — that's not a face.
    if (picked && picked !== body?.filename?.trim()) {
      filename = picked;
    }
  }
  if (!filename && (referenceFilename || referenceUrl)) {
    try {
      const urls = collectIsolateSourceUrls({
        imageUrl: referenceUrl || undefined,
        filename: referenceFilename || undefined,
        comfyUrl: input.comfyUrl?.trim() || undefined,
      });
      const blob = await loadImageBlobFromUrls(urls);
      const file = await cropPortraitFaceRegionFromBlob(blob, `story-nude-face-${Date.now()}.png`, {
        // Same tight window as Day — underwear plates put bra straps just below the head.
        heightRatio: 0.24,
        aspect: 0.9,
        topInsetRatio: 0.012,
      });
      const uploaded = await resolveQueueInputImage({
        file,
        filename: file.name,
        model: input.model ?? undefined,
        comfyUrl: input.comfyUrl?.trim() || undefined,
      });
      filename = uploaded?.filename?.trim() || null;
    } catch {
      filename = null;
    }
  }
  if (filename) cache.set(key, filename);
  return filename;
}

/** Tests / a new Cast plate. */
export function clearStoryNudeFaceCache(): void {
  cache.clear();
}
