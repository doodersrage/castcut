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

/** The middle look: a clip pinned to end on its still can drift and snap back (10D). */
const DRIFT_MIDDLE_SEC = 2.2;

function frameJpeg(ffmpeg: string, file: string, at: 'first' | 'middle' | 'last'): Promise<Buffer> {
  return new Promise(resolve => {
    const child = spawn(
      ffmpeg,
      [
        '-v',
        'error',
        ...(at === 'last'
          ? ['-sseof', '-0.2']
          : ['-ss', at === 'middle' ? String(DRIFT_MIDDLE_SEC) : '0']),
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
    const [first, middle, last] = await Promise.all([
      frameJpeg(ffmpeg, file, 'first'),
      frameJpeg(ffmpeg, file, 'middle'),
      frameJpeg(ffmpeg, file, 'last'),
    ]);
    if (!first.length || !last.length) return null;
    const dataUrl = (bytes: Buffer) => `data:image/jpeg;base64,${bytes.toString('base64')}`;
    const ask = (later: Buffer) =>
      visionCompletion({
        systemPrompt: CLIP_DRIFT_SYSTEM,
        textPrompt: CLIP_DRIFT_PROMPT,
        imageDataUrl: dataUrl(first),
        extraImageDataUrls: [dataUrl(later)],
        maxTokens: 400,
        temperature: 0,
        model,
        endpoint: resolveRequestLlmEndpoint(input.llm),
      })
        .then(parseClipDrift)
        .catch(() => null);
    // The end against the start, then the middle (a zoom in that snapped back to the still).
    const atEnd = await ask(last);
    if (atEnd?.drifted || !middle.length) return atEnd;
    const atMiddle = await ask(middle);
    if (atMiddle?.drifted) return atMiddle;
    return atEnd ?? atMiddle;
  } finally {
    await fs.rm(/* turbopackIgnore: true */ file, { force: true }).catch(() => undefined);
  }
}
