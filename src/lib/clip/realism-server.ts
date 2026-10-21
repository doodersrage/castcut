/**
 * Server: "Make more realistic" (realism.ts). The clip is cut into WAN-sized chunks with ffmpeg,
 * each chunk is re-rendered on ComfyUI (one heavy job at a time), and the results are crossfaded
 * back into one MP4 with the clip's own sound. Returns the new clip's ComfyUI view URL (an input
 * file; the caller keeps it in the Gallery).
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import { comfyBaseUrl, type ComfyImageRef } from '../comfyui/comfy-utility-graph-server';
import { requireComfyModels, runHeavyComfyGraph } from '../server/heavy-graph-server';
import {
  buildClipRealismGraph,
  CLIP_REALISM_DENOISE,
  CLIP_REALISM_MODELS,
  CLIP_REALISM_SAVE_NODE,
  clipRealismChunks,
  clipRealismJoinFilter,
  clipRealismSize,
  type ClipRealismStrength,
} from './realism';
import { readClipStream } from './finish-server';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';
import { throwIfCancelled, type ClipJobContext } from './clip-jobs-server';
import { ffmpegFailureMessage } from './clip-jobs';

function run(bin: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], signal });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) return resolve(stderr);
      if (!signal?.aborted) console.error('[clip] ffmpeg failed:', stderr.trim().slice(-4000));
      reject(new Error(ffmpegFailureMessage(stderr, code)));
    });
  });
}

/** Frames decoded, from ffmpeg's last progress line ("frame=  243 …"). */
export function readFrameCount(log: string): number | null {
  const matches = [...log.matchAll(/frame=\s*(\d+)/g)];
  const last = matches.at(-1)?.[1];
  return last ? Number(last) : null;
}

export async function makeClipRealistic(input: {
  clipUrl: string;
  entryId?: string;
  strength: ClipRealismStrength;
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
  seed?: number;
  /** The background job's signal and progress (clip-jobs-server.ts). */
  job?: ClipJobContext;
}): Promise<string> {
  const signal = input.job?.signal;
  const progress = input.job?.progress ?? (() => undefined);
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const { fetchFilmShotBytes } = await import('../video/shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.clipUrl,
    entryId: input.entryId,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `realism-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const file = (name: string) => path.join(/* turbopackIgnore: true */ dir, name);
  try {
    const source = file('clip.bin');
    await fs.writeFile(/* turbopackIgnore: true */ source, fetched.buffer);
    const probe = await run(
      ffmpeg,
      ['-i', source, '-map', '0:v:0', '-f', 'null', '-'],
      signal
    ).catch(error => String(error instanceof Error ? error.message : error));
    const stream = readClipStream(probe);
    const total = readFrameCount(probe);
    if (!stream || !total) throw new Error('Could not read that clip.');
    // WAN's WebP reads as 16.13 fps (frame delays in whole milliseconds): it is 16.
    const whole = Math.round(stream.fps);
    const fps = Math.abs(stream.fps - whole) < 0.25 ? whole : stream.fps;
    const chunks = clipRealismChunks(total);
    if (!chunks.length) throw new Error('That clip is too short to re-render.');
    const size = clipRealismSize(stream.width, stream.height);
    // One step per chunk, then the join.
    progress({ total: chunks.length + 1, note: 'Checking the models…' });

    const baseUrl = comfyBaseUrl(input.comfyUrl);
    await requireComfyModels(baseUrl, 'Make more realistic', [
      { folder: 'diffusion_models', file: CLIP_REALISM_MODELS.unet },
      { folder: 'loras', file: CLIP_REALISM_MODELS.lora },
      { folder: 'text_encoders', file: CLIP_REALISM_MODELS.textEncoder },
      { folder: 'vae', file: CLIP_REALISM_MODELS.vae },
    ]);

    // One seed for every chunk, so the shared frames match where they crossfade.
    const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
    const rendered: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      throwIfCancelled(signal);
      progress({
        done: index,
        note:
          chunks.length > 1
            ? `Re-rendering part ${index + 1} of ${chunks.length}`
            : 'Re-rendering the clip',
      });
      const part = file(`chunk-${index}.mp4`);
      const pad = chunk.rendered - chunk.frames;
      await run(
        ffmpeg,
        [
          '-y',
          '-i',
          source,
          '-vf',
          [
            `select='between(n\\,${chunk.start}\\,${chunk.start + chunk.frames - 1})'`,
            'setpts=N/FRAME_RATE/TB',
            ...(pad > 0 ? [`tpad=stop_mode=clone:stop=${pad}`] : []),
            'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          ].join(','),
          '-an',
          '-r',
          String(fps),
          '-c:v',
          'libx264',
          '-crf',
          '12',
          '-pix_fmt',
          'yuv420p',
          part,
        ],
        signal
      );
      const uploaded = await uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ part)),
        filename: `castcut-realism-${index}.mp4`,
        mimeType: 'video/mp4',
      });
      const result = await runHeavyComfyGraph<ComfyImageRef>({
        baseUrl,
        comfyUrl: input.comfyUrl,
        label: 'clip-realism',
        priority: 'queue',
        // One 81-frame chunk on WAN 14B takes a few minutes; leave room for a cold model load.
        timeoutMs: 20 * 60_000,
        signal,
        prompt: buildClipRealismGraph({
          video: uploaded.name,
          ...size,
          fps,
          denoise: CLIP_REALISM_DENOISE[input.strength],
          seed,
          prefix: 'Castcut-realism-part',
        }),
        read: entry => {
          const out = (
            entry.outputs?.[CLIP_REALISM_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
          )?.images?.[0];
          return out?.filename ? out : undefined;
        },
      });
      const out = result.result;
      if (!out) throw new Error('A chunk ended without a clip — check the ComfyUI log.');
      const view = new URLSearchParams({
        filename: out.filename,
        subfolder: out.subfolder ?? '',
        type: out.type || 'output',
      });
      const response = await fetch(`${baseUrl}/view?${view.toString()}`);
      if (!response.ok) throw new Error(`Could not read chunk ${index + 1} from ComfyUI.`);
      const done = file(`rendered-${index}.mp4`);
      await fs.writeFile(
        /* turbopackIgnore: true */ done,
        Buffer.from(await response.arrayBuffer())
      );
      rendered.push(done);
    }

    throwIfCancelled(signal);
    progress({ done: chunks.length, note: 'Joining the parts and putting the sound back' });
    // Join: chunks crossfaded over their shared frames, the clip's own sound (if any) put back.
    const joined = file('realistic.mp4');
    await run(
      ffmpeg,
      [
        '-y',
        ...rendered.flatMap(part => ['-i', part]),
        '-i',
        source,
        '-filter_complex',
        clipRealismJoinFilter(chunks, fps),
        '-map',
        '[out]',
        '-map',
        `${rendered.length}:a?`,
        '-c:v',
        'libx264',
        '-crf',
        '14',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-shortest',
        joined,
      ],
      signal
    );
    const uploaded = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ joined)),
      filename: 'castcut-realistic.mp4',
      mimeType: 'video/mp4',
    });
    const view = new URLSearchParams({
      filename: uploaded.name,
      subfolder: uploaded.subfolder ?? '',
      type: 'input',
    });
    return `/api/comfyui/view?${view.toString()}`;
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
