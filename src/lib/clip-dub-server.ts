/**
 * Server: "Add voice" on a finished clip (ltx25-renderer buildLtx25DubGraph). The clip (WAN's
 * animated WebP or an MP4) becomes a 24 fps MP4 of 8k+1 frames, goes to ComfyUI's input, and
 * LTX-2.5 writes only its soundtrack. Returns the new MP4's ComfyUI view URL.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from './comfy-input-upload-server';
import {
  comfyBaseUrl,
  runComfyUtilityGraph,
  type ComfyImageRef,
} from './comfy-utility-graph-server';
import {
  buildLtx25DubGraph,
  dubPrompt,
  LTX25_DUB_SAVE_NODE,
  LTX25_FPS,
  ltx25DubFrames,
} from './ltx25-renderer';
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

/** Long side of the frozen encode: the audio pass needs to see the motion, not every pixel. */
const DUB_LONG_SIDE = 544;

/** Encode size from the clip's size: long side DUB_LONG_SIDE, both sides multiples of 32. */
export function dubEncodeSize(width: number, height: number): { width: number; height: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = DUB_LONG_SIDE / Math.max(w, h);
  const snap = (value: number) => Math.max(32, Math.round((value * scale) / 32) * 32);
  return { width: snap(w), height: snap(h) };
}

export async function dubClipWithVoice(input: {
  clipUrl: string;
  scene: string;
  line?: string;
  heat?: 'clean' | 'flirty' | 'sensual' | 'explicit';
  lead?: 'woman' | 'man';
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
  seed?: number;
}): Promise<string> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const { fetchFilmShotBytes } = await import('./video-shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.clipUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `dub-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const source = path.join(/* turbopackIgnore: true */ dir, 'clip.bin');
    const at24 = path.join(/* turbopackIgnore: true */ dir, 'at24.mp4');
    const cut = path.join(/* turbopackIgnore: true */ dir, 'dub-input.mp4');
    await fs.writeFile(/* turbopackIgnore: true */ source, fetched.buffer);
    const encode = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an'];
    // Pass 1: 24 fps, and count what came out; pass 2: cut to an 8k+1 frame count.
    const log = await run(ffmpeg, [
      '-y',
      '-i',
      source,
      '-vf',
      `fps=${LTX25_FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      ...encode,
      at24,
    ]);
    const probe = await run(ffmpeg, ['-i', at24, '-map', '0:v:0', '-f', 'null', '-']).catch(error =>
      String(error instanceof Error ? error.message : error)
    );
    const frames = Number([...probe.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1] ?? 0);
    const size = (log + probe).match(/,\s(\d{2,5})x(\d{2,5})[\s,[]/);
    if (!frames || !size) throw new Error('Could not read that clip.');
    const dubFrames = ltx25DubFrames(frames);
    await run(ffmpeg, ['-y', '-i', at24, '-frames:v', String(dubFrames), ...encode, cut]);
    const baseUrl = comfyBaseUrl(input.comfyUrl);
    const uploaded = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ cut)),
      filename: 'castcut-dub.mp4',
      mimeType: 'video/mp4',
    });
    const run2 = await runComfyUtilityGraph<ComfyImageRef>({
      baseUrl,
      label: 'add-voice',
      timeoutMs: 240_000,
      prompt: buildLtx25DubGraph({
        video: uploaded.name,
        prompt: dubPrompt(input),
        frames: dubFrames,
        ...dubEncodeSize(Number(size[1]), Number(size[2])),
        seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
        prefix: 'Castcut-voiced',
      }),
      read: entry => {
        const out = (
          entry.outputs?.[LTX25_DUB_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
        )?.images?.[0];
        return out?.filename ? out : undefined;
      },
    });
    const clip = run2.result;
    if (!clip) throw new Error('Add voice finished without a clip — check the ComfyUI log.');
    const params = new URLSearchParams({
      filename: clip.filename,
      subfolder: clip.subfolder ?? '',
      type: clip.type || 'output',
    });
    return `/api/comfyui/view?${params.toString()}`;
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
