/**
 * Server: "Copy moves from a video" (motion-transfer.ts). The driving video becomes a 16 fps MP4
 * (Wan's rate; at most MOTION_MAX_FRAMES frames) in ComfyUI's input, the still goes in beside it,
 * and Wan Animate 2 renders the still's person doing those moves. Returns the clip's view URL.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import { comfyBaseUrl, type ComfyImageRef } from '../comfyui/comfy-utility-graph-server';
import {
  freeComfyAndSettle,
  isGpuMemoryError,
  requireComfyModels,
  runHeavyComfyGraph,
} from '../server/heavy-graph-server';
import type { ClipJobContext } from '../clip/clip-jobs-server';
import { readClipStream } from '../clip/finish-server';
import {
  buildMotionTransferGraph,
  MOTION_MAX_FRAMES,
  MOTION_TRANSFER_MODELS,
  MOTION_TRANSFER_SAVE_NODE,
  motionTransferPrompt,
  motionTransferSize,
} from './motion-transfer';
import { seatStill } from './motion-seat-server';
import { filmTempOsDir, resolveFfmpegBinary } from './server-encode';

const MOTION_FPS = 16;
/**
 * A clip continued: the Director films it at 24 fps and Wan Animate renders every frame at that
 * rate (the pose is taken frame by frame), so the join needs no interpolation.
 */
