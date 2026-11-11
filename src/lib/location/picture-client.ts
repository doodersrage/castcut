'use client';

import { waitForGalleryPromptIds } from '../best-of-n/vision-queue';
import { uploadComfyInputImage } from '../comfyui/image-upload';
import { galleryEntryPrimaryViewUrl } from '../gallery/comfyui-gallery';
import {
  LOCATION_PICTURE_MODEL,
  LOCATION_PICTURE_NEGATIVE,
  locationPictureGraph,
  locationPicturePrompt,
} from './picture';
import type { LocationRecord } from './records';

/**
 * The empty place rendered from its words (location/picture.ts) and put in ComfyUI's inputs, to
 * be sent as a room: its input filename. "Make its picture" on a location, and a script scene's
 * one room (2026-11-11). Throws when ComfyUI doesn't take it or it doesn't finish.
 */
export async function renderEmptyPlace(
  place: Pick<LocationRecord, 'name' | 'look' | 'setting'>,
  filename: string
): Promise<string> {
  const { requeueComfyJob } = await import('../comfyui/requeue');
  const queued = await requeueComfyJob({
    prompt: locationPicturePrompt(place),
    negativePrompt: LOCATION_PICTURE_NEGATIVE,
    model: LOCATION_PICTURE_MODEL,
    tool: 'scene',
    workflowJson: JSON.stringify(locationPictureGraph(place, Math.floor(Math.random() * 2 ** 31))),
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
  if (!url) throw new Error('The picture did not finish (it needs Qwen-Image 2.1 Turbo).');
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('The picture could not be read back.');
  const file = new File([await response.blob()], filename, { type: 'image/png' });
  const uploaded = await uploadComfyInputImage({ file });
  return uploaded.name;
}
