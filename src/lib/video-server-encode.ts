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
  filmShotSubtitle,
  type FilmPlaylistShot,
  type FilmShotKind,
} from './media-kind';

import {
  captionAlphaExpr,
  filmShotCaption,
  sanitizeFilmCaption,
  subtitleLines,
  stillMotionZoomExpr,
  STILL_MOTION_FPS,
  TITLE_CARD_SEC,
  type FilmTitleCard,
} from './video-polish';
import { clipIsTrimmed, clipTrimWindow } from './clip-trim';
import {
  cutJoins,
  cutStarts,
  filmShotStarts,
  filmSpeechStarts,
  xfadeTransitionName,
  type CutTransitionIn,
} from './cut-timeline';
import { normalizeMusicLevel, normalizeVoiceLevel } from './audio-mix-levels';
import sharp from 'sharp';
import {
  colourMatrixFfmpeg,
  colourStatsFromPixels,
  normalizeFilmLook,
  normalizeLookStrength,
  shotGradeMatrices,
  type ShotColourStats,
} from './cut-look';
import {
  buildFilmScaleFilter,
  FILM_PRESET_SIZE,
  normalizeFilmResolution,
  type FilmResolutionPreset,
} from './video-resolution';

export {
  FILM_RESOLUTION_PRESETS,
  normalizeFilmResolution,
  type FilmResolutionPreset,
} from './video-resolution';

export type FilmServerEncodeOptions = {
  resolution?: FilmResolutionPreset;
  /** Crossfade seconds between shots (0 = hard cut). */
  crossfadeSec?: number;
  /** Slow push-in / pull-out on stills instead of a static hold. */
  stillMotion?: boolean;
  /** Short lower-third caption per shot from its title (needs drawtext + a font). */
  captions?: boolean;
  /** What is said (else the narration), bottom centre over the shot (needs drawtext + a font). */
  subtitles?: boolean;
  /** Opening title card (needs drawtext + a font). */
  titleCard?: FilmTitleCard | null;
  /** Optional audio bed URL (http/https, private allowed for same-origin). */
  audioBedUrl?: string;
  /** Keep talking clips' own sound (lines), ducking the bed under them. Default on. */
  clipSound?: boolean;
  /** Music bed gain (1 = as recorded; audio-mix-levels.ts). */
  musicLevel?: number;
  /** Talking clips' lines gain (1 = as recorded). */
  voiceLevel?: number;
  /** The film's colour look (cut-look.ts) and its strength 0–1. */
  look?: string;
  lookStrength?: number;
  /** Move each shot's colour toward the film's (cut-look.ts shotMatchMatrix). */
  matchShots?: boolean;
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

const STATS_SIZE = 96;

/** A clip's speed, 0.25–4 (1 when unset). */
function clipSpeedOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(4, Math.max(0.25, value))
    : 1;
}

/** atempo for a speed (each atempo stays within 0.5–2, as older ffmpeg builds require). */
function atempoChain(speed: number): string {
  const steps: number[] = [];
  let left = speed;
  while (left < 0.5) {
    steps.push(0.5);
    left /= 0.5;
  }
  while (left > 2) {
    steps.push(2);
    left /= 2;
  }
  steps.push(Number(left.toFixed(4)));
  return steps.map(step => `atempo=${step}`).join(',');
}

/** A shot's colour (cut-look.ts) from its file: a still as is, a clip at 40% of what plays. */
async function shotColourStatsFromFile(
  ffmpeg: string,
  file: string,
  kind: FilmShotKind,
  trimStart: number | null | undefined,
  holdSec: number | undefined
): Promise<ShotColourStats | null> {
  let picture: Buffer | string = file;
  if (kind === 'clip') {
    const at = (trimStart ?? 0) + Math.max(0, (holdSec ?? 2) * 0.4);
    const frame = `${file}.stats.png`;
    await runCapture(ffmpeg, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      at.toFixed(2),
      '-i',
      file,
      '-frames:v',
      '1',
      frame,
    ]);
    picture = frame;
  }
  const { data, info } = await sharp(picture)
    .resize(STATS_SIZE, STATS_SIZE, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return colourStatsFromPixels(data, info.width, info.height);
}

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

