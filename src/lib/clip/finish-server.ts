/**
 * Server: "Finish clip" (clip-finish.ts). The clip (WAN's animated WebP or an MP4) becomes an MP4,
 * cut into chunks of a few seconds (clipFinishChunks) that ComfyUI finishes one at a time —
 * SeedVR2 brings each up to CLIP_FINISH_LONG_SIDE and RIFE doubles a 16 fps clip's frames — then
 * joined with the clip's own sound and kept in ComfyUI's input. Returns its view URL.
 */

import { promises as fs } from 'node:fs';
import { writeClipSource } from './clip-source-server';
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
  clipFinishChunkFrames,
  clipFinishChunks,
  clipFinishJoinFilter,
  clipFinishPlan,
} from './finish';
import { parseComfyUiSystemStats } from '../comfyui/system-stats';
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
      // The short reason for people; the whole log rides along for callers that parse it.
      reject(Object.assign(new Error(ffmpegFailureMessage(stderr, code)), { stderr }));
    });
  });
}

/** A failed run's full ffmpeg log (stream lines included), for parsing. */
function ffmpegLog(error: unknown): string {
  const stderr = (error as { stderr?: unknown } | null)?.stderr;
  return typeof stderr === 'string'
    ? stderr
    : String(error instanceof Error ? error.message : error);
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

/** The frames ffmpeg counted decoding a clip (its last "frame=" line), or null. */
export function readFrameCount(log: string): number | null {
  const counts = [...log.matchAll(/frame=\s*(\d+)/g)].map(match => Number(match[1]));
  const last = counts[counts.length - 1];
  return last && last > 0 ? last : null;
}

/** ComfyUI's free RAM in bytes (/system_stats), or undefined when it can't say. */
async function comfyFreeRam(baseUrl: string): Promise<number | undefined> {
  try {
    const response = await fetch(`${baseUrl}/system_stats`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return undefined;
    return parseComfyUiSystemStats(await response.json()).ram?.free || undefined;
  } catch {
    return undefined;
  }
}

export class ClipAlreadyFinishedError extends Error {}

export async function finishClip(input: {
  clipUrl: string;
  entryId?: string;
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
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `finish-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const source = path.join(/* turbopackIgnore: true */ dir, 'clip.bin');
    const mp4 = path.join(/* turbopackIgnore: true */ dir, 'finish-input.mp4');
    await writeClipSource(ffmpeg, fetched.buffer, source);
    // An MP4 ComfyUI's LoadVideo reads: even sides, H.264, the sound (if any) kept.
    const log = await run(
      ffmpeg,
      [
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
      ],
      signal
    );
    const probe = await run(ffmpeg, ['-i', mp4, '-f', 'null', '-'], signal).catch(error =>
      ffmpegLog(error)
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
    const frames = readFrameCount(probe);
    if (!frames) throw new Error('Could not read that clip.');
    const chunkFrames = clipFinishChunkFrames(plan, stream.fps, await comfyFreeRam(baseUrl));
    if (!chunkFrames) {
      throw new Error(
        'ComfyUI has too little free memory to sharpen this clip, even a second at a time — close other apps on that machine, or restart ComfyUI, and try again.'
      );
    }
    const chunks = clipFinishChunks(frames, chunkFrames);
    const verb =
      plan.scale > 1 && plan.multiplier > 1
        ? 'Sharpening and smoothing'
        : plan.scale > 1
          ? 'Sharpening'
          : 'Smoothing the motion of';
    const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
    const finished: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      throwIfCancelled(signal);
      progress({
        total: chunks.length + 1,
        done: index,
        note:
          chunks.length > 1
            ? `${verb} part ${index + 1} of ${chunks.length} on ComfyUI`
            : `${verb} the clip on ComfyUI`,
      });
      // This chunk's frames, silent (the clip's sound goes on when the chunks are joined).
      const part = path.join(/* turbopackIgnore: true */ dir, `part${index}.mp4`);
      await run(
        ffmpeg,
        [
          '-y',
          '-i',
          mp4,
          '-vf',
          `select='between(n\\,${chunk.first}\\,${chunk.last})',setpts=N/FRAME_RATE/TB`,
          '-fps_mode',
          'passthrough',
          '-an',
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
        filename: 'castcut-finish-part.mp4',
        mimeType: 'video/mp4',
      });
      const result = await runHeavyComfyGraph<ComfyImageRef>({
        baseUrl,
        comfyUrl: input.comfyUrl,
        label: 'finish-clip',
        priority: 'queue',
        // A few seconds of clip; the wait includes renders queued ahead of it.
        timeoutMs: 20 * 60_000,
        signal,
        prompt: buildClipFinishGraph({
          video: uploaded.name,
          plan,
          seed,
          prefix: 'Castcut-finish-part',
          audio: false,
        }),
        read: entry => {
          const out = (
            entry.outputs?.[CLIP_FINISH_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
          )?.images?.[0];
          return out?.filename ? out : undefined;
        },
      });
      const out = result.result;
      if (!out) throw new Error('Finishing ended without a clip — check the ComfyUI log.');
      const view = await fetch(
        `${baseUrl}/view?${new URLSearchParams({
          filename: out.filename,
          subfolder: out.subfolder ?? '',
          type: out.type || 'output',
        }).toString()}`,
        { signal: AbortSignal.timeout(120_000) }
      );
      if (!view.ok) throw new Error('Could not fetch a finished part from ComfyUI.');
      const done = path.join(/* turbopackIgnore: true */ dir, `done${index}.mp4`);
      await fs.writeFile(
        /* turbopackIgnore: true */ done,
        new Uint8Array(await view.arrayBuffer())
      );
      finished.push(done);
    }
    throwIfCancelled(signal);
    progress({ total: chunks.length + 1, done: chunks.length, note: 'Joining the parts' });
    const joined = path.join(/* turbopackIgnore: true */ dir, 'finished.mp4');
    await run(
      ffmpeg,
      [
        '-y',
        ...finished.flatMap(file => ['-i', file]),
        '-i',
        mp4,
        '-filter_complex',
        clipFinishJoinFilter(finished.length),
        '-map',
        '[v]',
        '-map',
        `${finished.length}:a?`,
        '-c:v',
        'libx264',
        '-crf',
        '14',
        '-pix_fmt',
        'yuv420p',
        '-r',
        String(plan.fps),
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        joined,
      ],
      signal
    );
    const kept = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ joined)),
      filename: 'castcut-finished.mp4',
      mimeType: 'video/mp4',
    });
    const view = new URLSearchParams({ filename: kept.name, type: 'input' });
    return `/api/comfyui/view?${view.toString()}`;
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
