'use client';

/**
 * "Same stranger all day": an invented Day partner gets one face, rendered once as a
 * head-and-shoulders portrait (an edit of the lead's face crop into a different person), then
 * used like a Cast partner's face (Image 2) on every two-person still that day. Without it the
 * stranger was a new face in every still — a date with five different people.
 */

import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';
import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import type { DayPartnerNoun } from '@/lib/day-partner';
import { loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { cropPortraitFaceRegionFromBlob } from '@/lib/portrait-face-crop';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { pickCompanionLook } from '@/lib/day-clothed-lead';

export type DayPartnerStandIn = {
  noun: 'man' | 'woman';
  /** The composed look ("a Latino man in his early twenties with …"). */
  look: string;
  filename: string;
  imageUrl?: string;
};

type SendComfyUi = (
  prompt: string,
  sport?: null,
  historyId?: undefined,
  options?: SendComfyUiOptions
) => Promise<string | undefined | void>;

export function pickDayPartnerStandInLook(noun: 'man' | 'woman'): string {
  return pickCompanionLook(noun);
}

export function buildDayPartnerStandInPrompt(look: string): string {
  return [
    `Replace the person in Image 1 with a completely different person: ${look}.`,
    'Head-and-shoulders portrait facing the camera, neutral relaxed expression, eyes open, plain light gray background, soft even daylight, simple crew-neck top.',
    'A new face, not the face in Image 1 — different face shape, nose, eyes, hair and skin tone as described.',
    'Photorealistic photograph, natural skin.',
  ].join(' ');
}

/** The stored stand-in still fits the chosen partner (same gender), or null. */
export function reusableDayPartnerStandIn(
  standIn: DayPartnerStandIn | null | undefined,
  noun: DayPartnerNoun
): DayPartnerStandIn | null {
  return standIn?.filename?.trim() && standIn.noun === noun ? standIn : null;
}

export async function renderDayPartnerStandIn(input: {
  noun: 'man' | 'woman';
  /** The lead's face crop (ComfyUI input filename) — the edit's canvas, replaced entirely. */
  leadFaceFilename: string;
  model?: string | null;
  comfyUrl?: string;
  sendComfyUi: SendComfyUi;
  characterId?: string;
}): Promise<DayPartnerStandIn | null> {
  const look = pickDayPartnerStandInLook(input.noun);
  const promptId = await input.sendComfyUi(buildDayPartnerStandInPrompt(look), null, undefined, {
    inputImageFilename: input.leadFaceFilename,
    identityLock: false,
    queueTool: 'image-prompt',
    preserveInputAspect: true,
    queueHints: '',
    ...(input.characterId ? { characterId: input.characterId } : {}),
  });
  const id = typeof promptId === 'string' ? promptId.trim() : '';
  if (!id) {
    return null;
  }
  const [entry] = await waitForGalleryPromptIds([id], { timeoutMs: 3 * 60_000, pollMs: 2_000 });
  const resultUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
  if (!resultUrl) {
    return null;
  }
  const blob = await loadImageBlobFromUrls([resultUrl]);
  // Head only: the portrait's T-shirt rode into every still as the partner's outfit.
  const name = `day-partner-${input.noun}-${Date.now()}.png`;
  const file = await cropPortraitFaceRegionFromBlob(blob, name, {
    heightRatio: 0.58,
    aspect: 0.85,
    topInsetRatio: 0.02,
  }).catch(() => new File([blob], name, { type: blob.type || 'image/png' }));
  const uploaded = await resolveQueueInputImage({
    file,
    filename: file.name,
    model: input.model ?? undefined,
    comfyUrl: input.comfyUrl,
  });
  const filename = uploaded?.filename?.trim();
  return filename ? { noun: input.noun, look, filename, imageUrl: resultUrl } : null;
}
