/**
 * Server: a read line made to sound said in a scene, not read for an audiobook (2026-11-07,
 * chosen by ear over the dry read): the silence either side trimmed, a touch quicker, less of a
 * microphone's close bass, and a light room around it. Narration over a shot stays as it is.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';

/** The ffmpeg filter for a scene line (24 kHz mono in, 24 kHz mono out). */
export const SCENE_LINE_FILTER = [
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05',
  'areverse',
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08',
  'areverse',
  'atempo=1.07',
  'highpass=f=110',
  'aecho=0.85:0.5:23|41:0.18|0.10',
].join(',');

const SAMPLE_RATE = 24000;

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))
    );
  });
}

/** Seconds of a 16-bit PCM WAV, from its data chunk; null when it isn't one. */
export function wavSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let byteRate = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ') byteRate = view.getUint32(at + 16, true);
    if (id === 'data') return byteRate > 0 ? size / byteRate : null;
    at += 8 + size + (size % 2);
  }
  return null;
}

/** The line as WAV bytes said in a scene, and how long it now lasts. */
export async function sceneLineSound(
  bytes: Uint8Array
): Promise<{ bytes: Uint8Array; seconds: number | null }> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) return { bytes, seconds: wavSeconds(bytes) };
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `line-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const source = path.join(/* turbopackIgnore: true */ dir, 'in.audio');
    const out = path.join(/* turbopackIgnore: true */ dir, 'out.wav');
    await fs.writeFile(/* turbopackIgnore: true */ source, bytes);
    await run(ffmpeg, [
      '-v',
      'error',
      '-i',
      source,
      '-af',
      SCENE_LINE_FILTER,
      '-ac',
      '1',
      '-ar',
      String(SAMPLE_RATE),
      '-c:a',
      'pcm_s16le',
      '-y',
      out,
    ]);
    const next = new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ out));
    return { bytes: next, seconds: wavSeconds(next) };
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
