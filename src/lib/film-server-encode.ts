/**
 * Server-side film assemble via system ffmpeg (H.264 + AAC MP4).
 * Browser MediaRecorder remains the offline fallback.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { resolvePromptDataDir } from './prompt-data-paths';
import {
  clampStillHoldSec,
  DEFAULT_STILL_HOLD_SEC,
  type FilmPlaylistShot,
  type FilmShotKind,
} from './character-film';

import {
  buildFilmScaleFilter,
  FILM_PRESET_SIZE,
  normalizeFilmResolution,
  type FilmResolutionPreset,
} from './film-resolution';

export {
  FILM_RESOLUTION_PRESETS,
  normalizeFilmResolution,
  type FilmResolutionPreset,
} from './film-resolution';

export type FilmServerEncodeOptions = {
  resolution?: FilmResolutionPreset;
  /** Crossfade seconds between shots (0 = hard cut). */
  crossfadeSec?: number;
  /** Optional audio bed URL (http/https, private allowed for same-origin). */
  audioBedUrl?: string;
  userId?: string | null;
  onProgress?: (ratio: number, label: string) => void;
};

export type FilmServerEncodeResult = {
  buffer: Buffer;
  mimeType: 'video/mp4';
  extension: 'mp4';
  width: number;
  height: number;
};

let ffmpegCached: string | null | undefined;

export async function resolveFfmpegBinary(): Promise<string | null> {
  if (ffmpegCached !== undefined) {
    return ffmpegCached;
  }
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath) {
    try {
      await fs.access(envPath);
      ffmpegCached = envPath;
      return ffmpegCached;
    } catch {
      ffmpegCached = null;
      return null;
    }
  }
  try {
    await runCapture('ffmpeg', ['-version']);
    ffmpegCached = 'ffmpeg';
    return ffmpegCached;
  } catch {
    ffmpegCached = null;
    return null;
  }
}

export async function isServerFilmEncodeAvailable(): Promise<boolean> {
  return Boolean(await resolveFfmpegBinary());
}

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function normalizeFilmCrossfadeSec(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.min(2, Math.round(numeric * 10) / 10);
}

function filmWorkRoot(): string {
  return path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), 'film-work');
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
}

async function runCapture(
  bin: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', error => reject(error));
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || `Command failed (${code}): ${bin} ${args.join(' ')}`));
    });
  });
}

async function fetchShotBytes(
  url: string,
  requestOrigin?: string,
  entryId?: string,
  userId?: string | null
): Promise<{ buffer: Buffer; contentType?: string; filenameHint?: string }> {
  const { fetchFilmShotBytes } = await import('./film-shot-fetch');
  return fetchFilmShotBytes({ url, requestOrigin, entryId, userId });
}

