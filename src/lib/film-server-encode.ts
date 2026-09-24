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
  captionAlphaExpr,
  sanitizeFilmCaption,
  stillMotionZoomExpr,
  STILL_MOTION_FPS,
  TITLE_CARD_SEC,
  type FilmTitleCard,
} from './film-polish';
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
  /** Slow push-in / pull-out on stills instead of a static hold. */
  stillMotion?: boolean;
  /** Short lower-third caption per shot from its title (needs drawtext + a font). */
  captions?: boolean;
  /** Opening title card (needs drawtext + a font). */
  titleCard?: FilmTitleCard | null;
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

/** Per-shot kind in the filter graph; `title` is the generated opening card. */
export type FilmGraphShotKind = FilmShotKind | 'title';

/** Text assets for a shot: caption file, or title / subtitle files for the title card. */
export type FilmGraphText = {
  captionFile?: string | null;
  titleFile?: string | null;
  subtitleFile?: string | null;
};

/**
 * Quote a value for a filtergraph option (paths, expressions). ffmpeg treats single-quoted text
 * literally, so callers never pass values containing a quote (see `usableFilterPath`).
 */
function q(value: string): string {
  return `'${value}'`;
}

/**
 * The ffmpeg filter graph for a cut. Every shot is scaled/padded to the canvas; stills either
 * hold or (with `stillMotion`) slowly zoom; shots optionally get a fading caption; a `title`
 * shot renders centered title + subtitle on black. Shots join with xfade or concat.
 */
