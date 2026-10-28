/**
 * Server-side film assemble via system ffmpeg (H.264 + AAC MP4).
 * Browser MediaRecorder remains the offline fallback.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { resolvePromptDataDir } from '../prompt/data-paths';
import {
  clampStillHoldSec,
  DEFAULT_STILL_HOLD_SEC,
  filmShotSubtitle,
  type FilmPlaylistShot,
  type FilmShotKind,
} from '../media/kind';

import {
  captionAlphaExpr,
  filmShotCaption,
  sanitizeFilmCaption,
  subtitleLines,
  stillMotionZoomExpr,
  STILL_MOTION_FPS,
  TITLE_CARD_SEC,
  type FilmTitleCard,
} from './polish';
import { clipIsTrimmed, clipTrimWindow } from '../clip/trim';
import {
  cutJoins,
  cutStarts,
  filmShotStarts,
  filmSpeechStarts,
  xfadeTransitionName,
  type CutTransitionIn,
} from './cut-timeline';
import { normalizeMusicLevel, normalizeVoiceLevel } from '../audio/mix-levels';
import sharp from 'sharp';
import {
  FULL_BOX,
  containBox,
  framingPoint,
  moveZoompanExprs,
  type FramePoint,
  type PictureBox,
} from './cut-move';
import { reframeScaleFilter } from './cut-reframe';
import {
  LOGO_WIDTH,
  OVERLAY_MARGIN,
  PIP_WIDTH,
  lowerThirdAlphaExpr,
  normalizeOverlayCorner,
  overlayFfmpegXY,
  type OverlayCorner,
} from './cut-overlay';
import { cuesToSrt, speechSpanFromSilence, subtitleCues, type SubtitleCue } from './cut-subtitles';
import {
  normalizeAmbienceLevel,
  normalizeMusicFadeInSec,
  normalizeMusicFadeOutSec,
  normalizeMusicStartSec,
  soundOverlap,
  type CutSoundOptions,
} from './cut-sound';
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
} from './resolution';

export {
  FILM_RESOLUTION_PRESETS,
  normalizeFilmResolution,
  type FilmResolutionPreset,
} from './resolution';

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
  /** Music start / fades and the ambience track (cut-sound.ts). */
  sound?: CutSoundOptions | null;
  /** Vertical / square cuts: the crop follows the face (cut-reframe.ts) — default on. */
  followFaces?: boolean;
  /** A logo / watermark over the whole film (cut-overlay.ts). */
  logo?: { url: string; corner?: OverlayCorner } | null;
  /** Clips under 25 fps get RIFE in-between frames first (cut-smooth-server.ts). */
  smoothMotion?: boolean;
  /** A light sharpen over the finished picture. */
  sharpen?: boolean;
  userId?: string | null;
  onProgress?: (ratio: number, label: string) => void;
};

export type FilmServerEncodeResult = {
  buffer: Buffer;
  mimeType: 'video/mp4';
  extension: 'mp4';
  width: number;
  height: number;
  /** The film's subtitles as an .srt (when subtitles are on and anything is spoken). */
  subtitlesSrt?: string;
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

/**
 * A face-following crop for one shot (cut-reframe.ts), or null for the centre crop: no wider
 * than the frame, no face found, or no face finder in ComfyUI. A clip is looked at every ~1.5 s
 * through what plays; a reversed one holds still at the faces' mean.
 */
async function shotReframeFilter(input: {
  file: string;
  kind: FilmShotKind;
  trimStart: number | null | undefined;
  playSec: number;
  reverse: boolean;
  output: { width: number; height: number };
}): Promise<string | null> {
  if (input.kind !== 'clip' && input.kind !== 'still') return null;
  const { shotReframePath } = await import('./cut-reframe-server');
  const path = await shotReframePath({
    bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ input.file)),
    kind: input.kind,
    trimStart: input.trimStart,
    playSec: input.playSec,
    reverse: input.reverse,
    output: input.output,
  });
  return path ? reframeScaleFilter(path, input.output) : null;
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
/** When someone speaks in `durSec` of a file's sound from `fromSec` (cut-subtitles.ts). */
async function speechSpan(
  ffmpeg: string,
  file: string,
  fromSec: number,
  durSec: number
): Promise<{ from: number; to: number } | null> {
  try {
    const { stderr } = await runCapture(ffmpeg, [
      '-hide_banner',
      '-ss',
      fromSec.toFixed(3),
      '-t',
      durSec.toFixed(3),
      '-i',
      file,
      '-map',
      '0:a:0',
      '-af',
      'silencedetect=n=-32dB:d=0.3',
      '-f',
      'null',
      '-',
    ]);
    return speechSpanFromSilence(stderr, durSec);
  } catch {
    return null;
  }
}

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
  const { fetchFilmShotBytes } = await import('./shot-fetch');
  return fetchFilmShotBytes({ url, requestOrigin, entryId, userId });
}

