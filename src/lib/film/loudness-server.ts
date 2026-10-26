/**
 * Measure a film's loudness (M4 F4): fetch it the way the encode fetches shots, run ffmpeg's
 * ebur128 (true peak on) over its sound, and read the summary (loudness.ts).
 */

import 'server-only';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseEbur128Summary, type FilmLoudness } from './loudness';
import { fetchFilmShotBytes } from '../video/shot-fetch';
import { resolveFfmpegBinary } from '../video/server-encode';

const MEASURE_TIMEOUT_MS = 180_000;

function runFfmpeg(bin: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), MEASURE_TIMEOUT_MS);
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
      // Only the end matters (the summary); keep the tail.
      if (stderr.length > 256_000) stderr = stderr.slice(-128_000);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, stderr });
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

export type LoudnessResult =
  { ok: true; loudness: FilmLoudness } | { ok: false; error: string; status: number };

export async function measureFilmLoudness(input: {
  url: string;
  entryId?: string;
  userId?: string | null;
  requestOrigin?: string;
}): Promise<LoudnessResult> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) return { ok: false, error: 'ffmpeg is not available on the server.', status: 503 };
  let fetched;
  try {
    fetched = await fetchFilmShotBytes(input);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not read the film.',
      status: 404,
    };
  }
  const file = path.join(os.tmpdir(), `castcut-loudness-${randomUUID()}`);
  try {
    await fs.writeFile(file, fetched.buffer);
    const run = await runFfmpeg(ffmpeg, [
      '-hide_banner',
      '-nostats',
      '-i',
      file,
      '-map',
      '0:a:0?',
      '-filter:a',
      'ebur128=peak=true',
      '-f',
      'null',
      '-',
    ]);
    const loudness = parseEbur128Summary(run.stderr);
    if (!loudness) {
      return /does not contain any stream|matches no streams|Output file is empty/i.test(
        run.stderr
      ) || !/Audio:/.test(run.stderr)
        ? { ok: false, error: 'The film has no sound to measure.', status: 422 }
        : { ok: false, error: 'ffmpeg did not report a loudness for this film.', status: 500 };
    }
    return { ok: true, loudness };
  } finally {
    await fs.rm(file, { force: true }).catch(() => undefined);
  }
}
