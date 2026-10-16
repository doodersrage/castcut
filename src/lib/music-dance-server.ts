/**
 * Server: "Dance to this music" (music-dance.ts). The song becomes a WAV of at most
 * MUSIC_DANCE_MAX_SECONDS in ComfyUI's input, the still goes beside it, and Wan-Dancer renders
 * the still's person dancing to it. Returns the clip's view URL.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from './comfy-input-upload-server';
import { comfyBaseUrl, type ComfyImageRef } from './comfy-utility-graph-server';
import { requireComfyModels, runHeavyComfyGraph } from './heavy-graph-server';
import { readDurationSeconds, readPictureSize } from './lip-sync-server';
import {
  buildMusicDanceGraph,
  MUSIC_DANCE_MAX_SECONDS,
  MUSIC_DANCE_MODELS,
  MUSIC_DANCE_SAVE_NODE,
  musicDanceSize,
} from './music-dance';
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

export async function danceToMusic(input: {
  music: Uint8Array;
  stillUrl: string;
  style: string;
  amplitude: string;
  /** Where in the song to start, seconds. */
  start?: number;
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
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `dance-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const source = path.join(/* turbopackIgnore: true */ dir, 'music.bin');
    const wav = path.join(/* turbopackIgnore: true */ dir, 'music.wav');
    const picture = path.join(/* turbopackIgnore: true */ dir, 'still.bin');
    await fs.writeFile(/* turbopackIgnore: true */ source, input.music);
    await fs.writeFile(/* turbopackIgnore: true */ picture, still.buffer);
    await run(ffmpeg, [
      '-y',
      '-ss',
      String(Math.max(0, input.start ?? 0)),
      '-i',
      source,
      '-vn',
      '-t',
      String(MUSIC_DANCE_MAX_SECONDS),
      '-ac',
      '2',
      '-ar',
      '44100',
      wav,
    ]);
    const seconds = readDurationSeconds(
      await run(ffmpeg, ['-i', wav, '-f', 'null', '-']).catch(error => String(error))
    );
    if (seconds < 3) throw new Error('That song is too short — at least about 3 seconds.');
    const size = readPictureSize(
      await run(ffmpeg, ['-i', picture, '-f', 'null', '-']).catch(error => String(error))
    );
    if (!size) throw new Error('Could not read that still.');
    const baseUrl = comfyBaseUrl(input.comfyUrl);
    await requireComfyModels(baseUrl, 'Dance to music', [
      { folder: 'diffusion_models', file: MUSIC_DANCE_MODELS.global },
      { folder: 'diffusion_models', file: MUSIC_DANCE_MODELS.local },
      { folder: 'loras', file: MUSIC_DANCE_MODELS.lora },
      { folder: 'text_encoders', file: MUSIC_DANCE_MODELS.clip },
      { folder: 'clip_vision', file: MUSIC_DANCE_MODELS.clipVision },
      { folder: 'vae', file: MUSIC_DANCE_MODELS.vae },
    ]);
    const [audio, image] = await Promise.all([
      uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ wav)),
        filename: 'castcut-dance-music.wav',
        mimeType: 'audio/wav',
      }),
      uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(still.buffer),
        filename: 'castcut-dance-still.png',
        mimeType: still.contentType || 'image/png',
      }),
    ]);
    const result = await runHeavyComfyGraph<ComfyImageRef>({
      baseUrl,
      comfyUrl: input.comfyUrl,
      label: 'dance-to-music',
      priority: 'queue',
      timeoutMs: 45 * 60_000,
      prompt: buildMusicDanceGraph({
        image: image.name,
        audio: audio.name,
        style: input.style,
        amplitude: input.amplitude,
        ...musicDanceSize(size.width, size.height),
        seconds,
        seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
        prefix: 'Castcut-dance',
      }),
      read: entry => {
        const out = (
          entry.outputs?.[MUSIC_DANCE_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
        )?.images?.[0];
        return out?.filename ? out : undefined;
      },
    });
    const clip = result.result;
    if (!clip) throw new Error('Dance to music ended without a clip — check the ComfyUI log.');
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