export function buildFilterComplex(input: {
  shotCount: number;
  kinds: FilmGraphShotKind[];
  holdSecs: number[];
  width: number;
  height: number;
  crossfadeSec: number;
  hasAudioBed: boolean;
  stillMotion?: boolean;
  text?: FilmGraphText[];
  fontFile?: string | null;
}): { filter: string; videoLabel: string; audioLabel: string | null; durationSec: number } {
  const { shotCount, kinds, holdSecs, width, height, crossfadeSec, hasAudioBed } = input;
  const scalePad = buildFilmScaleFilter(width, height);
  const font = input.fontFile ? q(input.fontFile) : null;
  const captionSize = Math.round(Math.min(width, height) * 0.045);
  const margin = Math.round(Math.min(width, height) * 0.06);

  const parts: string[] = [];
  const labels: string[] = [];
  let total = 0;

  for (let i = 0; i < shotCount; i += 1) {
    const label = `v${i}`;
    labels.push(`[${label}]`);
    const kind = kinds[i];
    const text = input.text?.[i];
    const hold =
      kind === 'clip'
        ? holdSecs[i] && holdSecs[i]! > 0
          ? holdSecs[i]!
          : 4
        : (holdSecs[i] ?? DEFAULT_STILL_HOLD_SEC);
    total += hold;
    let chain: string;
    if (kind === 'title') {
      const titleSize = Math.round(Math.min(width, height) * 0.075);
      const subtitleSize = Math.round(titleSize * 0.5);
      const draws =
        font && text?.titleFile
          ? [
              `drawtext=fontfile=${font}:textfile=${q(text.titleFile)}:fontcolor=white:fontsize=${titleSize}:x=(w-tw)/2:y=(h-th)/2-${text.subtitleFile ? Math.round(subtitleSize * 0.9) : 0}`,
              ...(text.subtitleFile
                ? [
                    `drawtext=fontfile=${font}:textfile=${q(text.subtitleFile)}:fontcolor=white@0.8:fontsize=${subtitleSize}:x=(w-tw)/2:y=(h/2)+${Math.round(subtitleSize * 0.9)}`,
                  ]
                : []),
            ]
          : [];
      chain = [
        `[${i}:v]format=yuv420p,setsar=1`,
        ...draws,
        `fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0.5, hold - 0.5).toFixed(2)}:d=0.5`,
        // xfade needs a constant frame rate on every input.
        `fps=${STILL_MOTION_FPS},trim=duration=${hold},setpts=PTS-STARTPTS`,
      ].join(',');
    } else if (kind === 'still' && input.stillMotion) {
      // zoompan needs headroom: render at 2× and zoom within it, one output frame per tick.
      const frames = Math.max(1, Math.round(hold * STILL_MOTION_FPS));
      chain =
        `[${i}:v]${scalePad},scale=${width * 2}:${height * 2},` +
        `zoompan=z=${q(stillMotionZoomExpr(i, frames))}:x=${q('iw/2-(iw/zoom/2)')}:y=${q('ih/2-(ih/zoom/2)')}:d=${frames}:s=${width}x${height}:fps=${STILL_MOTION_FPS},` +
        `setsar=1,format=yuv420p,fps=${STILL_MOTION_FPS},trim=duration=${hold},setpts=PTS-STARTPTS`;
    } else if (kind === 'still') {
      chain = `[${i}:v]${scalePad},trim=duration=${hold},setpts=PTS-STARTPTS`;
    } else {
      chain = `[${i}:v]${scalePad},setpts=PTS-STARTPTS`;
    }
    if (kind !== 'title' && font && text?.captionFile) {
      chain +=
        `,drawtext=fontfile=${font}:textfile=${q(text.captionFile)}:fontcolor=white:fontsize=${captionSize}` +
        `:x=${margin}:y=h-th-${Math.round(margin * 1.4)}:box=1:boxcolor=black@0.35:boxborderw=${Math.round(captionSize * 0.45)}` +
        `:alpha=${q(captionAlphaExpr(hold))}`;
    }
    // setpts leaves the frame rate unknown, and ffmpeg 7's xfade rejects that ("inputs needs to
    // be a constant frame rate") — so every shot ends on a fixed rate.
    parts.push(`${chain},fps=${STILL_MOTION_FPS}[${label}]`);
  }

  let videoLabel: string;
  if (shotCount === 1) {
    videoLabel = 'v0';
  } else if (crossfadeSec > 0 && shotCount >= 2) {
    const holdAt = (i: number) =>
      kinds[i] === 'clip'
        ? holdSecs[i] && holdSecs[i]! > 0
          ? holdSecs[i]!
          : 4
        : (holdSecs[i] ?? DEFAULT_STILL_HOLD_SEC);
    let prev = 'v0';
    let offset = Math.max(0.1, holdAt(0) - crossfadeSec);
    for (let i = 1; i < shotCount; i += 1) {
      const out = i === shotCount - 1 ? 'vout' : `xf${i}`;
      parts.push(
        `[${prev}][v${i}]xfade=transition=fade:duration=${crossfadeSec}:offset=${Math.max(0, offset)}[${out}]`
      );
      offset += Math.max(0.1, holdAt(i) - crossfadeSec);
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

/** Paths go into single-quoted filter options, so a quote in one would break the graph. */
function usableFilterPath(value: string): boolean {
  return !value.includes("'");
}

let drawtextCached: boolean | undefined;

/** Whether this ffmpeg build has drawtext (libfreetype). */
async function ffmpegHasDrawtext(ffmpeg: string): Promise<boolean> {
  if (drawtextCached !== undefined) return drawtextCached;
  try {
    const { stdout } = await runCapture(ffmpeg, ['-hide_banner', '-filters']);
    drawtextCached = /\sdrawtext\s/.test(stdout);
  } catch {
    drawtextCached = false;
  }
  return drawtextCached;
}

const FONT_CANDIDATES = [
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  '/usr/share/fonts/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial.ttf',
  'C:\\Windows\\Fonts\\arial.ttf',
];

let fontCached: string | null | undefined;

/** Font for titles/captions: FILM_FONT_FILE, a common system font, or fontconfig's sans. */
export async function resolveFilmFontFile(): Promise<string | null> {
  if (fontCached !== undefined) return fontCached;
  const candidates = [process.env.FILM_FONT_FILE?.trim(), ...FONT_CANDIDATES].filter(
    (value): value is string => Boolean(value)
  );
  for (const candidate of candidates) {
    try {
      await fs.access(/* turbopackIgnore: true */ candidate);
      fontCached = candidate;
      return fontCached;
    } catch {
      // next
    }
  }
  try {
    const { stdout } = await runCapture('fc-match', ['-f', '%{file}', 'sans']);
    const file = stdout.trim();
    if (file) {
      await fs.access(/* turbopackIgnore: true */ file);
      fontCached = file;
      return fontCached;
    }
  } catch {
    // no fontconfig
  }
  fontCached = null;
  return fontCached;
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

    // Titles and captions need drawtext and a font; without either the cut still encodes.
    const wantsText = Boolean(options.titleCard?.title?.trim() || options.captions);
    const fontFile =
      wantsText && (await ffmpegHasDrawtext(ffmpeg)) ? await resolveFilmFontFile() : null;
    const usableFont = fontFile && usableFilterPath(fontFile) ? fontFile : null;
    if (wantsText && !usableFont) {
      options.onProgress?.(0.45, 'No drawtext font on this server — skipping titles…');
    }
    const writeText = async (name: string, value: string): Promise<string | null> => {
      const clean = sanitizeFilmCaption(value);
      if (!clean || !usableFont) return null;
      const file = path.join(/* turbopackIgnore: true */ workDir, name);
      await fs.writeFile(/* turbopackIgnore: true */ file, clean, 'utf8');
      return usableFilterPath(file) ? file : null;
    };

    const graphKinds: FilmGraphShotKind[] = [];
    const graphHolds: number[] = [];
    const graphText: FilmGraphText[] = [];
    const inputArgs: string[][] = [];
    const titleText = options.titleCard?.title?.trim()
      ? await writeText('title.txt', options.titleCard.title)
      : null;
    if (titleText) {
      graphKinds.push('title');
      graphHolds.push(TITLE_CARD_SEC);
      graphText.push({
        titleFile: titleText,
        subtitleFile: options.titleCard?.subtitle
          ? await writeText('subtitle.txt', options.titleCard.subtitle)
          : null,
      });
      inputArgs.push([
        '-f',
        'lavfi',
        '-t',
        String(TITLE_CARD_SEC),
        '-i',
        `color=c=black:s=${even(width)}x${even(height)}:r=30`,
      ]);
    }
    for (let i = 0; i < localFiles.length; i += 1) {
      graphKinds.push(kinds[i]!);
      graphHolds.push(holdSecs[i]!);
      graphText.push({
        captionFile: options.captions
          ? await writeText(`caption-${i}.txt`, shots[i]?.title ?? '')
          : null,
      });
      if (kinds[i] === 'still' && options.stillMotion) {
        // zoompan expands one input frame into the whole hold.
        inputArgs.push(['-i', localFiles[i]!]);
      } else if (kinds[i] === 'still') {
        inputArgs.push([
          '-loop',
          '1',
          '-t',
          String(holdSecs[i] || DEFAULT_STILL_HOLD_SEC),
          '-i',
          localFiles[i]!,
        ]);
      } else {
        inputArgs.push(['-i', localFiles[i]!]);
      }
    }

    const { filter, videoLabel, audioLabel } = buildFilterComplex({
      shotCount: graphKinds.length,
      kinds: graphKinds,
      holdSecs: graphHolds,
      width: even(width),
      height: even(height),
      crossfadeSec,
      hasAudioBed: Boolean(audioPath),
      stillMotion: options.stillMotion === true,
      text: graphText,
      fontFile: usableFont,
    });

    const outputPath = path.join(/* turbopackIgnore: true */ workDir, 'out.mp4');
    const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
    for (const entry of inputArgs) {
      args.push(...entry);
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
