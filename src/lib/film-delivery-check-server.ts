/**
 * Server half of the delivery check (film-delivery-check.ts): fetch each shot the way the
 * encode will, then sample its frames for black and read a talking clip's sound level.
 */

import 'server-only';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  blackStats,
  parseMaxVolumeDb,
  SHOT_SOURCE_UNREACHABLE as UNREACHABLE,
  type ShotProbe,
} from './film-delivery-check';
import { resolvePromptDataDir } from './prompt-data-paths';
import { fetchFilmShotBytes } from './video-shot-fetch';
import { resolveFfmpegBinary } from './video-server-encode';

export type DeliveryCheckShot = {
  key: string;
  url: string;
  kind: 'still' | 'clip';
  entryId?: string;
  /** A talking clip: read its sound level. */
  expectSpeech?: boolean;
};

/** Frames per second sampled from a clip, and the gray thumbnail size. */
const SAMPLE_FPS = 2;
const THUMB = 32;
/** At most this many seconds of a clip are sampled. */
const MAX_SAMPLE_SEC = 90;
const CONCURRENCY = 3;
const PROBE_TIMEOUT_MS = 30_000;

function run(
  bin: string,
  args: string[]
): Promise<{ code: number | null; stdout: Buffer; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), PROBE_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', chunk => {
      if (stderr.length < 64_000) stderr += String(chunk);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: Buffer.alloc(0), stderr });
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr });
    });
  });
}

function durationFrom(stderr: string): number | undefined {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const sec = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return sec > 0 ? sec : undefined;
}

async function probeFile(
  ffmpeg: string,
  file: string,
  shot: DeliveryCheckShot
): Promise<Omit<ShotProbe, 'key'>> {
  const out: Omit<ShotProbe, 'key'> = {};
  const frames = await run(ffmpeg, [
    '-hide_banner',
    '-v',
    'info',
    ...(shot.kind === 'clip' ? ['-t', String(MAX_SAMPLE_SEC)] : []),
    '-i',
    file,
    '-map',
    '0:v:0',
    '-vf',
    `${shot.kind === 'clip' ? `fps=${SAMPLE_FPS},` : ''}scale=${THUMB}:${THUMB},format=gray`,
    ...(shot.kind === 'still' ? ['-frames:v', '1'] : []),
    '-f',
    'rawvideo',
    '-',
  ]);
  const stats = blackStats(new Uint8Array(frames.stdout), THUMB * THUMB, SAMPLE_FPS);
  if (stats) {
    out.blackShare = stats.blackShare;
    if (shot.kind === 'clip') out.blackRunSec = stats.blackRunSec;
  }
  const duration = durationFrom(frames.stderr);
  if (duration && shot.kind === 'clip') out.durationSec = duration;
  if (shot.kind === 'clip' && shot.expectSpeech) {
    const sound = await run(ffmpeg, [
      '-hide_banner',
      '-i',
      file,
      '-map',
      '0:a:0',
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ]);
    if (/matches no streams|does not contain any stream/i.test(sound.stderr)) {
      out.hasAudio = false;
    } else {
      const max = parseMaxVolumeDb(sound.stderr);
      if (max != null) {
        out.hasAudio = true;
        out.maxVolumeDb = Number.isFinite(max) ? max : -120;
      }
    }
  }
  return out;
}

/**
 * Probe the shots (three at a time). A shot that can't be fetched comes back `missing`; one
 * ffmpeg can't read comes back with nothing measured (unknown, not a problem).
 */
export async function probeDeliveryShots(
  shots: DeliveryCheckShot[],
  context: { requestOrigin?: string; userId?: string | null }
): Promise<{ ffmpeg: boolean; results: ShotProbe[] }> {
  const ffmpeg = await resolveFfmpegBinary();
  const workDir = path.join(
    /* turbopackIgnore: true */ resolvePromptDataDir(),
    'film-work',
    `check-${randomUUID()}`
  );
  await fs.mkdir(/* turbopackIgnore: true */ workDir, { recursive: true });
  const results: ShotProbe[] = new Array(shots.length);
  let next = 0;
  const worker = async () => {
    while (next < shots.length) {
      const index = next;
      next += 1;
      const shot = shots[index]!;
      let fetched: Awaited<ReturnType<typeof fetchFilmShotBytes>>;
      try {
        fetched = await fetchFilmShotBytes({
          url: shot.url,
          entryId: shot.entryId,
          userId: context.userId,
          requestOrigin: context.requestOrigin,
        });
        if (!fetched.buffer.byteLength) throw new Error('empty file');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'could not fetch';
        results[index] = {
          key: shot.key,
          missing: /404|not found/i.test(message)
            ? 'not found'
            : /fetch failed|ECONNREFUSED|ETIMEDOUT|timeout/i.test(message)
              ? UNREACHABLE
              : message.slice(0, 80),
        };
        continue;
      }
      if (!ffmpeg) {
        results[index] = { key: shot.key };
        continue;
      }
      const file = path.join(/* turbopackIgnore: true */ workDir, `shot-${index}`);
      try {
        await fs.writeFile(/* turbopackIgnore: true */ file, fetched.buffer);
        results[index] = { key: shot.key, ...(await probeFile(ffmpeg, file, shot)) };
      } catch {
        results[index] = { key: shot.key };
      } finally {
        await fs.rm(/* turbopackIgnore: true */ file, { force: true }).catch(() => undefined);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, shots.length) }, worker));
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ workDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
  return { ffmpeg: Boolean(ffmpeg), results };
}
