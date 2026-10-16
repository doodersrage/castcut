/**
 * Server: "Copy moves from a video" (motion-transfer.ts). The driving video becomes a 16 fps MP4
 * (Wan's rate; at most MOTION_MAX_FRAMES frames) in ComfyUI's input, the still goes in beside it,
 * and Wan Animate 2 renders the still's person doing those moves. Returns the clip's view URL.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from './comfy-input-upload-server';
import { comfyBaseUrl, type ComfyImageRef } from './comfy-utility-graph-server';
import { requireComfyModels, runHeavyComfyGraph } from './heavy-graph-server';
import { readClipStream } from './clip-finish-server';
import {
  buildMotionTransferGraph,
  MOTION_MAX_FRAMES,
  MOTION_TRANSFER_MODELS,
  MOTION_TRANSFER_SAVE_NODE,
  motionTransferPrompt,
  motionTransferSize,
} from './motion-transfer';
import { filmTempOsDir, resolveFfmpegBinary } from './video-server-encode';

const MOTION_FPS = 16;

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

export async function transferMotion(input: {
  /** The driving video's bytes (an upload). */
  video: Uint8Array;
  /** The still whose person moves (a gallery / ComfyUI URL). */
  stillUrl: string;
  /** Who they are and what they wear. */
  look: string;
  place?: string;
  /** What the driving video shows. */
  motion?: string;
  keepSound?: boolean;
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
  seed?: number;
}): Promise<string> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const { fetchFilmShotBytes } = await import('./video-shot-fetch');
  const still = await fetchFilmShotBytes({
    url: input.stillUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `moves-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const source = path.join(/* turbopackIgnore: true */ dir, 'drive.bin');
    const drive = path.join(/* turbopackIgnore: true */ dir, 'drive.mp4');
    await fs.writeFile(/* turbopackIgnore: true */ source, input.video);
    await run(ffmpeg, [
      '-y',
      '-i',
      source,
      '-vf',
      `fps=${MOTION_FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      '-frames:v',
      String(MOTION_MAX_FRAMES),
      '-c:v',
      'libx264',
      '-crf',
      '16',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-shortest',
      drive,
    ]);
    const probe = await run(ffmpeg, ['-i', drive, '-f', 'null', '-']).catch(error =>
      String(error instanceof Error ? error.message : error)
    );
    const stream = readClipStream(probe);
    const frames = Number([...probe.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1] ?? 0);
    if (!stream || !frames) throw new Error('Could not read that video.');
    if (frames < 17) throw new Error('That video is too short — at least about a second.');
    const baseUrl = comfyBaseUrl(input.comfyUrl);
    await requireComfyModels(baseUrl, 'Copy moves', [
      { folder: 'diffusion_models', file: MOTION_TRANSFER_MODELS.unet },
      { folder: 'text_encoders', file: MOTION_TRANSFER_MODELS.clip },
      { folder: 'clip_vision', file: MOTION_TRANSFER_MODELS.clipVision },
      { folder: 'vae', file: MOTION_TRANSFER_MODELS.vae },
    ]);
    const [video, reference] = await Promise.all([
      uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ drive)),
        filename: 'castcut-moves.mp4',
        mimeType: 'video/mp4',
      }),
      uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(still.buffer),
        filename: 'castcut-moves-still.png',
        mimeType: still.contentType || 'image/png',
      }),
    ]);
    const result = await runHeavyComfyGraph<ComfyImageRef>({
      baseUrl,
      comfyUrl: input.comfyUrl,
      label: 'copy-moves',
      priority: 'queue',
      timeoutMs: 30 * 60_000,
      prompt: buildMotionTransferGraph({
        reference: reference.name,
        video: video.name,
        prompt: motionTransferPrompt({ look: input.look, place: input.place }),
        motion: input.motion?.trim() || 'A reference video of a person moving.',
        ...motionTransferSize(stream.width, stream.height),
        frames,
        seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
        prefix: 'Castcut-moves',
        keepSound: input.keepSound,
      }),
      read: entry => {
        const out = (
          entry.outputs?.[MOTION_TRANSFER_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
        )?.images?.[0];
        return out?.filename ? out : undefined;
      },
    });
    const clip = result.result;
    if (!clip) throw new Error('Copy moves ended without a clip — check the ComfyUI log.');
    return `/api/comfyui/view?${new URLSearchParams({
      filename: clip.filename,
      subfolder: clip.subfolder ?? '',
      type: clip.type || 'output',
    }).toString()}`;
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
