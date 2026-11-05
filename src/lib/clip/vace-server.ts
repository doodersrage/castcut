/**
 * Server: Restyle and Remove (vace.ts) — the clip re-rendered in chunks on WAN 2.2 Fun VACE
 * (realism-server.ts rerenderClipInChunks), its depth or its masked frames guiding each chunk.
 * Returns the new clip's ComfyUI view URL (an input file; the caller keeps it in the Gallery).
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { type ComfyImageRef } from '../comfyui/comfy-utility-graph-server';
import { runHeavyComfyGraph } from '../server/heavy-graph-server';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import { visionCompletion } from '../llm/client';
import type { LlmRequestOptions } from '../llm/request-options';
import {
  rerenderClipInChunks,
  type ChunkedClipInput,
  type ChunkedRerenderContext,
} from './realism-server';
import {
  buildClipTrackGraph,
  buildClipVaceGraph,
  CLIP_TRACK_MODEL,
  CLIP_TRACK_SAVE_NODE,
  CLIP_VACE_MODELS,
  CLIP_VACE_SAVE_NODE,
  type ClipStyleId,
} from './vace';

const VACE_MODELS = [
  { folder: 'diffusion_models', file: CLIP_VACE_MODELS.high },
  { folder: 'diffusion_models', file: CLIP_VACE_MODELS.low },
  { folder: 'loras', file: CLIP_VACE_MODELS.loraHigh },
  { folder: 'loras', file: CLIP_VACE_MODELS.loraLow },
  { folder: 'text_encoders', file: CLIP_VACE_MODELS.textEncoder },
  { folder: 'vae', file: CLIP_VACE_MODELS.vae },
];

/** The clip's first frame as a PNG (ffmpeg to a pipe), or null. */
function firstFramePng(
  ffmpeg: string,
  source: string,
  signal?: AbortSignal
): Promise<Buffer | null> {
  return new Promise(resolve => {
    const child = spawn(
      ffmpeg,
      [
        '-v',
        'error',
        '-i',
        source,
        '-frames:v',
        '1',
        '-vf',
        'scale=-2:720',
        '-f',
        'image2pipe',
        '-c:v',
        'png',
        '-',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'], signal }
    );
    const chunks: Buffer[] = [];
    child.stdout.on('data', chunk => chunks.push(chunk as Buffer));
    child.on('error', () => resolve(null));
    child.on('close', code => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null));
  });
}

/**
 * What the clip shows, its colours named, from the vision model ('' when there is none): depth
 * carries no colour, and the look repainted a red dress blue until the words named it (vace.ts).
 */
async function describeColours(png: Buffer, llm?: LlmRequestOptions): Promise<string> {
  try {
    const { resolveGalleryVisionTarget } = await import('../gallery/vision-review');
    const target = await resolveGalleryVisionTarget({ llm });
    const reply = await visionCompletion({
      ...target,
      systemPrompt:
        'Describe the picture in one plain sentence of at most 45 words: the people (hair, clothes, shoes, anything held) and the place (walls, floor, furniture), naming every colour. No opinions, no camera words.',
      textPrompt: 'Describe this picture.',
      imageDataUrl: `data:image/png;base64,${png.toString('base64')}`,
      maxTokens: 400,
      temperature: 0.1,
      usageContext: { route: 'clip-restyle' },
    });
    return reply
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 400);
  } catch {
    return '';
  }
}

/** Restyle: a preset look (`style`), or your own words for one (`look`). */
export function restyleClip(
  input: ChunkedClipInput &
    ({ style: ClipStyleId; look?: undefined } | { style?: undefined; look: string }) & {
      llm?: LlmRequestOptions;
    }
): Promise<string> {
  return rerenderClipInChunks(input, {
    label: 'Restyle',
    models: VACE_MODELS,
    verb: 'Restyling',
    uploadName: 'castcut-restyle',
    outName: 'castcut-restyled.mp4',
    saveNode: CLIP_VACE_SAVE_NODE,
    freeAfter: true,
    prepare: async ({ source, ffmpeg, signal }) => {
      const png = await firstFramePng(ffmpeg, source, signal);
      return { scene: png ? await describeColours(png, input.llm) : '' };
    },
    graph: chunk =>
      buildClipVaceGraph({
        ...chunk,
        prefix: 'Castcut-restyle-part',
        mode: input.style
          ? { kind: 'restyle', style: input.style }
          : { kind: 'restyle', look: input.look ?? '' },
        scene: chunk.extra.scene,
      }),
  });
}

/**
 * The painted object followed through the clip by SAM 3 (buildClipTrackGraph): a mask video as
 * long as the clip, saved in `dir`. Null when SAM 3 isn't installed or the track fails — the
 * painted picture is then used on every frame, as before.
 */
