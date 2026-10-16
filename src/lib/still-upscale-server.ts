/**
 * Server: "Upscale" (still-upscale.ts). The still goes into ComfyUI's input and SeedVR2 brings it
 * to 2× or 4K. Returns the new still's view URL.
 */

import sharp from 'sharp';
import { uploadComfyInputContent } from './comfy-input-upload-server';
import { comfyBaseUrl, type ComfyImageRef } from './comfy-utility-graph-server';
import { CLIP_FINISH_MODELS } from './clip-finish';
import { requireComfyModels, runHeavyComfyGraph } from './heavy-graph-server';
import {
  buildStillUpscaleGraph,
  STILL_UPSCALE_SAVE_NODE,
  stillUpscaleSize,
  type StillUpscaleTarget,
} from './still-upscale';

export class StillAlreadyLargeError extends Error {}

export async function upscaleStill(input: {
  stillUrl: string;
  target: StillUpscaleTarget;
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
  seed?: number;
}): Promise<string> {
  const { fetchFilmShotBytes } = await import('./video-shot-fetch');
  const still = await fetchFilmShotBytes({
    url: input.stillUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const meta = await sharp(still.buffer).metadata();
  if (!meta.width || !meta.height) throw new Error('Could not read that still.');
  const size = stillUpscaleSize(meta.width, meta.height, input.target);
  if (!size) throw new StillAlreadyLargeError('This still is already that size.');
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  await requireComfyModels(baseUrl, 'Upscale', [
    { folder: 'diffusion_models', file: CLIP_FINISH_MODELS.seedvr },
    { folder: 'vae', file: CLIP_FINISH_MODELS.seedvrVae },
  ]);
  const uploaded = await uploadComfyInputContent({
    baseUrl,
    bytes: new Uint8Array(still.buffer),
    filename: 'castcut-upscale.png',
    mimeType: still.contentType || 'image/png',
  });
  const result = await runHeavyComfyGraph<ComfyImageRef>({
    baseUrl,
    comfyUrl: input.comfyUrl,
    label: 'upscale',
    priority: 'queue',
    timeoutMs: 15 * 60_000,
    prompt: buildStillUpscaleGraph({
      image: uploaded.name,
      ...size,
      seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
      prefix: 'Castcut-upscaled',
    }),
    read: entry => {
      const out = (
        entry.outputs?.[STILL_UPSCALE_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
      )?.images?.[0];
      return out?.filename ? out : undefined;
    },
  });
  const image = result.result;
  if (!image) throw new Error('Upscale ended without a picture — check the ComfyUI log.');
  return `/api/comfyui/view?${new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type || 'output',
  }).toString()}`;
}