const CONTINUE_FPS = 24;

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
  /** A seat to put into the still first ("a wooden chair"), when she sits down (motion-seat.ts). */
  seat?: string;
  keepSound?: boolean;
  /**
   * Continue this clip instead: its last frame is the still, and the result is the clip with the
   * new moves joined on (continue-server.ts). `stillUrl` is then not fetched.
   */
  continueClip?: string;
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
  /** The background job's signal and progress (clip/clip-jobs-server.ts). */
  job?: ClipJobContext;
  seed?: number;
}): Promise<{ url: string; note?: string }> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const { fetchFilmShotBytes } = await import('./shot-fetch');
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `moves-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    // A continuation starts from the clip's last frame.
    let continued: { source: string } | null = null;
    let still: { buffer: Buffer; contentType?: string };
    if (input.continueClip) {
      const clip = await fetchFilmShotBytes({
        url: input.continueClip,
        requestOrigin: input.requestOrigin,
        userId: input.userId,
      });
      const { clipLastFrame } = await import('../clip/continue-server');
      const last = await clipLastFrame(ffmpeg, clip.buffer, dir);
      continued = { source: last.source };
      still = {
        buffer: await fs.readFile(/* turbopackIgnore: true */ last.png),
        contentType: 'image/png',
      };
    } else {
      still = await fetchFilmShotBytes({
        url: input.stillUrl,
        requestOrigin: input.requestOrigin,
        userId: input.userId,
      });
    }
    const source = path.join(/* turbopackIgnore: true */ dir, 'drive.bin');
    const drive = path.join(/* turbopackIgnore: true */ dir, 'drive.mp4');
    await fs.writeFile(/* turbopackIgnore: true */ source, input.video);
    await run(ffmpeg, [
      '-y',
      '-i',
      source,
      '-vf',
      `fps=${input.continueClip ? CONTINUE_FPS : MOTION_FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
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
    // Wan draws the background from the still: a seat only in the prompt is not drawn.
    let reference: { bytes: Uint8Array; contentType: string } = {
      bytes: new Uint8Array(still.buffer),
      contentType: still.contentType || 'image/png',
    };
    // Why the seat isn't in the picture after all (the clip still runs, on the still as it is).
    let seatSkipped: string | null = null;
    if (input.seat) {
      input.job?.progress({ total: 3, done: 0, note: `Putting ${input.seat} into the picture` });
      // A video model cached from the last clip would sit beside the edit's checkpoint.
      await freeComfyAndSettle(input.comfyUrl);
      const seated = await seatStill({
        baseUrl,
        comfyUrl: input.comfyUrl,
        still: reference.bytes,
        contentType: reference.contentType,
        seat: input.seat,
        signal: input.job?.signal,
        seed: input.seed,
        onRetry: () =>
          input.job?.progress({
            note: `Out of GPU memory — freeing it, putting ${input.seat} in again`,
          }),
      }).catch(error => {
        if (input.job?.signal?.aborted) throw error;
        console.warn('[moves] seat edit failed; using the still as it is:', error);
        const message = error instanceof Error ? error.message : String(error);
        seatSkipped = isGpuMemoryError(message)
          ? 'no GPU memory was free for the seat'
          : 'the seat edit failed';
        return null;
      });
      if (seated) reference = seated;
      else seatSkipped ??= "the seat edit isn't available";
      // The edit's checkpoint would sit beside the 14B video model: let it go first.
      await freeComfyAndSettle(input.comfyUrl);
    }
    await requireComfyModels(baseUrl, 'Copy moves', [
      { folder: 'diffusion_models', file: MOTION_TRANSFER_MODELS.unet },
      { folder: 'text_encoders', file: MOTION_TRANSFER_MODELS.clip },
      { folder: 'clip_vision', file: MOTION_TRANSFER_MODELS.clipVision },
      { folder: 'vae', file: MOTION_TRANSFER_MODELS.vae },
    ]);
    const [video, referenceInput] = await Promise.all([
      uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ drive)),
        filename: 'castcut-moves.mp4',
        mimeType: 'video/mp4',
      }),
      uploadComfyInputContent({
        baseUrl,
        bytes: reference.bytes,
        filename: 'castcut-moves-still.png',
        mimeType: reference.contentType,
      }),
    ]);
    input.job?.progress({
      total: input.seat ? 3 : 2,
      done: input.seat ? 2 : 1,
      note: seatSkipped
        ? `Copying the moves on ComfyUI, on the still as it is (${seatSkipped})`
        : 'Copying the moves on ComfyUI',
    });
    const result = await runHeavyComfyGraph<ComfyImageRef>({
      signal: input.job?.signal,
      baseUrl,
      comfyUrl: input.comfyUrl,
      label: 'copy-moves',
      priority: 'queue',
      onRetry: () =>
        input.job?.progress({ note: 'Out of GPU memory — freeing it and copying the moves again' }),
      timeoutMs: 30 * 60_000,
      prompt: buildMotionTransferGraph({
        reference: referenceInput.name,
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
    let url = `/api/comfyui/view?${new URLSearchParams({
      filename: clip.filename,
      subfolder: clip.subfolder ?? '',
      type: clip.type || 'output',
    }).toString()}`;
    if (continued) {
      input.job?.progress({ note: 'Joining the move onto the clip' });
      const moves = path.join(/* turbopackIgnore: true */ dir, 'moves.mp4');
      const fetched = await fetch(
        `${baseUrl}/view?${new URLSearchParams({
          filename: clip.filename,
          subfolder: clip.subfolder ?? '',
          type: clip.type || 'output',
        }).toString()}`,
        { signal: AbortSignal.timeout(120_000) }
      );
      if (!fetched.ok) throw new Error('Could not fetch the moves clip from ComfyUI.');
      await fs.writeFile(
        /* turbopackIgnore: true */ moves,
        Buffer.from(await fetched.arrayBuffer())
      );
      const { joinContinuation } = await import('../clip/continue-server');
      const out = path.join(/* turbopackIgnore: true */ dir, 'continued.mp4');
      await joinContinuation(ffmpeg, { clip: continued.source, moves, dir, out });
      const kept = await uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ out)),
        filename: 'castcut-continued.mp4',
        mimeType: 'video/mp4',
      });
      url = `/api/comfyui/view?${new URLSearchParams({ filename: kept.name, type: 'input' }).toString()}`;
    }
    return seatSkipped ? { url, note: `Done, without the seat — ${seatSkipped}` } : { url };
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
