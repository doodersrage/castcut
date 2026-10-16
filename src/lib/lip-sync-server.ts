/**
 * Server: "Lip-sync to a recording" (lip-sync.ts). The recording (a browser recording, MP3, WAV,
 * or a clip's own sound) becomes a mono WAV of at most LIP_SYNC_MAX_SECONDS in ComfyUI's input,
 * the still goes beside it, and InfiniteTalk renders the still's person saying it. Returns the
 * clip's view URL.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from './comfy-input-upload-server';
import { comfyBaseUrl, type ComfyImageRef } from './comfy-utility-graph-server';
import { requireComfyModels, runHeavyComfyGraph } from './heavy-graph-server';
import {
  buildLipSyncGraph,
  LIP_SYNC_MAX_SECONDS,
  LIP_SYNC_MODELS,
  LIP_SYNC_SAVE_NODE,
  lipSyncSize,
} from './lip-sync';
import { filmTempOsDir, resolveFfmpegBinary } from './video-server-encode';

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

/** "Duration: 00:00:07.48" → 7.48. */
export function readDurationSeconds(log: string): number {
  const match = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
}

/** A picture's size from ffmpeg's stream line. */
export function readPictureSize(log: string): { width: number; height: number } | null {
  const line = log.split('\n').find(text => /Stream #.*Video:/.test(text));
  const size = line?.match(/,\s(\d{2,5})x(\d{2,5})[\s,[]/);
  return size ? { width: Number(size[1]), height: Number(size[2]) } : null;
}

export async function lipSyncStill(input: {
  audio: Uint8Array;
  stillUrl: string;
  /** What the clip shows ("a woman talking to the camera in a kitchen"). */
  prompt: string;
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
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `lipsync-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const source = path.join(/* turbopackIgnore: true */ dir, 'voice.bin');
    const wav = path.join(/* turbopackIgnore: true */ dir, 'voice.wav');
    const picture = path.join(/* turbopackIgnore: true */ dir, 'still.bin');
    await fs.writeFile(/* turbopackIgnore: true */ source, input.audio);
    await fs.writeFile(/* turbopackIgnore: true */ picture, still.buffer);
    await run(ffmpeg, [
      '-y',
      '-i',
      source,
      '-vn',
      '-t',
      String(LIP_SYNC_MAX_SECONDS),
      '-ac',
      '1',
      '-ar',
      '16000',
      wav,
    ]);
    const seconds = readDurationSeconds(
      await run(ffmpeg, ['-i', wav, '-f', 'null', '-']).catch(error => String(error))
    );
    if (seconds < 0.5) throw new Error('That recording is too short or has no sound.');
    const size = readPictureSize(
      await run(ffmpeg, ['-i', picture, '-f', 'null', '-']).catch(error => String(error))
    );
    if (!size) throw new Error('Could not read that still.');
    const baseUrl = comfyBaseUrl(input.comfyUrl);
    await requireComfyModels(baseUrl, 'Lip-sync', [
      { folder: 'diffusion_models', file: LIP_SYNC_MODELS.unet },
      { folder: 'model_patches', file: LIP_SYNC_MODELS.patch },
      { folder: 'loras', file: LIP_SYNC_MODELS.lora },
      { folder: 'audio_encoders', file: LIP_SYNC_MODELS.audioEncoder },
      { folder: 'text_encoders', file: LIP_SYNC_MODELS.clip },
      { folder: 'vae', file: LIP_SYNC_MODELS.vae },
    ]);
    const [audio, image] = await Promise.all([
      uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ wav)),
        filename: 'castcut-lipsync.wav',
        mimeType: 'audio/wav',
      }),
      uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(still.buffer),
        filename: 'castcut-lipsync-still.png',
        mimeType: still.contentType || 'image/png',
      }),
    ]);
    const result = await runHeavyComfyGraph<ComfyImageRef>({
      baseUrl,
      comfyUrl: input.comfyUrl,
      label: 'lip-sync',
      priority: 'queue',
      timeoutMs: 30 * 60_000,
      prompt: buildLipSyncGraph({
        image: image.name,
        audio: audio.name,
        prompt: input.prompt,
        ...lipSyncSize(size.width, size.height),
        seconds,
        seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
        prefix: 'Castcut-lipsync',
      }),
      read: entry => {
        const out = (
          entry.outputs?.[LIP_SYNC_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
        )?.images?.[0];
        return out?.filename ? out : undefined;
      },
    });
    const clip = result.result;
    if (!clip) throw new Error('Lip-sync ended without a clip — check the ComfyUI log.');
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
