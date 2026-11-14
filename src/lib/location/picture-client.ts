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
import type { PictureIo } from '../media/picture-io';

/** The fixed graph of an empty place, ready to queue as it is (workflowFinal). */
export type EmptyPlaceJob = {
  prompt: string;
  negativePrompt: string;
  model: string;
  workflowJson: string;
};

/**
 * How the empty place is queued, waited for, read back and put in ComfyUI's inputs
 * (FINISHING_PLAN Phase 3: the server passes picture-server.ts's). The page's when absent.
 */
export type EmptyPlaceSteps = {
  queue?: (job: EmptyPlaceJob) => Promise<{ ok: boolean; promptId?: string; error?: string }>;
  waitForPromptIds?: typeof waitForGalleryPromptIds;
  resultUrl?: (entry: Parameters<typeof galleryEntryPrimaryViewUrl>[0]) => string | null;
  io?: PictureIo;
};

async function queueOnPage(job: EmptyPlaceJob) {
  const { requeueComfyJob } = await import('../comfyui/requeue');
  return requeueComfyJob({ ...job, tool: 'scene', workflowFinal: true });
}

/**
 * The empty place rendered from its words (location/picture.ts) and put in ComfyUI's inputs, to
 * be sent as a room: its input filename. "Make its picture" on a location, and a script scene's
 * one room (2026-11-11). Throws when ComfyUI doesn't take it or it doesn't finish.
 */
export async function renderEmptyPlace(
  place: Pick<LocationRecord, 'name' | 'look' | 'setting'>,
  filename: string,
  steps: EmptyPlaceSteps = {}
): Promise<string> {
  const queued = await (steps.queue ?? queueOnPage)({
    prompt: locationPicturePrompt(place),
    negativePrompt: LOCATION_PICTURE_NEGATIVE,
    model: LOCATION_PICTURE_MODEL,
    workflowJson: JSON.stringify(locationPictureGraph(place, Math.floor(Math.random() * 2 ** 31))),
  });
  if (!queued.ok || !queued.promptId) {
    throw new Error(queued.error ?? 'ComfyUI did not take the render — is it running?');
  }
  const [entry] = await (steps.waitForPromptIds ?? waitForGalleryPromptIds)([queued.promptId], {
    timeoutMs: 5 * 60_000,
    pollMs: 2_500,
  });
  const url = entry ? (steps.resultUrl ?? galleryEntryPrimaryViewUrl)(entry)?.trim() : '';
  if (!url) throw new Error('The picture did not finish (it needs Qwen-Image 2.1 Turbo).');
  if (steps.io) {
    const blob = await steps.io.loadBlob([url]).catch(() => null);
    if (!blob) throw new Error('The picture could not be read back.');
    const uploaded = await steps.io.upload(new File([blob], filename, { type: 'image/png' }));
    if (!uploaded?.filename) throw new Error('The picture could not be put in ComfyUI’s inputs.');
    return uploaded.filename;
  }
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('The picture could not be read back.');
  const file = new File([await response.blob()], filename, { type: 'image/png' });
  const uploaded = await uploadComfyInputImage({ file });
  return uploaded.name;
}