function extForShot(kind: FilmShotKind, contentTypeHint?: string, url?: string): string {
  const fromUrl = url?.match(/\.(mp4|webm|mov|mkv|gif|webp|png|jpe?g|avif)(\?|#|$)/i)?.[1];
  if (fromUrl) {
    return fromUrl.toLowerCase() === 'jpeg' ? 'jpg' : fromUrl.toLowerCase();
  }
  const type = (contentTypeHint ?? '').toLowerCase();
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('webm')) return 'webm';
  if (type.includes('gif')) return 'gif';
  if (type.includes('webp')) return 'webp';
  if (type.includes('png')) return 'png';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  return kind === 'clip' ? 'mp4' : 'png';
}

function buildFilterComplex(input: {
  shotCount: number;
  kinds: FilmShotKind[];
  holdSecs: number[];
  width: number;
  height: number;
  crossfadeSec: number;
  hasAudioBed: boolean;
}): { filter: string; videoLabel: string; audioLabel: string | null; durationSec: number } {
  const { shotCount, kinds, holdSecs, width, height, crossfadeSec, hasAudioBed } = input;
  const scalePad = buildFilmScaleFilter(width, height);

  const parts: string[] = [];
  const labels: string[] = [];
  let total = 0;

  for (let i = 0; i < shotCount; i += 1) {
    const label = `v${i}`;
    labels.push(`[${label}]`);
    if (kinds[i] === 'still') {
      const hold = holdSecs[i] ?? DEFAULT_STILL_HOLD_SEC;
      total += hold;
      parts.push(`[${i}:v]${scalePad},trim=duration=${hold},setpts=PTS-STARTPTS[${label}]`);
    } else {
      // Clips: use full stream; duration unknown until probe — estimate later via concat
      parts.push(`[${i}:v]${scalePad},setpts=PTS-STARTPTS[${label}]`);
      total += holdSecs[i] && holdSecs[i]! > 0 ? holdSecs[i]! : 4;
    }
  }

  let videoLabel: string;
  if (shotCount === 1) {
    videoLabel = 'v0';
    // already labeled
  } else if (crossfadeSec > 0 && shotCount >= 2) {
    // xfade chain
    let prev = 'v0';
    let offset = Math.max(0.1, (holdSecs[0] ?? DEFAULT_STILL_HOLD_SEC) - crossfadeSec);
    for (let i = 1; i < shotCount; i += 1) {
      const out = i === shotCount - 1 ? 'vout' : `xf${i}`;
      parts.push(
        `[${prev}][v${i}]xfade=transition=fade:duration=${crossfadeSec}:offset=${Math.max(0, offset)}[${out}]`
      );
      const nextHold = holdSecs[i] ?? (kinds[i] === 'still' ? DEFAULT_STILL_HOLD_SEC : 4);
      offset += Math.max(0.1, nextHold - crossfadeSec);
      prev = out;
    }
    videoLabel = 'vout';
    total = Math.max(total - crossfadeSec * (shotCount - 1), 1);
  } else {
    parts.push(`${labels.join('')}concat=n=${shotCount}:v=1:a=0[vout]`);
    videoLabel = 'vout';
  }

  let audioLabel: string | null = null;
  if (hasAudioBed) {
    const audioIndex = shotCount;
    parts.push(
      `[${audioIndex}:a]atrim=0:${Math.max(1, total)},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0.1, total - 1)}:d=1[aout]`
    );
    audioLabel = 'aout';
  }

  return { filter: parts.join(';'), videoLabel, audioLabel, durationSec: total };
}

export async function encodeFilmPlaylistServer(
  shots: FilmPlaylistShot[],
  options: FilmServerEncodeOptions = {},
  requestOrigin?: string
): Promise<FilmServerEncodeResult> {
  if (shots.length === 0) {
    throw new Error('Include at least one shot in the cut.');
  }
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) {
    throw new Error('ffmpeg is not available on this server.');
  }

  const resolution = normalizeFilmResolution(options.resolution);
  const { width, height } = FILM_PRESET_SIZE[resolution];
  const crossfadeSec = normalizeFilmCrossfadeSec(options.crossfadeSec);
  const workId = randomUUID();
  const workDir = path.join(/* turbopackIgnore: true */ filmWorkRoot(), workId);
  await ensureDir(workDir);

  try {
    options.onProgress?.(0.05, 'Downloading shots…');
    const localFiles: string[] = [];
    const kinds: FilmShotKind[] = [];
    const holdSecs: number[] = [];

    for (const [index, shot] of shots.entries()) {
      options.onProgress?.(0.05 + (0.35 * index) / shots.length, `Fetching ${shot.title}`);
      const fetched = await fetchShotBytes(shot.url, requestOrigin, shot.entryId, options.userId);
      const ext = extForShot(shot.kind, fetched.contentType, fetched.filenameHint || shot.url);
      const filePath = path.join(/* turbopackIgnore: true */ workDir, `shot-${index}.${ext}`);
      await fs.writeFile(/* turbopackIgnore: true */ filePath, fetched.buffer);
      localFiles.push(filePath);
      kinds.push(shot.kind);
      holdSecs.push(
        shot.kind === 'still'
          ? clampStillHoldSec(shot.holdSec, DEFAULT_STILL_HOLD_SEC)
          : typeof shot.holdSec === 'number' && shot.holdSec > 0
            ? shot.holdSec
            : 0
      );
    }

    let audioPath: string | null = null;
    const audioBed = options.audioBedUrl?.trim();
    if (audioBed) {
      options.onProgress?.(0.42, 'Fetching audio bed…');
      const audioFetched = await fetchShotBytes(audioBed, requestOrigin, undefined, options.userId);
      audioPath = path.join(/* turbopackIgnore: true */ workDir, 'audio-bed.audio');
      await fs.writeFile(/* turbopackIgnore: true */ audioPath, audioFetched.buffer);
    }

    const { filter, videoLabel, audioLabel } = buildFilterComplex({
      shotCount: localFiles.length,
      kinds,
      holdSecs,
      width: even(width),
      height: even(height),
      crossfadeSec,
      hasAudioBed: Boolean(audioPath),
    });

    const outputPath = path.join(/* turbopackIgnore: true */ workDir, 'out.mp4');
    const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
    for (let i = 0; i < localFiles.length; i += 1) {
      if (kinds[i] === 'still') {
        args.push(
          '-loop',
          '1',
          '-t',
          String(holdSecs[i] || DEFAULT_STILL_HOLD_SEC),
          '-i',
          localFiles[i]!
        );
      } else {
        args.push('-i', localFiles[i]!);
      }
    }
    if (audioPath) {
      args.push('-i', audioPath);
    }
    args.push('-filter_complex', filter, '-map', `[${videoLabel}]`);
    if (audioLabel) {
      args.push('-map', `[${audioLabel}]`, '-c:a', 'aac', '-b:a', '192k');
    } else {
      args.push('-an');
    }
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath
    );

    options.onProgress?.(0.55, 'Encoding MP4…');
    await runCapture(ffmpeg, args);
    options.onProgress?.(0.95, 'Reading encode…');
    const buffer = await fs.readFile(/* turbopackIgnore: true */ outputPath);
    if (buffer.byteLength === 0) {
      throw new Error('Server encode produced an empty file.');
    }
    options.onProgress?.(1, 'Encode complete');
    return {
      buffer,
      mimeType: 'video/mp4',
      extension: 'mp4',
      width: even(width),
      height: even(height),
    };
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ workDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

/** Stable cache key for identical playlists (optional future use). */
export function filmPlaylistFingerprint(
  shots: FilmPlaylistShot[],
  options: FilmServerEncodeOptions
): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ shots, options }));
  return hash.digest('hex').slice(0, 24);
}

export function filmTempOsDir(): string {
  return path.join(/* turbopackIgnore: true */ os.tmpdir(), 'prompt-studio-film');
}
