/** Where each talking clip's speech starts and ends (line-fit.ts speechBursts), for Cut. */

import 'server-only';

import { spawn } from 'node:child_process';
import { speechBursts } from './line-fit';
import { fetchFilmShotBytes } from '../video/shot-fetch';
import { resolveFfmpegBinary } from '../video/server-encode';

const RATE = 16000;

function monoFromBytes(ffmpeg: string, bytes: Uint8Array): Promise<Float32Array | null> {
  return new Promise(resolve => {
    const child = spawn(
      ffmpeg,
      ['-v', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'],
      { stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const chunks: Buffer[] = [];
    child.stdout.on('data', chunk => chunks.push(chunk as Buffer));
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const pcm = Buffer.concat(chunks);
      if (pcm.length < RATE / 10) return resolve(null);
      const ints = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
      resolve(Float32Array.from(ints, value => value / 32768));
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(Buffer.from(bytes));
  });
}

export type SpeechSpan = { startSec: number; endSec: number };

export async function speechSpans(
  shots: ReadonlyArray<{ key: string; url: string; entryId?: string }>,
  context: { userId?: string | null; requestOrigin?: string }
): Promise<Record<string, SpeechSpan | null>> {
  const ffmpeg = await resolveFfmpegBinary();
  const out: Record<string, SpeechSpan | null> = {};
  if (!ffmpeg) return out;
  for (const shot of shots) {
    const fetched = await fetchFilmShotBytes({
      url: shot.url,
      entryId: shot.entryId,
      userId: context.userId,
      requestOrigin: context.requestOrigin,
    }).catch(() => null);
    const samples = fetched?.buffer.byteLength
      ? await monoFromBytes(ffmpeg, new Uint8Array(fetched.buffer))
      : null;
    const bursts = samples ? speechBursts(samples, RATE) : [];
    out[shot.key] = bursts.length
      ? { startSec: bursts[0]!.startSec, endSec: bursts[bursts.length - 1]!.endSec }
      : null;
  }
  return out;
}
