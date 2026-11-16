/** A clip's first and last frames to the vision model: did it hold its shot (drift.ts)? */

import 'server-only';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { visionCompletion } from '../llm/client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from '../llm/request-options';
import { resolveVisionModel } from '../vision/model-auto';
import { fetchFilmShotBytes } from '../video/shot-fetch';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';
import { CLIP_DRIFT_PROMPT, CLIP_DRIFT_SYSTEM, parseClipDrift, type ClipDrift } from './drift';

function frameJpeg(ffmpeg: string, file: string, fromEnd: boolean): Promise<Buffer> {
  return new Promise(resolve => {
    const child = spawn(
      ffmpeg,
      [
        '-v',
        'error',
        ...(fromEnd ? ['-sseof', '-0.2'] : ['-ss', '0']),
        '-i',
        file,
        '-frames:v',
        '1',
        '-vf',
        'scale=512:-1',
        '-f',
        'image2',
        '-c:v',
        'mjpeg',
        '-',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const chunks: Buffer[] = [];
    child.stdout.on('data', chunk => chunks.push(chunk as Buffer));
    child.on('error', () => resolve(Buffer.alloc(0)));
    child.on('close', () => resolve(Buffer.concat(chunks)));
  });
}

/** Null when it can't be looked at (no vision model, no ffmpeg, the clip unreachable). */
export async function clipDrift(input: {
  url: string;
  entryId?: string;
  llm?: LlmRequestOptions;
  userId?: string | null;
  requestOrigin?: string;
}): Promise<ClipDrift | null> {
  if (!resolveRequestLlmEnabled(input.llm)) return null;
  const ffmpeg = await resolveFfmpegBinary();
  const model = await resolveVisionModel(input.llm).catch(() => null);
  if (!ffmpeg || !model) return null;
  const fetched = await fetchFilmShotBytes({
    url: input.url,
    entryId: input.entryId,
    userId: input.userId,
    requestOrigin: input.requestOrigin,
  }).catch(() => null);
  if (!fetched?.buffer.byteLength) return null;
  const file = path.join(filmTempOsDir(), `castcut-drift-${randomUUID()}.mp4`);
  try {
    await fs.writeFile(/* turbopackIgnore: true */ file, fetched.buffer);
    const [first, last] = await Promise.all([
      frameJpeg(ffmpeg, file, false),
      frameJpeg(ffmpeg, file, true),
    ]);
    if (!first.length || !last.length) return null;
    const dataUrl = (bytes: Buffer) => `data:image/jpeg;base64,${bytes.toString('base64')}`;
    const reply = await visionCompletion({
      systemPrompt: CLIP_DRIFT_SYSTEM,
      textPrompt: CLIP_DRIFT_PROMPT,
      imageDataUrl: dataUrl(first),
      extraImageDataUrls: [dataUrl(last)],
      maxTokens: 400,
      temperature: 0,
      model,
      endpoint: resolveRequestLlmEndpoint(input.llm),
    }).catch(() => null);
    return parseClipDrift(reply);
  } finally {
    await fs.rm(/* turbopackIgnore: true */ file, { force: true }).catch(() => undefined);
  }
}