async function trackMask(
  context: ChunkedRerenderContext,
  mask: string,
  comfyUrl?: string
): Promise<string | null> {
  try {
    const { baseUrl, source, ffmpeg, dir, size, fps, signal } = context;
    const response = await fetch(`${baseUrl}/models/checkpoints`, {
      signal: AbortSignal.timeout(8000),
    });
    const names = response.ok ? ((await response.json()) as unknown[]) : [];
    if (!names.includes(CLIP_TRACK_MODEL)) return null;
    const whole = path.join(/* turbopackIgnore: true */ dir, 'track-source.mp4');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        ffmpeg,
        [
          '-y',
          '-v',
          'error',
          '-i',
          source,
          '-an',
          '-r',
          String(fps),
          '-c:v',
          'libx264',
          '-crf',
          '14',
          '-pix_fmt',
          'yuv420p',
          whole,
        ],
        { stdio: 'ignore', signal }
      );
      child.on('error', reject);
      child.on('close', code => (code === 0 ? resolve() : reject(new Error('ffmpeg failed'))));
    });
    const uploaded = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ whole)),
      filename: 'castcut-track-source.mp4',
      mimeType: 'video/mp4',
    });
    const result = await runHeavyComfyGraph<ComfyImageRef>({
      baseUrl,
      comfyUrl,
      label: 'clip-track',
      priority: 'queue',
      timeoutMs: 15 * 60_000,
      signal,
      prompt: buildClipTrackGraph({
        video: uploaded.name,
        mask,
        ...size,
        fps,
        prefix: 'Castcut-track',
      }),
      read: entry => {
        const out = (
          entry.outputs?.[CLIP_TRACK_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
        )?.images?.[0];
        return out?.filename ? out : undefined;
      },
    });
    const out = result.result;
    if (!out) return null;
    const view = await fetch(
      `${baseUrl}/view?${new URLSearchParams({ filename: out.filename, subfolder: out.subfolder ?? '', type: out.type || 'output' }).toString()}`
    );
    if (!view.ok) return null;
    const tracked = path.join(/* turbopackIgnore: true */ dir, 'track-mask.mp4');
    await fs.writeFile(
      /* turbopackIgnore: true */ tracked,
      new Uint8Array(await view.arrayBuffer())
    );
    return tracked;
  } catch (error) {
    if (context.signal?.aborted) throw error;
    return null;
  }
}

/**
 * Remove (or, with `words`, replace) what's painted on the first frame. `mask`: a PNG, white where
 * it is. `track` (default on): SAM 3 follows it through the clip; off, or without SAM 3, the
 * painted area is the same on every frame.
 */
export function removeFromClip(
  input: ChunkedClipInput & { mask: Uint8Array; words?: string; track?: boolean }
): Promise<string> {
  const progress = input.job?.progress ?? (() => undefined);
  return rerenderClipInChunks(input, {
    label: input.words?.trim() ? 'Replace in clip' : 'Remove from clip',
    models: VACE_MODELS,
    verb: input.words?.trim() ? 'Replacing it in' : 'Removing it from',
    uploadName: 'castcut-remove',
    outName: 'castcut-removed.mp4',
    saveNode: CLIP_VACE_SAVE_NODE,
    freeAfter: true,
    prepare: async (context): Promise<Record<string, string>> => {
      const uploaded = await uploadComfyInputContent({
        baseUrl: context.baseUrl,
        bytes: input.mask,
        filename: 'castcut-remove-mask.png',
        mimeType: 'image/png',
      });
      if (input.track === false) return { mask: uploaded.name };
      progress({ note: 'Following it through the clip' });
      const tracked = await trackMask(context, uploaded.name, input.comfyUrl);
      return tracked ? { mask: uploaded.name, tracked } : { mask: uploaded.name };
    },
    // A tracked mask: this chunk's frames of it, cut as the clip's own.
    perChunk: async (chunk, context): Promise<Record<string, string>> => {
      if (!context.extra.tracked) return {};
      const part = path.join(/* turbopackIgnore: true */ context.dir, `mask-${chunk.index}.mp4`);
      await context.cut(context.extra.tracked, part, chunk);
      const uploaded = await uploadComfyInputContent({
        baseUrl: context.baseUrl,
        bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ part)),
        filename: `castcut-remove-mask-${chunk.index}.mp4`,
        mimeType: 'video/mp4',
      });
      return { maskChunk: uploaded.name };
    },
    graph: chunk =>
      buildClipVaceGraph({
        ...chunk,
        prefix: 'Castcut-remove-part',
        mode: chunk.extra.maskChunk
          ? { kind: 'remove', mask: chunk.extra.maskChunk, maskIsVideo: true, words: input.words }
          : { kind: 'remove', mask: chunk.extra.mask ?? '', words: input.words },
      }),
  });
}
