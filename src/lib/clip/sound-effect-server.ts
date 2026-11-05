/**
 * Server: "Make a sound" (sound-effect.ts). A few seconds of plain grey go to ComfyUI's input,
 * LTX-2.5 writes their sound from the words (buildLtx25DubGraph: the picture frozen, only the
 * sound made), and the sound alone comes back as an M4A in ComfyUI's input. Returns its view URL.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import { comfyBaseUrl, type ComfyImageRef } from '../comfyui/comfy-utility-graph-server';
import { runHeavyComfyGraph } from '../server/heavy-graph-server';
import { buildLtx25DubGraph, LTX25_DUB_SAVE_NODE } from '../video/ltx25-renderer';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';
import { throwIfCancelled, type ClipJobContext } from './clip-jobs-server';
import { ffmpegFailureMessage } from './clip-jobs';
import { soundEffectFrames, soundEffectPrompt } from './sound-effect';

function run(bin: string, args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], signal });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error(ffmpegFailureMessage(stderr, code)))
    );
  });
}

export async function makeSoundEffect(input: {
  words: string;
  seconds: number;
  comfyUrl?: string;
  seed?: number;
  job?: ClipJobContext;
}): Promise<string> {
  const signal = input.job?.signal;
  const progress = input.job?.progress ?? (() => undefined);
  const words = input.words.trim();
  if (!words) throw new Error('Say what the sound is first.');
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const frames = soundEffectFrames(input.seconds);
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `sound-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    progress({ total: 2, done: 0, note: 'Making the sound on ComfyUI' });
    // Plain grey for LTX to hold: the sound follows the words, not a picture.
    const grey = path.join(/* turbopackIgnore: true */ dir, 'grey.mp4');
    await run(
      ffmpeg,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x606060:s=640x384:r=24:d=${(frames / 24).toFixed(3)}`,
        '-frames:v',
        String(frames),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        grey,
      ],
      signal
    );
    const uploaded = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ grey)),
      filename: 'castcut-sound-grey.mp4',
      mimeType: 'video/mp4',
    });
    throwIfCancelled(signal);
    const result = await runHeavyComfyGraph<ComfyImageRef>({
      baseUrl,
      comfyUrl: input.comfyUrl,
      label: 'sound-effect',
      priority: 'front',
      timeoutMs: 15 * 60_000,
      signal,
      prompt: buildLtx25DubGraph({
        video: uploaded.name,
        prompt: soundEffectPrompt(words),
        frames,
        width: 640,
        height: 384,
        seed: input.seed ?? Math.floor(Math.random() * 1_000_000),
        prefix: 'Castcut-sound',
      }) as Record<string, unknown>,
      read: entry => {
        const out = (
          entry.outputs?.[LTX25_DUB_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
        )?.images?.[0];
        return out?.filename ? out : undefined;
      },
    });
    const out = result.result;
    if (!out) throw new Error('No sound came back — check the ComfyUI log.');
    progress({ total: 2, done: 1, note: 'Keeping the sound' });
    const view = await fetch(
      `${baseUrl}/view?${new URLSearchParams({
        filename: out.filename,
        subfolder: out.subfolder ?? '',
        type: out.type || 'output',
      }).toString()}`,
      { signal: AbortSignal.timeout(60_000) }
    );
    if (!view.ok) throw new Error('Could not fetch the sound from ComfyUI.');
    const clip = path.join(/* turbopackIgnore: true */ dir, 'sound.mp4');
    await fs.writeFile(/* turbopackIgnore: true */ clip, new Uint8Array(await view.arrayBuffer()));
    const audio = path.join(/* turbopackIgnore: true */ dir, 'sound.m4a');
    await run(ffmpeg, ['-y', '-i', clip, '-vn', '-c:a', 'aac', '-b:a', '192k', audio], signal);
    const kept = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ audio)),
      filename: 'castcut-sound.m4a',
      mimeType: 'audio/mp4',
    });
    return `/api/comfyui/view?${new URLSearchParams({ filename: kept.name, type: 'input' }).toString()}`;
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
