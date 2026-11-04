'use client';

import { countDuoStill } from '@/lib/checks/duo-still-check-client';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { uploadComfyInputImage } from '@/lib/comfyui/image-upload';
import { galleryEntryPrimaryViewUrl } from '@/lib/gallery/comfyui-gallery';
import {
  LOCATION_EMPTY_PROMPT,
  LOCATION_PICTURE_MODEL,
  locationEmptyGraph,
  locationEmptySize,
} from './picture';
import { photoShowsPeople } from './records';

export type EmptiedPlacePhoto = {
  /** The photo to keep: emptied, or the upload as it was. */
  photo: string;
  emptied: boolean;
  /** Why a photo with people in it was kept as it was. */
  note?: string;
};

const view = (name: string) =>
  `/api/comfyui/view?${new URLSearchParams({ filename: name, type: 'input' }).toString()}`;

/**
 * A place photo just uploaded (`photo`, from `file`), with any people in it taken out
 * (locationEmptyGraph) — stills are told it is an empty room and drew a person in it in place of
 * the Cast. Kept as it was when nobody is in it, or when the people count can't run here.
 */
export async function emptyPlacePhoto(input: {
  photo: string;
  file: File;
  onStatus?: (status: string) => void;
}): Promise<EmptiedPlacePhoto> {
  input.onStatus?.('Checking it for people…');
  const counted = await countDuoStill(view(input.photo)).catch(() => null);
  if (!counted?.available || !photoShowsPeople(counted.counts)) {
    return { photo: input.photo, emptied: false };
  }
  input.onStatus?.('Taking the people out…');
  try {
    const bitmap = await createImageBitmap(input.file);
    const size = locationEmptySize(bitmap.width, bitmap.height);
    bitmap.close();
    const { requeueComfyJob } = await import('@/lib/comfyui/requeue');
    const queued = await requeueComfyJob({
      prompt: LOCATION_EMPTY_PROMPT,
      negativePrompt: '',
      model: LOCATION_PICTURE_MODEL,
      tool: 'scene',
      workflowJson: JSON.stringify(
        locationEmptyGraph(input.photo, size, Math.floor(Math.random() * 2 ** 31))
      ),
      workflowFinal: true,
    });
    if (!queued.ok || !queued.promptId) {
      throw new Error(queued.error ?? 'ComfyUI did not take the render — is it running?');
    }
    const [entry] = await waitForGalleryPromptIds([queued.promptId], {
      timeoutMs: 5 * 60_000,
      pollMs: 2_500,
    });
    const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
    if (!url) throw new Error('The empty place did not finish (it needs Qwen-Image 2.1 Turbo).');
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('The empty place could not be read back.');
    const uploaded = await uploadComfyInputImage({
      file: new File([await response.blob()], 'place-empty.png', { type: 'image/png' }),
    });
    return { photo: uploaded.name, emptied: true };
  } catch (error) {
    return {
      photo: input.photo,
      emptied: false,
      note: `There is someone in this photo, and they could not be taken out (${
        error instanceof Error ? error.message : 'the edit failed'
      }) — a still may draw them instead of your Cast. A photo with nobody in it works best.`,
    };
  }
}
