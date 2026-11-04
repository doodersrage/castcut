'use client';

import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { uploadComfyInputImage } from '@/lib/comfyui/image-upload';
import { galleryEntryPrimaryViewUrl } from '@/lib/gallery/comfyui-gallery';
import { LOCATION_PICTURE_MODEL } from '@/lib/location/picture';
import { clothingEditGraph, clothingEditPrompt } from './clothing-edit';

export type ClothingPicture = {
  /** ComfyUI input file — what a still sends as the clothing image. */
  filename: string;
  /** Where to show it. */
  url: string;
};

const inputView = (filename: string) =>
  `/api/comfyui/view?${new URLSearchParams({ filename, type: 'input' }).toString()}`;

/** A picture by URL (a catalog packshot) kept as a ComfyUI input, so a copy can be edited and worn. */
export async function clothingPictureFromUrl(url: string, name: string): Promise<ClothingPicture> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Could not read that clothing picture.');
  const blob = await response.blob();
  const uploaded = await uploadComfyInputImage({
    file: new File([blob], name, { type: blob.type || 'image/png' }),
  });
  return { filename: uploaded.name, url: inputView(uploaded.name) };
}

/** A photo the player picked, kept as a ComfyUI input. */
export async function clothingPictureFromFile(file: File): Promise<ClothingPicture> {
  const uploaded = await uploadComfyInputImage({ file });
  return { filename: uploaded.name, url: inputView(uploaded.name) };
}

/**
 * The picture changed as asked ("make it red", "add lace trim") on Qwen-Image 2.1 Turbo
 * (clothing-edit.ts), kept as a new ComfyUI input — the old picture is untouched.
 */
export async function editClothingPicture(input: {
  picture: ClothingPicture;
  instruction: string;
}): Promise<ClothingPicture> {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error('Say what to change first.');
  const { requeueComfyJob } = await import('@/lib/comfyui/requeue');
  const queued = await requeueComfyJob({
    prompt: clothingEditPrompt(instruction),
    negativePrompt: '',
    model: LOCATION_PICTURE_MODEL,
    tool: 'fitting',
    workflowJson: JSON.stringify(
      clothingEditGraph(input.picture.filename, instruction, Math.floor(Math.random() * 2 ** 31))
    ),
    workflowFinal: true,
  });
  if (!queued.ok || !queued.promptId) {
    throw new Error(queued.error ?? 'ComfyUI did not take the edit — is it running?');
  }
  const [entry] = await waitForGalleryPromptIds([queued.promptId], {
    timeoutMs: 5 * 60_000,
    pollMs: 2_500,
  });
  const url = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
  if (!url) throw new Error('The edit did not finish (it needs Qwen-Image 2.1 Turbo).');
  return clothingPictureFromUrl(url, 'clothing-edit.png');
}
