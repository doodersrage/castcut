/**
 * Server: Restyle and Remove (vace.ts) — the clip re-rendered in chunks on WAN 2.2 Fun VACE
 * (realism-server.ts rerenderClipInChunks), its depth or its masked frames guiding each chunk.
 * Returns the new clip's ComfyUI view URL (an input file; the caller keeps it in the Gallery).
 */

import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import { visionCompletion } from '../llm/client';
import type { LlmRequestOptions } from '../llm/request-options';
import { rerenderClipInChunks, type ChunkedClipInput } from './realism-server';
import {
  buildClipVaceGraph,
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

export function restyleClip(
  input: ChunkedClipInput & { style: ClipStyleId; llm?: LlmRequestOptions }
): Promise<string> {
  return rerenderClipInChunks(input, {
    label: 'Restyle',
    models: VACE_MODELS,
    verb: 'Restyling',
    uploadName: 'castcut-restyle',
    outName: 'castcut-restyled.mp4',
    saveNode: CLIP_VACE_SAVE_NODE,
    prepare: async ({ source, ffmpeg, signal }) => {
      const png = await firstFramePng(ffmpeg, source, signal);
      return { scene: png ? await describeColours(png, input.llm) : '' };
    },
    graph: chunk =>
      buildClipVaceGraph({
        ...chunk,
        prefix: 'Castcut-restyle-part',
        mode: { kind: 'restyle', style: input.style },
        scene: chunk.extra.scene,
      }),
  });
}

/** `mask`: a PNG the clip's size or any, white where something goes, black elsewhere. */
export function removeFromClip(input: ChunkedClipInput & { mask: Uint8Array }): Promise<string> {
  return rerenderClipInChunks(input, {
    label: 'Remove from clip',
    models: VACE_MODELS,
    verb: 'Removing it from',
    uploadName: 'castcut-remove',
    outName: 'castcut-removed.mp4',
    saveNode: CLIP_VACE_SAVE_NODE,
    prepare: async ({ baseUrl }) => {
      const uploaded = await uploadComfyInputContent({
        baseUrl,
        bytes: input.mask,
        filename: 'castcut-remove-mask.png',
        mimeType: 'image/png',
      });
      return { mask: uploaded.name };
    },
    graph: chunk =>
      buildClipVaceGraph({
        ...chunk,
        prefix: 'Castcut-remove-part',
        mode: { kind: 'remove', mask: chunk.extra.mask ?? '' },
      }),
  });
}
