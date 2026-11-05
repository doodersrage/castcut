/**
 * Server: Motion brush (motion-brush.ts). The still goes to ComfyUI's input at WAN 2.1 480p's
 * size, the strokes become its tracks, WAN-Move animates it, and the new clip's ComfyUI view URL
 * comes back (an output file; the caller keeps it in the Gallery).
 */

import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import { comfyBaseUrl, type ComfyImageRef } from '../comfyui/comfy-utility-graph-server';
import {
  requireComfyModels,
  runHeavyComfyGraph,
  freeComfyAndSettle,
} from '../server/heavy-graph-server';
import { throwIfCancelled, type ClipJobContext } from './clip-jobs-server';
import {
  buildMotionBrushGraph,
  MOTION_BRUSH_FRAMES,
  MOTION_BRUSH_MODELS,
  MOTION_BRUSH_SAVE_NODE,
  motionBrushSize,
  motionTracks,
  type MotionStroke,
} from './motion-brush';

export async function makeMotionBrushClip(input: {
  stillUrl: string;
  entryId?: string;
  strokes: MotionStroke[];
  prompt?: string;
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
  seed?: number;
  job?: ClipJobContext;
}): Promise<string> {
  const signal = input.job?.signal;
  const progress = input.job?.progress ?? (() => undefined);
  if (!input.strokes.length) throw new Error('Draw where things move first.');
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  progress({ total: 1, done: 0, note: 'Checking the models…' });
  await requireComfyModels(baseUrl, 'Motion brush', [
    { folder: 'diffusion_models', file: MOTION_BRUSH_MODELS.unet },
    { folder: 'loras', file: MOTION_BRUSH_MODELS.lora },
    { folder: 'clip_vision', file: MOTION_BRUSH_MODELS.clipVision },
    { folder: 'text_encoders', file: MOTION_BRUSH_MODELS.textEncoder },
    { folder: 'vae', file: MOTION_BRUSH_MODELS.vae },
  ]);
  const { fetchFilmShotBytes } = await import('../video/shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.stillUrl,
    entryId: input.entryId,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const sharp = (await import('sharp')).default;
  const meta = await sharp(fetched.buffer).metadata();
  const size = motionBrushSize(meta.width ?? 832, meta.height ?? 480);
  const png = await sharp(fetched.buffer)
    .resize(size.width, size.height, { fit: 'cover' })
    .png()
    .toBuffer();
  const uploaded = await uploadComfyInputContent({
    baseUrl,
    bytes: new Uint8Array(png),
    filename: 'castcut-motion-still.png',
    mimeType: 'image/png',
  });
  throwIfCancelled(signal);
  progress({ note: 'Moving the still on ComfyUI' });
  try {
    const result = await runHeavyComfyGraph<ComfyImageRef>({
      baseUrl,
      comfyUrl: input.comfyUrl,
      label: 'motion-brush',
      priority: 'queue',
      timeoutMs: 20 * 60_000,
      signal,
      prompt: buildMotionBrushGraph({
        image: uploaded.name,
        ...size,
        tracks: motionTracks(input.strokes, MOTION_BRUSH_FRAMES, size.width, size.height),
        prompt: input.prompt,
        seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
        prefix: 'Castcut-motion',
      }),
      read: entry => {
        const out = (
          entry.outputs?.[MOTION_BRUSH_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
        )?.images?.[0];
        return out?.filename ? out : undefined;
      },
    });
    const out = result.result;
    if (!out) throw new Error('No clip came back — check the ComfyUI log.');
    return `/api/comfyui/view?${new URLSearchParams({
      filename: out.filename,
      subfolder: out.subfolder ?? '',
      type: out.type || 'output',
    }).toString()}`;
  } finally {
    // A 14B model with nothing else after it: give the memory back (as VACE's jobs do).
    await freeComfyAndSettle(input.comfyUrl);
  }
}
