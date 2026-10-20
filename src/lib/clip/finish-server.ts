/**
 * Server: "Finish clip" (clip-finish.ts). The clip (WAN's animated WebP or an MP4) becomes an MP4
 * in ComfyUI's input, SeedVR2 brings it up to CLIP_FINISH_LONG_SIDE and RIFE doubles a 16 fps
 * clip's frames, its sound passed through. Returns the finished MP4's ComfyUI view URL.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import { comfyBaseUrl, type ComfyImageRef } from '../comfyui/comfy-utility-graph-server';
import { requireComfyModels, runHeavyComfyGraph } from '../server/heavy-graph-server';
import {
  buildClipFinishGraph,
  CLIP_FINISH_MODELS,
  CLIP_FINISH_SAVE_NODE,
  clipFinishPlan,
} from './finish';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', code =>
      code === 0 ? resolve(stderr) : reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))
    );
  });
}

/** Size and frame rate from ffmpeg's stream line ("… 832x480 … 16 fps"). */
export function readClipStream(log: string): { width: number; height: number; fps: number } | null {
  const line = log.split('\n').find(text => /Stream #.*Video:/.test(text));
  if (!line) return null;
  const size = line.match(/,\s(\d{2,5})x(\d{2,5})[\s,[]/);
  const fps = line.match(/,\s(\d+(?:\.\d+)?) fps/) ?? line.match(/,\s(\d+(?:\.\d+)?) tbr/);
  if (!size || !fps) return null;
  return { width: Number(size[1]), height: Number(size[2]), fps: Number(fps[1]) };
}

export class ClipAlreadyFinishedError extends Error {}

export async function finishClip(input: {
  clipUrl: string;
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
  seed?: number;
}): Promise<string> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const { fetchFilmShotBytes } = await import('../video/shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.clipUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `finish-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const source = path.join(/* turbopackIgnore: true */ dir, 'clip.bin');
    const mp4 = path.join(/* turbopackIgnore: true */ dir, 'finish-input.mp4');
    await fs.writeFile(/* turbopackIgnore: true */ source, fetched.buffer);
    // An MP4 ComfyUI's LoadVideo reads: even sides, H.264, the sound (if any) kept.
    const log = await run(ffmpeg, [
      '-y',
      '-i',
      source,
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v',
      'libx264',
      '-crf',
      '12',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      mp4,
    ]);
    const probe = await run(ffmpeg, ['-i', mp4, '-f', 'null', '-']).catch(error =>
      String(error instanceof Error ? error.message : error)
    );
    const stream = readClipStream(probe) ?? readClipStream(log);
    if (!stream) throw new Error('Could not read that clip.');
    const plan = clipFinishPlan(stream);
    if (!plan) throw new ClipAlreadyFinishedError('This clip is already full size and smooth.');
    const baseUrl = comfyBaseUrl(input.comfyUrl);
    await requireComfyModels(baseUrl, 'Sharpen & smooth', [
      ...(plan.scale > 1
        ? [
            { folder: 'diffusion_models', file: CLIP_FINISH_MODELS.seedvr },
            { folder: 'vae', file: CLIP_FINISH_MODELS.seedvrVae },
          ]
        : []),
      ...(plan.multiplier > 1
        ? [{ folder: 'frame_interpolation', file: CLIP_FINISH_MODELS.interpolation }]
        : []),
    ]);
    const uploaded = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ mp4)),
      filename: 'castcut-finish.mp4',
      mimeType: 'video/mp4',
    });
    const result = await runHeavyComfyGraph<ComfyImageRef>({
      baseUrl,
      comfyUrl: input.comfyUrl,
      label: 'finish-clip',
      priority: 'queue',
      // A 30-second clip upscaled in chunks takes several minutes.
      timeoutMs: 20 * 60_000,
      prompt: buildClipFinishGraph({
        video: uploaded.name,
        plan,
        seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
        prefix: 'Castcut-finished',
      }),
      read: entry => {
        const out = (
          entry.outputs?.[CLIP_FINISH_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
        )?.images?.[0];
        return out?.filename ? out : undefined;
      },
    });
    const clip = result.result;
    if (!clip) throw new Error('Finishing ended without a clip — check the ComfyUI log.');
    const view = new URLSearchParams({
      filename: clip.filename,
      subfolder: clip.subfolder ?? '',
      type: clip.type || 'output',
    });
    return `/api/comfyui/view?${view.toString()}`;
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
