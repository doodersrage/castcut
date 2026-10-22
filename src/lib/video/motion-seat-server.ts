/**
 * Server: put a seat into the still before Copy moves (motion-seat.ts) — a plain edit on the
 * installed Qwen Rapid AIO checkpoint, as Sketch does. Returns the edited picture's bytes, or null
 * when the checkpoint is missing (the clip then runs on the still as it is).
 */

import sharp from 'sharp';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import { runComfyUtilityGraph, type ComfyImageRef } from '../comfyui/comfy-utility-graph-server';
import { buildRelightGraph, RELIGHT_SAVE_NODE, relightSize } from '../edit/relight';
import { pickRelightCheckpoint } from '../edit/relight-server';
import { seatStillPrompt } from './motion-seat';

export async function seatStill(input: {
  baseUrl: string;
  still: Uint8Array;
  contentType?: string;
  seat: string;
  signal?: AbortSignal;
  seed?: number;
}): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const listed = await fetch(`${input.baseUrl}/models/checkpoints`, {
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  const names = listed?.ok ? ((await listed.json()) as unknown) : [];
  const checkpoint = pickRelightCheckpoint(Array.isArray(names) ? names.map(String) : []);
  if (!checkpoint) return null;
  const meta = await sharp(input.still).metadata();
  if (!meta.width || !meta.height) return null;
  const uploaded = await uploadComfyInputContent({
    baseUrl: input.baseUrl,
    bytes: input.still,
    filename: 'castcut-moves-seat.png',
    mimeType: input.contentType || 'image/png',
  });
  const result = await runComfyUtilityGraph<ComfyImageRef>({
    baseUrl: input.baseUrl,
    label: 'moves-seat',
    signal: input.signal,
    timeoutMs: 10 * 60_000,
    prompt: buildRelightGraph({
      checkpoint,
      image: uploaded.name,
      prompt: seatStillPrompt(input.seat),
      ...relightSize(meta.width, meta.height),
      seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
      prefix: 'Castcut-moves-seat',
      noLora: true,
    }),
    read: entry => {
      const out = (entry.outputs?.[RELIGHT_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined)
        ?.images?.[0];
      return out?.filename ? out : undefined;
    },
  });
  const image = result.result;
  if (!image) return null;
  const view = await fetch(
    `${input.baseUrl}/view?${new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? '',
      type: image.type || 'output',
    }).toString()}`,
    { signal: AbortSignal.timeout(30_000) }
  );
  if (!view.ok) return null;
  return {
    bytes: new Uint8Array(await view.arrayBuffer()),
    contentType: view.headers.get('content-type') || 'image/png',
  };
}
