/**
 * The voice engine's reading of a talking clip's line, fitted to where the clip says it
 * (line-fit.ts) and given the scene's sound, as a ComfyUI input WAV for Cut to lay over the clip.
 */

import 'server-only';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import { comfyBaseUrl } from '../comfyui/comfy-utility-graph-server';
import { fetchFilmShotBytes } from '../video/shot-fetch';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';
import { lineFitPlan, speechSpan } from './line-fit';
import { SCENE_LINE_FILTER } from './scene-line-sound';

const RATE = 24000;

function run(bin: string, args: string[], out?: 'pcm'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', out ? 'pipe' : 'ignore', 'pipe'] });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout?.on('data', chunk => chunks.push(chunk as Buffer));
    child.stderr?.on('data', chunk => (stderr += String(chunk)));
    child.on('error', reject);
    child.on('close', code =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(stderr.slice(-300)))
    );
  });
}

async function monoSamples(ffmpeg: string, file: string): Promise<Float32Array> {
  const pcm = await run(
    ffmpeg,
    ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'],
    'pcm'
  );
  const ints = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  return Float32Array.from(ints, value => value / 32768);
}

export async function fitLineToClip(input: {
  clipUrl: string;
  entryId?: string;
  /** The reading: a ComfyUI input file (`subfolder/name`). */
  readFile: string;
  comfyUrl?: string;
  userId?: string | null;
  requestOrigin?: string;
}): Promise<{ url: string } | null> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) return null;
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const slash = input.readFile.lastIndexOf('/');
  const view = new URLSearchParams({
    filename: input.readFile.slice(slash + 1),
    subfolder: slash >= 0 ? input.readFile.slice(0, slash) : '',
    type: 'input',
  });
  const [clip, read] = await Promise.all([
    fetchFilmShotBytes({
      url: input.clipUrl,
      entryId: input.entryId,
      userId: input.userId,
      requestOrigin: input.requestOrigin,
    }).catch(() => null),
    fetch(`${baseUrl}/view?${view.toString()}`)
      .then(async response => (response.ok ? Buffer.from(await response.arrayBuffer()) : null))
      .catch(() => null),
  ]);
  if (!clip?.buffer.byteLength || !read?.byteLength) return null;
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `line-fit-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const clipFile = path.join(/* turbopackIgnore: true */ dir, 'clip.mp4');
    const readFile = path.join(/* turbopackIgnore: true */ dir, 'read.audio');
    const shaped = path.join(/* turbopackIgnore: true */ dir, 'shaped.wav');
    const out = path.join(/* turbopackIgnore: true */ dir, 'out.wav');
    await fs.writeFile(/* turbopackIgnore: true */ clipFile, clip.buffer);
    await fs.writeFile(/* turbopackIgnore: true */ readFile, read);
    // The reading said in the scene (its silence trimmed, the scene's sound), then measured.
    await run(ffmpeg, [
      '-v',
      'error',
      '-i',
      readFile,
      '-af',
      SCENE_LINE_FILTER,
      '-ac',
      '1',
      '-ar',
      String(RATE),
      '-y',
      shaped,
    ]);
    const readSec = (await monoSamples(ffmpeg, shaped)).length / RATE;
    const plan = lineFitPlan(speechSpan(await monoSamples(ffmpeg, clipFile), RATE), readSec);
    if (!plan) return null;
    const delayMs = Math.round(plan.delaySec * 1000);
    await run(ffmpeg, [
      '-v',
      'error',
      '-i',
      shaped,
      '-af',
      `atempo=${plan.tempo},adelay=${delayMs}:all=1`,
      '-ac',
      '1',
      '-ar',
      String(RATE),
      '-c:a',
      'pcm_s16le',
      '-y',
      out,
    ]);
    const uploaded = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ out)),
      filename: 'castcut-line-fit.wav',
      mimeType: 'audio/wav',
      keepCopy: true,
    });
    const params = new URLSearchParams({
      filename: uploaded.name,
      subfolder: uploaded.subfolder,
      type: uploaded.type || 'input',
    });
    return { url: `/api/comfyui/view?${params.toString()}` };
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