/**
 * Length of a downloaded clip's sound track in seconds, or null when it has none (talking clips
 * are MP4 with audio; WAN clips are silent WebP).
 */
async function clipAudioSec(ffmpeg: string, file: string): Promise<number | null> {
  if (!/\.(mp4|webm|mov|mkv)$/i.test(file)) return null;
  try {
    const { stderr } = await runCapture(ffmpeg, [
      '-hide_banner',
      '-i',
      file,
      '-map',
      '0:a:0',
      '-f',
      'null',
      '-',
    ]);
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const sec = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return sec > 0 ? sec : null;
  } catch {
    return null;
  }
}

/** Container length of a downloaded clip in seconds, or null when ffmpeg can't tell. */
async function clipDurationSec(ffmpeg: string, file: string): Promise<number | null> {
  try {
    const { stderr } = await runCapture(ffmpeg, [
      '-hide_banner',
      '-i',
      file,
      '-f',
      'null',
      '-t',
      '0',
      '-',
    ]);
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const sec = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return sec > 0 ? sec : null;
  } catch {
    return null;
  }
}

async function fetchShotBytes(
  url: string,
  requestOrigin?: string,
  entryId?: string,
  userId?: string | null
): Promise<{ buffer: Buffer; contentType?: string; filenameHint?: string }> {
  const { fetchFilmShotBytes } = await import('./video-shot-fetch');
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
  /** Subtitle (spoken line / narration), bottom centre; the caption moves to the top. */
  speechFile?: string | null;
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

export { filmSpeechStarts } from './cut-timeline';

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
  /** Per shot: the clip carries its own sound (a talking clip) — mixed in at the shot's start. */
  speech?: boolean[];
  /**
   * Per shot: a trimmed clip's in point in seconds (null / unset: not trimmed). A trimmed clip
   * plays `holdSecs[i]` from there; its video and sound are cut the same way.
   */
  trimStarts?: Array<number | null>;
  /** Music bed gain (default 1). */
  musicLevel?: number;
  /** Lines gain (default 1). */
  voiceLevel?: number;
  /** Narration tracks (film-narration.ts): ffmpeg input index → the shot it starts with. */
  narration?: Array<{ input: number; shot: number }>;
  /** Per shot: how it comes in (cut-timeline.ts); unset = the crossfade. */
  transitions?: ReadonlyArray<CutTransitionIn | null | undefined>;
  /** Per still: push in, pull out or hold (unset = alternating, with stillMotion). */
  stillMotions?: ReadonlyArray<'in' | 'out' | 'none' | undefined>;
  /** Per clip: its sound's level (1 = as recorded). */
  volumes?: ReadonlyArray<number | undefined>;
  /** Per shot: its colour grade as ffmpeg filters (cut-look.ts colourMatrixFfmpeg), '' = none. */
  grades?: ReadonlyArray<string | undefined>;
  /**
   * Per clip: file seconds per cut second (1 = as shot) — a clip's hold is its cut length, so it
   * reads `hold × speed` seconds of the file. Under 1 the frames in between are interpolated.
   */
  speeds?: ReadonlyArray<number | undefined>;
  /** Per clip: played backwards. */
  reverses?: ReadonlyArray<boolean | undefined>;
}): { filter: string; videoLabel: string; audioLabel: string | null; durationSec: number } {
  const { shotCount, kinds, holdSecs, width, height, crossfadeSec, hasAudioBed } = input;
  const scalePad = buildFilmScaleFilter(width, height);
  const font = input.fontFile ? q(input.fontFile) : null;
  const captionSize = Math.round(Math.min(width, height) * 0.045);
  const subtitleTextSize = Math.round(Math.min(width, height) * 0.05);
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
    } else if (kind === 'still' && input.stillMotion && input.stillMotions?.[i] !== 'none') {
      // zoompan needs headroom: render at 2× and zoom within it, one output frame per tick.
      const frames = Math.max(1, Math.round(hold * STILL_MOTION_FPS));
      // A picked direction: an even curve pushes in, an odd one pulls out.
      const curve =
        input.stillMotions?.[i] === 'in' ? 0 : input.stillMotions?.[i] === 'out' ? 1 : i;
      chain =
        `[${i}:v]${scalePad},scale=${width * 2}:${height * 2},` +
        `zoompan=z=${q(stillMotionZoomExpr(curve, frames))}:x=${q('iw/2-(iw/zoom/2)')}:y=${q('ih/2-(ih/zoom/2)')}:d=${frames}:s=${width}x${height}:fps=${STILL_MOTION_FPS},` +
        `setsar=1,format=yuv420p,fps=${STILL_MOTION_FPS},trim=duration=${hold},setpts=PTS-STARTPTS`;
    } else if (kind === 'still') {
      chain = `[${i}:v]${scalePad},trim=duration=${hold},setpts=PTS-STARTPTS`;
    } else if (input.trimStarts?.[i] != null && hold > 0) {
      // A trimmed clip (Cut shot list): only its in → out piece — at its speed, maybe backwards.
      const start = input.trimStarts[i]!;
      const speed = clipSpeedOf(input.speeds?.[i]);
      const reverse = input.reverses?.[i] ? ',reverse' : '';
      const paced =
        speed === 1
          ? ''
          : `,setpts=PTS/${speed}` +
            // Slow motion: frames made in between (motion-compensated), not each one held.
            (speed < 1 ? `,minterpolate=fps=${STILL_MOTION_FPS}:mi_mode=mci:mc_mode=aobmc` : '');
      chain = `[${i}:v]trim=start=${start.toFixed(3)}:end=${(start + hold * speed).toFixed(3)},setpts=PTS-STARTPTS${reverse},${scalePad}${paced}`;
    } else {
      chain = `[${i}:v]${scalePad},setpts=PTS-STARTPTS`;
    }
    // The grade before any text, so captions and subtitles keep their own colour.
    if (kind !== 'title' && input.grades?.[i]) chain += `,${input.grades[i]}`;
    if (kind !== 'title' && font && text?.captionFile) {
      // With a subtitle at the bottom, the shot's caption goes to the top.
      const captionY = text.speechFile ? `${margin}` : `h-th-${Math.round(margin * 1.4)}`;
      chain +=
        `,drawtext=fontfile=${font}:textfile=${q(text.captionFile)}:fontcolor=white:fontsize=${captionSize}` +
        `:x=${margin}:y=${captionY}:box=1:boxcolor=black@0.35:boxborderw=${Math.round(captionSize * 0.45)}` +
        `:alpha=${q(captionAlphaExpr(hold))}`;
    }
    if (kind !== 'title' && font && text?.speechFile) {
      // Subtitles: bottom centre for the whole shot, wrapped by the writer (subtitleLines).
      chain +=
        `,drawtext=fontfile=${font}:textfile=${q(text.speechFile)}:fontcolor=white:fontsize=${subtitleTextSize}` +
        `:line_spacing=${Math.round(subtitleTextSize * 0.25)}:x=(w-tw)/2:y=h-th-${margin}` +
        `:box=1:boxcolor=black@0.55:boxborderw=${Math.round(subtitleTextSize * 0.4)}`;
    }
    // setpts leaves the frame rate unknown, and ffmpeg 7's xfade rejects that ("inputs needs to
    // be a constant frame rate") — so every shot ends on a fixed rate.
    parts.push(`${chain},fps=${STILL_MOTION_FPS}[${label}]`);
  }

  // Joins: a crossfade / dip / slide overlaps the two shots (xfade); a hard cut concatenates.
  const joins = cutJoins({ count: shotCount, crossfadeSec, transitions: input.transitions });
  const holdAt = (i: number) =>
    kinds[i] === 'clip'
      ? holdSecs[i] && holdSecs[i]! > 0
        ? holdSecs[i]!
        : 4
      : (holdSecs[i] ?? DEFAULT_STILL_HOLD_SEC);
  const placed = cutStarts(
    Array.from({ length: shotCount }, (_, i) => holdAt(i)),
    joins.overlaps
  );
  let videoLabel: string;
  if (shotCount === 1) {
    videoLabel = 'v0';
  } else if (joins.overlaps.some(sec => sec > 0)) {
    let prev = 'v0';
    for (let i = 1; i < shotCount; i += 1) {
      const out = i === shotCount - 1 ? 'vout' : `xf${i}`;
      const overlap = joins.overlaps[i] ?? 0;
      parts.push(
        overlap > 0
          ? `[${prev}][v${i}]xfade=transition=${xfadeTransitionName(joins.kinds[i] ?? 'fade')}:duration=${overlap}:offset=${Math.max(0, placed.starts[i]!)}[${out}]`
          : `[${prev}][v${i}]concat=n=2:v=1:a=0[${out}]`
      );
      prev = out;
    }
    videoLabel = 'vout';
    total = Math.max(placed.total, 1);
  } else {
    parts.push(`${labels.join('')}concat=n=${shotCount}:v=1:a=0[vout]`);
    videoLabel = 'vout';
  }

  let audioLabel: string | null = null;
  const end = Math.max(1, total);
  const fadeOut = `afade=t=out:st=${Math.max(0.1, end - 1)}:d=1`;
  const voiced = filmSpeechStarts({
    kinds,
    holdSecs,
    crossfadeSec,
    transitions: input.transitions,
    speech: input.speech,
  });
  const stereo = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const voiceLevel = normalizeVoiceLevel(input.voiceLevel);
  const musicLevel = normalizeMusicLevel(input.musicLevel);
  const voiceGain = voiceLevel !== 1 ? `volume=${voiceLevel},` : '';
  const musicGain = musicLevel !== 1 ? `,volume=${musicLevel}` : '';
  for (const { index, startSec, holdSec } of voiced) {
    const delayMs = Math.round(startSec * 1000);
    const from = input.trimStarts?.[index] ?? 0;
    const speed = clipSpeedOf(input.speeds?.[index]);
    // The sound plays the same window as the picture: backwards, then at the clip's speed.
    const paced =
      (input.reverses?.[index] ? 'areverse,' : '') + (speed === 1 ? '' : `${atempoChain(speed)},`);
    // The clip's own level (Cut's shot list) on top of the Lines level.
    const own = input.volumes?.[index];
    const gain =
      typeof own === 'number' && own !== 1
        ? `volume=${Number((voiceLevel * own).toFixed(3))},`
        : voiceGain;
    parts.push(
      `[${index}:a]${stereo},atrim=${from}:${from + holdSec * speed},asetpts=PTS-STARTPTS,${paced}${gain}adelay=${delayMs}:all=1[s${index}]`
    );
  }
  // Narration: a voice-over from its shot's start, mixed with the lines (it ducks the music too).
  const narrationLabels: string[] = [];
  const narrated = input.narration ?? [];
  if (narrated.length > 0) {
    const starts = filmShotStarts({
      kinds,
      holdSecs,
      crossfadeSec,
      transitions: input.transitions,
    });
    for (const entry of narrated) {
      const start = starts[entry.shot];
      if (start === undefined) continue;
      parts.push(
        `[${entry.input}:a]${stereo},asetpts=PTS-STARTPTS,${voiceGain}adelay=${Math.round(start * 1000)}:all=1[n${entry.shot}]`
      );
      narrationLabels.push(`[n${entry.shot}]`);
    }
  }
  const speechCount = voiced.length + narrationLabels.length;
  if (speechCount > 0) {
    const speechLabels =
      voiced.map(({ index }) => `[s${index}]`).join('') + narrationLabels.join('');
    parts.push(
      `${speechLabels}${speechCount > 1 ? `amix=inputs=${speechCount}:duration=longest:normalize=0` : 'anull'},apad=whole_dur=${end}[speech]`
    );
  }
  if (hasAudioBed) {
    const audioIndex = shotCount;
    const bed = `[${audioIndex}:a]${stereo},atrim=0:${end},asetpts=PTS-STARTPTS${musicGain}`;
    if (speechCount > 0) {
      // Duck the music under the lines, then lay the lines on top.
      parts.push(`[speech]asplit=2[sp1][sp2]`);
      parts.push(`${bed},apad=whole_dur=${end}[bed]`);
      parts.push(
        `[bed][sp1]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[ducked]`
      );
      parts.push(
        `[ducked][sp2]amix=inputs=2:duration=first:normalize=0,atrim=0:${end},${fadeOut}[aout]`
      );
    } else {
      parts.push(`${bed},${fadeOut}[aout]`);
    }
    audioLabel = 'aout';
  } else if (speechCount > 0) {
    parts.push(`[speech]atrim=0:${end},${fadeOut}[aout]`);
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
export async function ffmpegHasDrawtext(ffmpeg: string): Promise<boolean> {
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
    const speech: boolean[] = [];
    const trimStarts: Array<number | null> = [];
    const speeds: number[] = [];
    const reverses: boolean[] = [];

    for (const [index, shot] of shots.entries()) {
      options.onProgress?.(0.05 + (0.35 * index) / shots.length, `Fetching ${shot.title}`);
      const fetched = await fetchShotBytes(shot.url, requestOrigin, shot.entryId, options.userId);
      const ext = extForShot(shot.kind, fetched.contentType, fetched.filenameHint || shot.url);
      const filePath = path.join(/* turbopackIgnore: true */ workDir, `shot-${index}.${ext}`);
      await fs.writeFile(/* turbopackIgnore: true */ filePath, fetched.buffer);
      localFiles.push(filePath);
      kinds.push(shot.kind);
      const soundSec =
        shot.kind === 'clip' && options.clipSound !== false
          ? await clipAudioSec(ffmpeg, filePath)
          : null;
      // A muted clip (Cut's shot list) adds no sound to the mix.
      speech.push(soundSec !== null && shot.volume !== 0);
      // A trimmed clip (Cut shot list) plays from its in point to its out point; a sped-up,
      // slowed or reversed one goes the same way (its whole file as the window when untrimmed).
      const speed = shot.kind === 'clip' ? clipSpeedOf(shot.speed) : 1;
      const paced = shot.kind === 'clip' && (speed !== 1 || shot.reverse === true);
      speeds.push(speed);
      reverses.push(shot.kind === 'clip' && shot.reverse === true);
      const windowed = shot.kind === 'clip' && (clipIsTrimmed(shot) || paced);
      const fullSec = windowed ? ((await clipDurationSec(ffmpeg, filePath)) ?? soundSec) : null;
      const trim = windowed ? clipTrimWindow(shot, fullSec) : null;
      const trimmedSec = trim ? (trim.end ?? fullSec ?? 0) - trim.start : 0;
      trimStarts.push(trim && trimmedSec > 0 ? trim.start : null);
      holdSecs.push(
        shot.kind === 'still'
          ? clampStillHoldSec(shot.holdSec, DEFAULT_STILL_HOLD_SEC)
          : trim && trimmedSec > 0
            ? trimmedSec / speed
            : typeof shot.holdSec === 'number' && shot.holdSec > 0
              ? shot.holdSec
              : // A talking clip holds for its whole line (the 4 s default would cut it off).
                (soundSec ?? 0)
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

    // Narration tracks, one per narrated shot (film-narration.ts).
    const narrationFiles: Array<{ shot: number; path: string }> = [];
    for (const [index, shot] of shots.entries()) {
      const url = shot.narrationUrl?.trim();
      if (!url) continue;
      try {
        const fetched = await fetchShotBytes(url, requestOrigin, undefined, options.userId);
        const filePath = path.join(/* turbopackIgnore: true */ workDir, `narration-${index}.audio`);
        await fs.writeFile(/* turbopackIgnore: true */ filePath, fetched.buffer);
        narrationFiles.push({ shot: index, path: filePath });
      } catch {
        options.onProgress?.(0.43, `Narration for ${shot.title} could not be fetched — left out`);
      }
    }

    // Titles and captions need drawtext and a font; without either the cut still encodes.
    const wantsText = Boolean(
      options.titleCard?.title?.trim() ||
      options.captions ||
      (options.subtitles && shots.some(shot => filmShotSubtitle(shot)))
    );
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

    const subtitleWrapSize = Math.round(Math.min(width, height) * 0.05);
    // Multi-line text as is (sanitizeFilmCaption keeps a caption to one line).
    const writeRawText = async (name: string, value: string): Promise<string | null> => {
      if (!value.trim() || !usableFont) return null;
      const file = path.join(/* turbopackIgnore: true */ workDir, name);
      await fs.writeFile(/* turbopackIgnore: true */ file, value, 'utf8');
      return usableFilterPath(file) ? file : null;
    };
    const graphKinds: FilmGraphShotKind[] = [];
    const graphHolds: number[] = [];
    const graphText: FilmGraphText[] = [];
    const graphSpeech: boolean[] = [];
    const graphTrims: Array<number | null> = [];
    const graphTransitions: Array<CutTransitionIn | undefined> = [];
    const graphMotions: Array<'in' | 'out' | 'none' | undefined> = [];
    const graphVolumes: Array<number | undefined> = [];
    const graphGrades: string[] = [];
    const graphSpeeds: number[] = [];
    const graphReverses: boolean[] = [];
    const inputArgs: string[][] = [];
    // The film look and shot match: each shot's colour read from its picture (a clip's at 40%).
    const look = normalizeFilmLook(options.look);
    const shotGrades =
      look !== 'none' || options.matchShots
        ? await (async () => {
            options.onProgress?.(0.44, 'Matching the shots’ colour…');
            const stats = await Promise.all(
              localFiles.map((file, i) =>
                shotColourStatsFromFile(ffmpeg, file, kinds[i]!, trimStarts[i], holdSecs[i]).catch(
                  () => null
                )
              )
            );
            return shotGradeMatrices({
              stats,
              look,
              lookStrength: normalizeLookStrength(options.lookStrength),
              matchShots: options.matchShots === true,
            }).map(colourMatrixFfmpeg);
          })()
        : [];
    const titleText = options.titleCard?.title?.trim()
      ? await writeText('title.txt', options.titleCard.title)
      : null;
    // The title card opens the film, or follows a "Previously on" recap (afterShots).
    const titleAt = titleText
      ? Math.min(localFiles.length, options.titleCard?.afterShots ?? 0)
      : -1;
    const pushTitle = async () => {
      if (!titleText) return;
      graphGrades.push('');
      graphSpeeds.push(1);
      graphReverses.push(false);
      graphTransitions.push(undefined);
      graphMotions.push(undefined);
      graphVolumes.push(undefined);
      graphSpeech.push(false);
      graphTrims.push(null);
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
    };
    for (let i = 0; i < localFiles.length; i += 1) {
      if (i === titleAt) await pushTitle();
      graphGrades.push(shotGrades[i] ?? '');
      graphSpeeds.push(speeds[i] ?? 1);
      graphReverses.push(reverses[i] === true);
      graphTransitions.push(shots[i]?.transitionIn);
      graphMotions.push(shots[i]?.motion);
      graphVolumes.push(shots[i]?.volume);
      graphSpeech.push(speech[i] === true);
      graphTrims.push(trimStarts[i] ?? null);
      graphKinds.push(kinds[i]!);
      graphHolds.push(holdSecs[i]!);
      graphText.push({
        captionFile: options.captions
          ? await writeText(`caption-${i}.txt`, shots[i] ? filmShotCaption(shots[i]) : '')
          : null,
        speechFile:
          options.subtitles && shots[i] && filmShotSubtitle(shots[i])
            ? await writeRawText(
                `speech-${i}.txt`,
                subtitleLines(
                  filmShotSubtitle(shots[i]),
                  Math.round(width / (subtitleWrapSize * 0.55))
                )
              )
            : null,
      });
      if (kinds[i] === 'still' && options.stillMotion && shots[i]?.motion !== 'none') {
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

    if (titleAt === localFiles.length) await pushTitle();
    /** Graph position of shot i (the title card takes one slot before shot `titleAt`). */
    const graphIndexOf = (i: number) => (titleAt >= 0 && i >= titleAt ? i + 1 : i);

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
      speech: graphSpeech,
      trimStarts: graphTrims,
      transitions: graphTransitions,
      stillMotions: graphMotions,
      volumes: graphVolumes,
      grades: graphGrades,
      speeds: graphSpeeds,
      reverses: graphReverses,
      musicLevel: options.musicLevel,
      voiceLevel: options.voiceLevel,
      // Graph shot index = shot index + the title card when there is one; narration inputs follow
      // the shots and the music bed.
      narration: narrationFiles.map((entry, k) => ({
        input: graphKinds.length + (audioPath ? 1 : 0) + k,
        shot: graphIndexOf(entry.shot),
      })),
    });

    const outputPath = path.join(/* turbopackIgnore: true */ workDir, 'out.mp4');
    const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
    for (const entry of inputArgs) {
      args.push(...entry);
    }
    if (audioPath) {
      args.push('-i', audioPath);
    }
    for (const entry of narrationFiles) {
      args.push('-i', entry.path);
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
