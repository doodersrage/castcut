/**
 * Server: "Relight" (relight.ts). The still goes into ComfyUI's input and is re-lit on the
 * installed Rapid AIO edit checkpoint with the Relight LoRA. Returns the new still's view URL.
 */

import sharp from 'sharp';
import { uploadComfyInputContent } from './comfy-input-upload-server';
import {
  comfyBaseUrl,
  runComfyUtilityGraph,
  type ComfyImageRef,
} from './comfy-utility-graph-server';
import {
  buildRelightGraph,
  RELIGHT_LORA,
  RELIGHT_SAVE_NODE,
  relightPrompt,
  relightSize,
} from './relight';

/** Rapid AIO checkpoints, best first (NSFW v23 keeps adult stills as they are). */
export function pickRelightCheckpoint(installed: readonly string[]): string | null {
  const rapid = installed.filter(name => /rapid[-_]?aio/i.test(name));
  return (
    rapid.find(name => /nsfw/i.test(name) && /v23/i.test(name)) ??
    rapid.find(name => /nsfw/i.test(name)) ??
    rapid[0] ??
    null
  );
}

async function comfyModelNames(baseUrl: string, folder: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/models/${folder}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const names = (await response.json()) as unknown;
  return Array.isArray(names)
    ? names.filter((name): name is string => typeof name === 'string')
    : [];
}

export class RelightUnavailableError extends Error {}

export async function relightStill(input: {
  stillUrl: string;
  look: string;
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
  seed?: number;
}): Promise<string> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const [checkpoints, loras] = await Promise.all([
    comfyModelNames(baseUrl, 'checkpoints'),
    comfyModelNames(baseUrl, 'loras'),
  ]);
  const checkpoint = pickRelightCheckpoint(checkpoints);
  if (!checkpoint) {
    throw new RelightUnavailableError(
      'Relight needs the Qwen Rapid AIO edit checkpoint in ComfyUI.'
    );
  }
  if (!loras.includes(RELIGHT_LORA)) {
    throw new RelightUnavailableError(`Relight needs ${RELIGHT_LORA} in ComfyUI's loras folder.`);
  }
  const { fetchFilmShotBytes } = await import('./video-shot-fetch');
  const still = await fetchFilmShotBytes({
    url: input.stillUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const meta = await sharp(still.buffer).metadata();
  if (!meta.width || !meta.height) throw new Error('Could not read that still.');
  const uploaded = await uploadComfyInputContent({
    baseUrl,
    bytes: new Uint8Array(still.buffer),
    filename: 'castcut-relight.png',
    mimeType: still.contentType || 'image/png',
  });
  const result = await runComfyUtilityGraph<ComfyImageRef>({
    baseUrl,
    label: 'relight',
    timeoutMs: 5 * 60_000,
    prompt: buildRelightGraph({
      checkpoint,
      image: uploaded.name,
      prompt: relightPrompt(input.look),
      ...relightSize(meta.width, meta.height),
      seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
      prefix: 'Castcut-relit',
    }),
    read: entry => {
      const out = (entry.outputs?.[RELIGHT_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined)
        ?.images?.[0];
      return out?.filename ? out : undefined;
    },
  });
  const image = result.result;
  if (!image) throw new Error('Relight ended without a picture — check the ComfyUI log.');
  return `/api/comfyui/view?${new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type || 'output',
  }).toString()}`;
}
