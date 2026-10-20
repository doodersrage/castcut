/**
 * Server: "Sketch over this still" (sketch.ts). The drawn picture (the still with the strokes
 * on it, flattened in the browser) goes into ComfyUI's input and is edited into a photo on the
 * Rapid AIO checkpoint. Returns the picture's view URL.
 */

import sharp from 'sharp';
import { uploadComfyInputContent } from './comfyui/comfy-input-upload-server';
import {
  comfyBaseUrl,
  runComfyUtilityGraph,
  type ComfyImageRef,
} from './comfyui/comfy-utility-graph-server';
import { buildRelightGraph, RELIGHT_SAVE_NODE, relightSize } from './relight';
import { pickRelightCheckpoint, RelightUnavailableError } from './relight-server';
import { sketchPrompt } from './sketch';

export async function renderSketch(input: {
  image: Uint8Array;
  words: string;
  overStill: boolean;
  comfyUrl?: string;
  seed?: number;
}): Promise<string> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const response = await fetch(`${baseUrl}/models/checkpoints`, {
    signal: AbortSignal.timeout(8000),
  });
  const names = response.ok ? ((await response.json()) as unknown) : [];
  const checkpoint = pickRelightCheckpoint(Array.isArray(names) ? names.map(String) : []);
  if (!checkpoint) {
    throw new RelightUnavailableError(
      'Sketch needs the Qwen Rapid AIO edit checkpoint in ComfyUI.'
    );
  }
  const meta = await sharp(input.image).metadata();
  if (!meta.width || !meta.height) throw new Error('Could not read the drawing.');
  const uploaded = await uploadComfyInputContent({
    baseUrl,
    bytes: input.image,
    filename: 'castcut-sketch.png',
    mimeType: 'image/png',
  });
  const result = await runComfyUtilityGraph<ComfyImageRef>({
    baseUrl,
    label: 'sketch',
    // It waits its turn behind a running job (a long clip can take minutes).
    timeoutMs: 10 * 60_000,
    prompt: buildRelightGraph({
      checkpoint,
      image: uploaded.name,
      prompt: sketchPrompt(input.words, input.overStill),
      ...relightSize(meta.width, meta.height),
      seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
      prefix: 'Castcut-sketch',
      noLora: true,
    }),
    read: entry => {
      const out = (entry.outputs?.[RELIGHT_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined)
        ?.images?.[0];
      return out?.filename ? out : undefined;
    },
  });
  const image = result.result;
  if (!image) throw new Error('Sketch ended without a picture — check the ComfyUI log.');
  return `/api/comfyui/view?${new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type || 'output',
  }).toString()}`;
}
