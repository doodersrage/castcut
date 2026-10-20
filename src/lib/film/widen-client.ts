'use client';

/**
 * Widescreen film (2026-10-14): Day stills are 3:4 portrait, so a 16:9 cut letterboxed every shot.
 * One Edit 2511 pass pads the still to 16:9 with white and fills the sides by continuing the scene
 * — the person and everything already in the picture stay as they are. Live on four Day stills
 * (bedroom, night market, terrace, window): 4 of 4 continued the place believably, her size and
 * pose unchanged, no white left.
 */

import { waitForGalleryPromptIds } from '../best-of-n-vision-queue';
import { resolveCastPlatePrepareModel, snapshotPlate } from '../cast/plate-prepare';
import { galleryEntryPrimaryViewUrl } from '../comfyui-gallery';
import type { FittingPlate } from '../fitting/room';
import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';

export const FILM_WIDE_CANVAS = { width: 1472, height: 832 } as const;

export const FILM_WIDEN_PROMPT =
  'Edit Image 1: the white bands on the left and right are empty — fill them by continuing the ' +
  'scene naturally, the same place, light and perspective, so it reads as one wide photograph. ' +
  'Keep the person and everything already in the picture exactly as it is, the same size and ' +
  'position. No white, no borders, no frame. Photoreal.';

export const FILM_WIDEN_NEGATIVE =
  'white bands, borders, frame, collage, split screen, different person, different face, extra people, text, logo, blurry';

type SendComfyUi = (
  prompt: string,
  sport?: null,
  historyId?: undefined,
  options?: SendComfyUiOptions
) => Promise<string | undefined | void>;

/** The still widened to 16:9 (a ComfyUI view URL), or null when the pass did not finish. */
export async function widenStillForFilm(input: {
  imageUrl: string;
  sendComfyUi: SendComfyUi;
  model?: string;
  characterId?: string;
}): Promise<string | null> {
  const before = await snapshotPlate(
    { imageUrl: input.imageUrl, filename: '' } as FittingPlate,
    input.model
  );
  const promptId = await input.sendComfyUi(FILM_WIDEN_PROMPT, null, undefined, {
    inputImageFilename: before.filename,
    inputImageUrl: before.imageUrl,
    identityLock: false,
    queueModel: resolveCastPlatePrepareModel(input.model),
    queueTool: 'fitting',
    turboEditStrength: 'balanced',
    castPlateReference: true,
    figurePixelSize: { ...FILM_WIDE_CANVAS },
    explicitNegative: FILM_WIDEN_NEGATIVE,
    queueHints: '',
    ...(input.characterId ? { characterId: input.characterId } : {}),
    sourceImageUrl: before.imageUrl,
  });
  const id = typeof promptId === 'string' ? promptId.trim() : '';
  if (!id) return null;
  const [entry] = await waitForGalleryPromptIds([id], { timeoutMs: 4 * 60_000, pollMs: 2_500 });
  return (entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '') || null;
}
