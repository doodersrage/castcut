'use client';

import { useCallback } from 'react';
import { applyCustomGarmentUpload } from '@/lib/fitting-custom-garment-apply';
import { normalizeFootwear } from '@/lib/footwear';
import { updateSavedFootwearWords } from '@/lib/footwear-saved';
import { collectIsolateSourceUrls } from '@/lib/isolate-subject';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { resolveStillFileForVisionScan } from '@/lib/vision-scan-still';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { scanStillWithVision } from '@/lib/vision-still-scan-client';

export type FootwearPatch = {
  footwear?: string;
  footwearImageUrl?: string;
  footwearImageFilename?: string;
};

export type ApplyFootwearPhoto = (
  /** A new photo, or `rescan` to read the current shoe photo again (like clothing's Rescan). */
  input: { file: File; asPackshot?: boolean } | { rescan: true },
  onStatus: (message: string | null) => void
) => Promise<void>;

/**
 * Your own shoe photo for Outfit / Day / Story: a worn photo has the shoes cut out into a
 * packshot (the same edit the clothing photo uses), a ready packshot is used as it is, and vision
 * names the shoes for the prompt. One hook so the three tools share the flow.
 */
export function useFootwearPhoto(input: {
  shared: SharedToolSettings;
  lookId?: string | null;
  currentFootwear?: string;
  /** The current shoe photo — what Rescan reads again. */
  currentImageUrl?: string;
  currentImageFilename?: string;
  sendComfyUi: (
    prompt: string,
    a?: undefined,
    b?: undefined,
    options?: Record<string, unknown>
  ) => Promise<string | void>;
  onPatch: (patch: FootwearPatch) => void;
  onError: (message: string) => void;
}): ApplyFootwearPhoto {
  const {
    shared,
    lookId,
    currentFootwear,
    currentImageUrl,
    currentImageFilename,
    sendComfyUi,
    onPatch,
    onError,
  } = input;
  return useCallback<ApplyFootwearPhoto>(
    async (photo, onStatus) => {
      try {
        if ('rescan' in photo) {
          const filename = currentImageFilename?.trim();
          const preview = currentImageUrl?.trim();
          if (!filename && !preview) throw new Error('Upload a shoe photo first.');
          onStatus('Reading the shoe photo again…');
          const image = await resolveStillFileForVisionScan({
            urls: collectIsolateSourceUrls({
              imageUrl: preview,
              filename,
              comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
            }),
            fallbackName: filename || 'footwear.png',
          });
          const words = normalizeFootwear(
            await scanStillWithVision({
              image,
              purpose: 'footwear',
              model: shared.model,
              detail: shared.detail,
              shared,
            })
          );
          if (!words)
            throw new Error('Vision returned no description of the shoes. Try Rescan again.');
          onPatch({ footwear: words });
          if (filename) updateSavedFootwearWords(filename, words);
          return;
        }
        const result = await applyCustomGarmentUpload(
          { ...photo, kind: 'footwear' },
          {
            model: shared.model,
            characterId: shared.activeCharacterId,
            lookId: shared.activeLookId ?? lookId,
            sendComfyUi,
            scanDescription: image =>
              scanStillWithVision({
                image,
                purpose: 'footwear',
                model: shared.model,
                detail: shared.detail,
                shared,
              }),
            onStatus,
            onSoftError: onError,
          }
        );
        const words = normalizeFootwear(result.description);
        onPatch({
          footwearImageFilename: result.filename,
          footwearImageUrl: result.previewUrl,
          // No vision model: keep what was typed rather than blanking it.
          footwear: words || normalizeFootwear(currentFootwear),
        });
      } finally {
        onStatus(null);
      }
    },
    [
      currentFootwear,
      currentImageFilename,
      currentImageUrl,
      lookId,
      onError,
      onPatch,
      sendComfyUi,
      shared,
    ]
  );
}