export function extForShot(kind: FilmShotKind, contentTypeHint?: string, url?: string): string {
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
  /** A lower third (cut-overlay.ts): its line and the smaller line under it. */
  lowerThirdFile?: string | null;
  lowerThirdSubFile?: string | null;
  /** Timed subtitle phrases (cut-subtitles.ts), shot seconds; drawn instead of speechFile. */
  speechCues?: Array<{ file: string; from: number; to: number }>;
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
  stillMotions?: ReadonlyArray<'in' | 'out' | 'none' | 'custom' | undefined>;
  /** Per still: a hand-set move (cut-move.ts), drawn whether or not slow zoom is on. */
  stillMoves?: ReadonlyArray<
    { from: FramePoint; to: FramePoint; box?: PictureBox } | null | undefined
  >;
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
  /** Per clip: J / L cut — its sound starts this long before its picture / runs this long after. */
  soundLeads?: ReadonlyArray<number | undefined>;
  soundTails?: ReadonlyArray<number | undefined>;
  /** Music start / fades (cut-sound.ts). */
  sound?: CutSoundOptions | null;
  /** The ambience track's ffmpeg input index (looped), when there is one. */
  ambienceInput?: number | null;
  /**
   * Per shot: the input to read a clip's sound from (its own sound-only input), else the clip's
   * own input. M6 D17: the sound is mixed in parallel, so reading it from the picture's input
   * decoded every clip from the start and held its frames until its turn (26 GB for 60 clips).
   */
  clipAudioInputs?: ReadonlyArray<number | null | undefined>;
  /** Per shot: a face-following scale + crop in place of the centre crop (cut-reframe.ts). */
  reframes?: ReadonlyArray<string | null | undefined>;
  /** Per shot: a picture-in-picture (its looped picture's input index and corner). */
  pips?: ReadonlyArray<{ input: number; corner: OverlayCorner } | null | undefined>;
  /** A logo / watermark over the whole film. */
  logo?: { input: number; corner: OverlayCorner } | null;
  /** A light unsharp mask over the finished picture (before the logo). */
  sharpen?: boolean;
}): { filter: string; videoLabel: string; audioLabel: string | null; durationSec: number } {
  const { shotCount, kinds, holdSecs, width, height, crossfadeSec, hasAudioBed } = input;
  const centreFit = buildFilmScaleFilter(width, height);
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
    const scalePad = input.reframes?.[i] || centreFit;
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
    } else if (kind === 'still' && input.stillMoves?.[i]) {
      // A hand-set move: from one framing to another, eased, within a 2× render.
      const frames = Math.max(1, Math.round(hold * STILL_MOTION_FPS));
      const move = moveZoompanExprs(
        input.stillMoves[i]!.from,
        input.stillMoves[i]!.to,
        frames,
        input.stillMoves[i]!.box
      );
      chain =
        `[${i}:v]${scalePad},scale=${width * 2}:${height * 2},` +
        `zoompan=z=${q(move.z)}:x=${q(move.x)}:y=${q(move.y)}:d=${frames}:s=${width}x${height}:fps=${STILL_MOTION_FPS},` +
        `setsar=1,format=yuv420p,fps=${STILL_MOTION_FPS},trim=duration=${hold},setpts=PTS-STARTPTS`;
    } else if (
      kind === 'still' &&
      input.stillMotion &&
      input.stillMotions?.[i] !== 'none' &&
      input.stillMotions?.[i] !== 'custom'
    ) {
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
    if (kind !== 'title' && font && text?.lowerThirdFile) {
      // Lower third: a name / line at the lower left, a smaller line under it; fades in and out.
      const nameSize = Math.round(Math.min(width, height) * 0.05);
      const subSize = Math.round(nameSize * 0.62);
      const alpha = q(lowerThirdAlphaExpr(hold));
      const top = Math.round(height * 0.68);
      chain +=
        `,drawtext=fontfile=${font}:textfile=${q(text.lowerThirdFile)}:fontcolor=white:fontsize=${nameSize}` +
        `:x=${Math.round(margin * 1.2)}:y=${top}:box=1:boxcolor=black@0.6:boxborderw=${Math.round(nameSize * 0.35)}:alpha=${alpha}`;
      if (text.lowerThirdSubFile) {
        chain +=
          `,drawtext=fontfile=${font}:textfile=${q(text.lowerThirdSubFile)}:fontcolor=white@0.9:fontsize=${subSize}` +
          `:x=${Math.round(margin * 1.2)}:y=${top + Math.round(nameSize * 1.55)}:box=1:boxcolor=black@0.45:boxborderw=${Math.round(subSize * 0.35)}:alpha=${alpha}`;
      }
    }
    if (kind !== 'title' && font && text?.captionFile) {
      // With a subtitle at the bottom, the shot's caption goes to the top.
      const captionY = text.speechFile ? `${margin}` : `h-th-${Math.round(margin * 1.4)}`;
      chain +=
        `,drawtext=fontfile=${font}:textfile=${q(text.captionFile)}:fontcolor=white:fontsize=${captionSize}` +
        `:x=${margin}:y=${captionY}:box=1:boxcolor=black@0.35:boxborderw=${Math.round(captionSize * 0.45)}` +
        `:alpha=${q(captionAlphaExpr(hold))}`;
    }
    const subtitleDraw = (file: string) =>
      `,drawtext=fontfile=${font}:textfile=${q(file)}:fontcolor=white:fontsize=${subtitleTextSize}` +
      `:line_spacing=${Math.round(subtitleTextSize * 0.25)}:x=(w-tw)/2:y=h-th-${margin}` +
      `:box=1:boxcolor=black@0.55:boxborderw=${Math.round(subtitleTextSize * 0.4)}`;
    if (kind !== 'title' && font && text?.speechCues?.length) {
      // Timed subtitles: each phrase while it is spoken.
      for (const cue of text.speechCues) {
        chain += `${subtitleDraw(cue.file)}:enable=${q(`between(t,${cue.from.toFixed(3)},${cue.to.toFixed(3)})`)}`;
      }
    } else if (kind !== 'title' && font && text?.speechFile) {
      // Subtitles: bottom centre for the whole shot, wrapped by the writer (subtitleLines).
      chain += subtitleDraw(text.speechFile);
    }
    // setpts leaves the frame rate unknown, and ffmpeg 7's xfade rejects that ("inputs needs to
    // be a constant frame rate") — so every shot ends on a fixed rate.
    const pip = kind !== 'title' ? input.pips?.[i] : null;
    if (pip) {
      // Picture-in-picture: a framed picture in a corner, for the whole shot.
      const pipWidth = Math.round((width * PIP_WIDTH) / 2) * 2;
      parts.push(`${chain},fps=${STILL_MOTION_FPS}[${label}b]`);
      parts.push(
        `[${pip.input}:v]scale=${pipWidth - 6}:-2,pad=iw+6:ih+6:3:3:white,setsar=1,format=yuv420p[${label}p]`
      );
      parts.push(
        `[${label}b][${label}p]overlay=${overlayFfmpegXY(pip.corner, Math.round(Math.min(width, height) * OVERLAY_MARGIN))}:shortest=1,fps=${STILL_MOTION_FPS}[${label}]`
      );
    } else {
      parts.push(`${chain},fps=${STILL_MOTION_FPS}[${label}]`);
    }
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
  const fadeOutSec = Math.min(normalizeMusicFadeOutSec(input.sound?.musicFadeOutSec), end);
  const fadeOut =
    fadeOutSec > 0
      ? `afade=t=out:st=${Math.max(0, end - fadeOutSec).toFixed(3)}:d=${fadeOutSec}`
      : 'anull';
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
    // J / L cut: the sound from before the in point / past the out point, under the shot before
    // / after (cut-sound.ts soundOverlap already clamped it to what the file has).
    const lead = input.soundLeads?.[index] ?? 0;
    const tail = input.soundTails?.[index] ?? 0;
    // The clip's own level (Cut's shot list) on top of the Lines level.
    const own = input.volumes?.[index];
    const gain =
      typeof own === 'number' && own !== 1
        ? `volume=${Number((voiceLevel * own).toFixed(3))},`
        : voiceGain;
    parts.push(
      `[${input.clipAudioInputs?.[index] ?? index}:a]${stereo},atrim=${Math.max(0, from - lead)}:${from + holdSec * speed + tail},asetpts=PTS-STARTPTS,${paced}${gain}adelay=${Math.max(0, delayMs - Math.round(lead * 1000))}:all=1[s${index}]`
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
    // The music from its start point, faded in when asked (the fade out is on the whole mix).
    const musicStart = normalizeMusicStartSec(input.sound?.musicStartSec);
    const fadeIn = normalizeMusicFadeInSec(input.sound?.musicFadeInSec);
    const bed =
      `[${audioIndex}:a]${stereo},atrim=${musicStart}:${musicStart + end},asetpts=PTS-STARTPTS${musicGain}` +
      (fadeIn > 0 ? `,afade=t=in:st=0:d=${fadeIn}` : '');
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
  // Ambience: looped room tone under everything, at its own level.
  if (input.ambienceInput != null) {
    const level = normalizeAmbienceLevel(input.sound?.ambienceLevel);
    parts.push(
      `[${input.ambienceInput}:a]${stereo},atrim=0:${end},asetpts=PTS-STARTPTS,volume=${level},${fadeOut}[amb]`
    );
    if (audioLabel) {
      parts.push(`[${audioLabel}][amb]amix=inputs=2:duration=first:normalize=0[amix]`);
      audioLabel = 'amix';
    } else {
      audioLabel = 'amb';
    }
  }

  if (input.sharpen) {
    parts.push(`[${videoLabel}]unsharp=5:5:0.55:5:5:0[vsharp]`);
    videoLabel = 'vsharp';
  }
  // A logo / watermark over the whole film, slightly see-through.
  if (input.logo) {
    const logoWidth = Math.round((width * LOGO_WIDTH) / 2) * 2;
    parts.push(
      `[${input.logo.input}:v]scale=${logoWidth}:-2,format=rgba,colorchannelmixer=aa=0.85[logo]`
    );
    parts.push(
      `[${videoLabel}][logo]overlay=${overlayFfmpegXY(input.logo.corner, Math.round(Math.min(width, height) * OVERLAY_MARGIN))}:shortest=1[vlogo]`
    );
    videoLabel = 'vlogo';
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
    const soundLeads: number[] = [];
    const soundTails: number[] = [];

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
      // J / L cut: what the file has before the in point / after the out point (cut-sound.ts).
      const wantsOverlap =
        shot.kind === 'clip' && ((shot.soundLeadSec ?? 0) > 0 || (shot.soundTailSec ?? 0) > 0);
      const overlapFull = wantsOverlap
        ? (fullSec ?? (await clipDurationSec(ffmpeg, filePath)) ?? soundSec)
        : null;
      const playsSec = trim && trimmedSec > 0 ? trimmedSec / speed : (overlapFull ?? soundSec ?? 0);
      const overlap = wantsOverlap
        ? soundOverlap({
            fromSec: trim?.start ?? 0,
            holdSec: playsSec,
            fullSec: overlapFull,
            speed,
            reverse: shot.reverse === true,
            leadSec: shot.soundLeadSec,
            tailSec: shot.soundTailSec,
          })
        : { leadSec: 0, tailSec: 0 };
      soundLeads.push(overlap.leadSec);
      soundTails.push(overlap.tailSec);
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

    // Overlays (cut-overlay.ts): each shot's picture-in-picture and the film's logo.
    const fetchOverlay = async (url: string, name: string): Promise<string | null> => {
      try {
        const fetched = await fetchShotBytes(url, requestOrigin, undefined, options.userId);
        const file = path.join(/* turbopackIgnore: true */ workDir, name);
        // One PNG frame, whatever came (a clip's first frame, an animated WebP's first page).
        const sharp = (await import('sharp')).default;
        await fs.writeFile(
          /* turbopackIgnore: true */ file,
          await sharp(fetched.buffer, { page: 0 }).png().toBuffer()
        );
        return file;
      } catch {
        return null;
      }
    };
    const pipFiles: Array<{ path: string; corner: OverlayCorner } | null> = [];
    for (const [index, shot] of shots.entries()) {
      const url = shot.pipUrl?.trim();
      const file = url ? await fetchOverlay(url, `pip-${index}.png`) : null;
      pipFiles.push(
        file ? { path: file, corner: normalizeOverlayCorner(shot.pipCorner, 'tr') } : null
      );
    }
    const logoFile = options.logo?.url?.trim()
      ? await fetchOverlay(options.logo.url.trim(), 'logo.png')
      : null;

    // Ambience: a room tone looped under the whole film (cut-sound.ts).
    let ambiencePath: string | null = null;
    const ambience = options.sound?.ambienceUrl?.trim();
    if (ambience) {
      try {
        options.onProgress?.(0.43, 'Fetching ambience…');
        const fetched = await fetchShotBytes(ambience, requestOrigin, undefined, options.userId);
        ambiencePath = path.join(/* turbopackIgnore: true */ workDir, 'ambience.audio');
        await fs.writeFile(/* turbopackIgnore: true */ ambiencePath, fetched.buffer);
      } catch {
        options.onProgress?.(0.43, 'Ambience could not be fetched — left out');
      }
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
      (options.subtitles && shots.some(shot => filmShotSubtitle(shot))) ||
      shots.some(shot => shot.lowerThird?.trim())
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
    /** Every subtitle phrase with its graph shot, for the .srt. */
    const filmCues: Array<{ shot: number; cue: SubtitleCue }> = [];
    const graphSpeech: boolean[] = [];
    const graphTrims: Array<number | null> = [];
    const graphTransitions: Array<CutTransitionIn | undefined> = [];
    const graphMotions: Array<'in' | 'out' | 'none' | 'custom' | undefined> = [];
    const graphMoves: Array<{ from: FramePoint; to: FramePoint; box?: PictureBox } | null> = [];
    const graphVolumes: Array<number | undefined> = [];
    const graphGrades: string[] = [];
    const graphSpeeds: number[] = [];
    const graphReverses: boolean[] = [];
    const graphReframes: Array<string | null> = [];
    /** Per graph shot: its picture-in-picture file and corner. */
    const graphPipFiles: Array<{ path: string; corner: OverlayCorner } | null> = [];
    const graphLeads: number[] = [];
    const graphTails: number[] = [];
    const inputArgs: string[][] = [];
    // Smooth motion: each clip under 25 fps gets RIFE's in-between frames (same length).
    if (options.smoothMotion) {
      const { smoothClipFile } = await import('./cut-smooth-server');
      for (const [i, file] of localFiles.entries()) {
        if (kinds[i] !== 'clip') continue;
        options.onProgress?.(0.44, `Smoothing motion (${i + 1} of ${localFiles.length})…`);
        try {
          let source = file;
          if (/\.(webp|gif)$/i.test(file)) {
            const { animatedToMp4 } = await import('./cut-project-export-server');
            source = `${file}.mp4`;
            await animatedToMp4(
              ffmpeg,
              await fs.readFile(/* turbopackIgnore: true */ file),
              source
            );
          }
          const out = `${file}.smooth.mp4`;
          if (await smoothClipFile({ ffmpeg, file: source, out })) localFiles[i] = out;
          else if (source !== file) localFiles[i] = source;
        } catch {
          options.onProgress?.(0.44, 'A clip could not be smoothed — kept as made');
        }
      }
    }
    // Vertical / square: each wider shot's crop follows the face instead of the centre.
    const shotReframes: Array<string | null> =
      height >= width && options.followFaces !== false
        ? await (async () => {
            options.onProgress?.(0.44, 'Finding faces to frame…');
            const out: Array<string | null> = [];
            for (const [i, file] of localFiles.entries()) {
              out.push(
                await shotReframeFilter({
                  file,
                  kind: kinds[i]!,
                  trimStart: trimStarts[i],
                  // A silent, untrimmed clip has no hold yet: the graph plays 4 s of it.
                  playSec: (holdSecs[i] && holdSecs[i]! > 0 ? holdSecs[i]! : 4) * (speeds[i] ?? 1),
                  reverse: reverses[i] === true,
                  output: { width, height },
                }).catch(() => null)
              );
            }
            return out;
          })()
        : localFiles.map(() => null);
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
      graphReframes.push(null);
      graphPipFiles.push(null);
      graphLeads.push(0);
      graphTails.push(0);
      graphTransitions.push(undefined);
      graphMotions.push(undefined);
      graphMoves.push(null);
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
      graphReframes.push(shotReframes[i] ?? null);
      graphPipFiles.push(pipFiles[i] ?? null);
      graphLeads.push(soundLeads[i] ?? 0);
      graphTails.push(soundTails[i] ?? 0);
      graphTransitions.push(shots[i]?.transitionIn);
      graphMotions.push(shots[i]?.motion);
      graphMoves.push(
        kinds[i] === 'still' && shots[i]?.motion === 'custom'
          ? {
              from: framingPoint(shots[i]!.moveFrom),
              to: framingPoint(shots[i]!.moveTo),
              // A wide frame letterboxes a different-shaped still: the move stays on the picture.
              box:
                height >= width
                  ? FULL_BOX
                  : await (async () => {
                      const sharp = (await import('sharp')).default;
                      const meta = await sharp(localFiles[i]!)
                        .metadata()
                        .catch(() => null);
                      return meta?.width && meta.height
                        ? containBox({ width: meta.width, height: meta.height }, { width, height })
                        : FULL_BOX;
                    })(),
            }
          : null
      );
      graphVolumes.push(shots[i]?.volume);
      graphSpeech.push(speech[i] === true);
      graphTrims.push(trimStarts[i] ?? null);
      graphKinds.push(kinds[i]!);
      graphHolds.push(holdSecs[i]!);
      graphText.push({
        lowerThirdFile: shots[i]?.lowerThird
          ? await writeText(`lower-${i}.txt`, shots[i]!.lowerThird!)
          : null,
        lowerThirdSubFile: shots[i]?.lowerThirdSub
          ? await writeText(`lower-sub-${i}.txt`, shots[i]!.lowerThirdSub!)
          : null,
        captionFile: options.captions
          ? await writeText(`caption-${i}.txt`, shots[i] ? filmShotCaption(shots[i]) : '')
          : null,
        speechCues: await (async () => {
          const line = options.subtitles && shots[i] ? filmShotSubtitle(shots[i]) : '';
          if (!line || !usableFont) return undefined;
          // When it is spoken in the shot: the narration's own file, else the clip's sound over
          // what plays (shot seconds; a sped-up clip's sound is faster too).
          const hold = holdSecs[i] && holdSecs[i]! > 0 ? holdSecs[i]! : kinds[i] === 'clip' ? 4 : 3;
          const narration = narrationFiles.find(entry => entry.shot === i);
          const speed = speeds[i] ?? 1;
          // Where it shows when set in Cut (M4 F5), else where it is said.
          const set = shots[i]!;
          const span = set.subtitleCues?.length
            ? null
            : set.subtitleFromSec !== undefined || set.subtitleToSec !== undefined
              ? {
                  from: set.subtitleFromSec ?? 0.2,
                  to: set.subtitleToSec ?? hold - 0.2,
                }
              : narration
                ? await speechSpan(ffmpeg, narration.path, 0, hold)
                : kinds[i] === 'clip'
                  ? await speechSpan(ffmpeg, localFiles[i]!, trimStarts[i] ?? 0, hold * speed).then(
                      found => (found ? { from: found.from / speed, to: found.to / speed } : null)
                    )
                  : null;
          // Your own timed cues (M10 T3), kept inside the shot; else the line split over its span.
          const cues = set.subtitleCues?.length
            ? set.subtitleCues.flatMap(cue => {
                const from = Math.min(hold, cue.fromSec);
                const to = Math.min(hold, cue.toSec);
                return to > from ? [{ text: cue.text, from, to }] : [];
              })
            : subtitleCues(line, {
                from: Math.min(hold, span?.from ?? 0.2),
                to: Math.min(hold, span?.to ?? hold - 0.2),
              });
          const out: Array<{ file: string; from: number; to: number }> = [];
          for (const [k, cue] of cues.entries()) {
            const file = await writeRawText(
              `speech-${i}-${k}.txt`,
              subtitleLines(cue.text, Math.round(width / (subtitleWrapSize * 0.55)))
            );
            if (file) out.push({ file, from: cue.from, to: cue.to });
            filmCues.push({ shot: graphKinds.length - 1, cue });
          }
          return out.length ? out : undefined;
        })(),
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
      if (
        kinds[i] === 'still' &&
        ((options.stillMotion && shots[i]?.motion !== 'none') || shots[i]?.motion === 'custom')
      ) {
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
        // The picture only: its sound is read from its own input (below, M6 D17).
        inputArgs.push(['-an', '-i', localFiles[i]!]);
      }
    }

    if (titleAt === localFiles.length) await pushTitle();
    /** Graph position of shot i (the title card takes one slot before shot `titleAt`). */
    const graphIndexOf = (i: number) => (titleAt >= 0 && i >= titleAt ? i + 1 : i);

    // The .srt: each phrase at its shot's place in the film.
    const shotStarts = filmShotStarts({
      kinds: graphKinds,
      holdSecs: graphHolds,
      crossfadeSec,
      transitions: graphTransitions,
    });
    const subtitlesSrt = filmCues.length
      ? cuesToSrt(
          filmCues.map(({ shot, cue }) => ({
            text: cue.text,
            from: (shotStarts[shot] ?? 0) + cue.from,
            to: (shotStarts[shot] ?? 0) + cue.to,
          }))
        )
      : undefined;
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
      stillMoves: graphMoves,
      volumes: graphVolumes,
      grades: graphGrades,
      speeds: graphSpeeds,
      reverses: graphReverses,
      reframes: graphReframes,
      sharpen: options.sharpen === true,
      soundLeads: graphLeads,
      soundTails: graphTails,
      sound: options.sound,
      // After the shots, the music bed and the narration tracks.
      ambienceInput: ambiencePath
        ? graphKinds.length + (audioPath ? 1 : 0) + narrationFiles.length
        : null,
      // Then the overlay pictures, in shot order, and the logo.
      pips: (() => {
        let next =
          graphKinds.length + (audioPath ? 1 : 0) + narrationFiles.length + (ambiencePath ? 1 : 0);
        return graphPipFiles.map(pip => (pip ? { input: next++, corner: pip.corner } : null));
      })(),
      logo: logoFile
        ? {
            input:
              graphKinds.length +
              (audioPath ? 1 : 0) +
              narrationFiles.length +
              (ambiencePath ? 1 : 0) +
              graphPipFiles.filter(Boolean).length,
            corner: normalizeOverlayCorner(options.logo?.corner, 'br'),
          }
        : null,
      // After every other input: one sound-only input per clip, in shot order (M6 D17).
      clipAudioInputs: (() => {
        let next =
          graphKinds.length +
          (audioPath ? 1 : 0) +
          narrationFiles.length +
          (ambiencePath ? 1 : 0) +
          graphPipFiles.filter(Boolean).length +
          (logoFile ? 1 : 0);
        const out: Array<number | null> = graphKinds.map(() => null);
        for (const [i] of localFiles.entries()) {
          if (kinds[i] === 'clip') out[graphIndexOf(i)] = next++;
        }
        return out;
      })(),
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
    if (ambiencePath) {
      args.push('-stream_loop', '-1', '-i', ambiencePath);
    }
    for (const pip of graphPipFiles) {
      if (pip) args.push('-loop', '1', '-i', pip.path);
    }
    if (logoFile) args.push('-loop', '1', '-i', logoFile);
    // Each clip's sound-only inputs, last (no input before them moves), as clipAudioInputs said.
    for (const [i, file] of localFiles.entries()) {
      if (kinds[i] === 'clip') args.push('-vn', '-i', file);
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
      ...(subtitlesSrt ? { subtitlesSrt } : {}),
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
