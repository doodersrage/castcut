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
  dhashGray,
  parseMaxVolumeDb,
  parseShotText,
  SHOT_TEXT_PROMPT,
  SHOT_SOURCE_UNREACHABLE as UNREACHABLE,
  type ShotProbe,
  clipCutAtSec,
  CUT_SAMPLE_FPS,
  CUT_SAMPLE_H,
  CUT_SAMPLE_W,
} from './delivery-check';
import { resolvePromptDataDir } from '../prompt-data-paths';
import { fetchFilmShotBytes } from '../video-shot-fetch';
import { resolveFfmpegBinary } from '../video-server-encode';
import { freeComfyUiMemoryServer } from '../comfyui-free-server';
import { visionCompletion } from '../llm-client';
import { resolveRequestLlmEndpoint, type LlmRequestOptions } from '../llm-request-options';
import { resolveVisionModel } from '../vision-model-auto';

export type DeliveryCheckShot = {
  key: string;
  url: string;
  kind: 'still' | 'clip';
  entryId?: string;
  /** A talking clip: read its sound level. */
  expectSpeech?: boolean;
  /** Ask the vision model whether writing in the frame is garbled. */
  readText?: boolean;
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
  shot: DeliveryCheckShot,
  text: TextReader | null = null
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
  const gray = new Uint8Array(frames.stdout);
  const stats = blackStats(gray, THUMB * THUMB, SAMPLE_FPS);
  const frameCount = Math.floor(gray.length / (THUMB * THUMB));
  if (frameCount > 0) {
    const mid = Math.floor(frameCount / 2) * THUMB * THUMB;
    out.dhash = dhashGray(gray.subarray(mid, mid + THUMB * THUMB), THUMB);
  }
  if (stats) {
    out.blackShare = stats.blackShare;
    if (shot.kind === 'clip') out.blackRunSec = stats.blackRunSec;
  }
  const duration = durationFrom(frames.stderr);
  if (duration && shot.kind === 'clip') out.durationSec = duration;
  if (shot.kind === 'clip') {
    // A hard cut inside the clip (a model "cutting" to a close-up): frames at the cut pass's size.
    const fine = await run(ffmpeg, [
      '-hide_banner',
      '-v',
      'error',
      '-t',
      String(MAX_SAMPLE_SEC),
      '-i',
      file,
      '-map',
      '0:v:0',
      '-vf',
      `fps=${CUT_SAMPLE_FPS},scale=${CUT_SAMPLE_W}:${CUT_SAMPLE_H},format=gray`,
      '-f',
      'rawvideo',
      '-',
    ]);
    const cut = clipCutAtSec(new Uint8Array(fine.stdout));
    if (cut != null) out.cutAtSec = Math.round(cut * 10) / 10;
  }
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
  if (shot.readText && text) {
    const at = shot.kind === 'clip' && duration ? (duration / 2).toFixed(2) : '0';
    const jpeg = await run(ffmpeg, [
      '-hide_banner',
      '-v',
      'error',
      '-ss',
      at,
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      "scale='min(1280,iw)':-2",
      '-f',
      'image2',
      '-vcodec',
      'mjpeg',
      '-',
    ]);
    if (jpeg.stdout.byteLength) {
      const reading = await text(`data:image/jpeg;base64,${jpeg.stdout.toString('base64')}`);
      if (reading) out.text = reading;
    }
  }
  return out;
}

type TextReader = (imageDataUrl: string) => Promise<ShotProbe['text'] | null>;

/**
 * One vision read per shot for garbled writing (a sign, a label). The vision model often can't
 * load while ComfyUI keeps its models on the GPU; then ComfyUI is asked once to free memory
 * (between jobs, never interrupting one) and the read is tried again. Null: no reader.
 */
async function shotTextReader(llm: LlmRequestOptions | undefined): Promise<TextReader | null> {
  const model = await resolveVisionModel(llm).catch(() => null);
  if (!model) return null;
  let freed = false;
  return async imageDataUrl => {
    const ask = () =>
      visionCompletion({
        systemPrompt: '',
        textPrompt: SHOT_TEXT_PROMPT,
        imageDataUrl,
        maxTokens: 200,
        temperature: 0,
        model,
        endpoint: resolveRequestLlmEndpoint(llm),
        usageContext: { route: 'film-check-text' },
      });
    try {
      return parseShotText(await ask());
    } catch (error) {
      if (freed || !/failed to load model/i.test(String(error))) return null;
      freed = true;
      await freeComfyUiMemoryServer();
      await new Promise(resolve => setTimeout(resolve, 4000));
      return parseShotText(await ask().catch(() => null));
    }
  };
}

/**
 * Probe the shots (three at a time). A shot that can't be fetched comes back `missing`; one
 * ffmpeg can't read comes back with nothing measured (unknown, not a problem).
 */
export async function probeDeliveryShots(
  shots: DeliveryCheckShot[],
  context: { requestOrigin?: string; userId?: string | null; llm?: LlmRequestOptions }
): Promise<{ ffmpeg: boolean; results: ShotProbe[] }> {
  const ffmpeg = await resolveFfmpegBinary();
  const text = shots.some(shot => shot.readText) ? await shotTextReader(context.llm) : null;
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
        results[index] = { key: shot.key, ...(await probeFile(ffmpeg, file, shot, text)) };
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
