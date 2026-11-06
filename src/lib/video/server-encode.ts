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
  clipMoveFilter,
  creditsDurationSec,
  creditsTypeSize,
  normalizeFilmCredits,
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
  normalizeCutaway,
  normalizeOverlayCorner,
  overlayFfmpegXY,
  type OverlayCorner,
} from './cut-overlay';
import {
  normalizeSubtitleStyle,
  subtitleDrawSettings,
  wordChunks,
  type SubtitleStyle,
} from './subtitle-style';
import { cuesToSrt, speechSpanFromSilence, subtitleCues, type SubtitleCue } from './cut-subtitles';
import {
  effectsFilterParts,
  heardEffects,
  normalizeAmbienceLevel,
  normalizeMusicFadeInSec,
  normalizeMusicFadeOutSec,
  normalizeMusicStartSec,
  levelKeysExpr,
  normalizeCutLevelKeys,
  soundOverlap,
  VOICE_CLEANUP_FILTERS,
  EVEN_VOICES_FILTERS,
  type CutLevelKey,
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
import { loadStoredLut, lutToCube, type StoredLut } from './cut-lut';
import type { ContentCredentialsRequest, ContentCredentialsResult } from './content-credentials';
import { signFilmWithContentCredentials } from './content-credentials-server';
import type { ZipDiskEntry } from '../gallery/zip-stream';
import {
  chaptersFfmetadata,
  chaptersForFile,
  filmCodec,
  loudnormFilters,
  longFormChunks,
  mergeSrt,
  normalizeFilmRange,
  shiftSrt,
  parseLoudnormMeasure,
  srtForRange,
  type FilmChapter,
  type FilmRange,
  type FilmStemName,
} from './film-finish';
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
  /** How the subtitles look (subtitle-style.ts); classic when unset. */
  subtitleStyle?: SubtitleStyle;
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
  /** Just this part of the film, in the Cut monitor's seconds (film-finish.ts). */
  range?: FilmRange | null;
  /** Chapter marks (Cut's markers), in the monitor's seconds: written into the MP4. */
  chapters?: FilmChapter[];
  /** Shots before the ones the monitor shows (a "Previously on" recap): times move past them. */
  leadShots?: number;
  /** Bring the film to this loudness (the export profile's target; film-finish.ts). */
  loudness?: { lufs: number; peakDbtp: number } | null;
  /** Also write the mix's stems — dialogue, music, ambience, effects — as WAVs in a .zip. */
  stems?: boolean;
  /** The subtitles as a track in the MP4 too (players turn it on and off; mov_text). */
  subtitleTrack?: boolean;
  /** Sign the film with Content Credentials (C2PA): made with AI, in Castcut, by these engines. */
  contentCredentials?: ContentCredentialsRequest | null;
  /** End credits, one line each, rolled after the last shot (polish.ts). */
  credits?: string[];
  /** A master: ProRes 422 HQ and 24-bit PCM in a .mov (film-finish.ts filmCodec). */
  master?: boolean;
  /** "REVIEW" and the film's running timecode burned into the picture, top left. */
  reviewBurnIn?: boolean;
  /** Match every shot's colour to this one (its index in the shots) instead of the film's middle. */
  matchTo?: number | null;
  /** The film's LUT as the cut keeps it (cut-lut.ts). */
  lut?: StoredLut | null;
  userId?: string | null;
  onProgress?: (ratio: number, label: string) => void;
};

export type FilmServerEncodeResult = {
  buffer: Buffer;
  mimeType: 'video/mp4' | 'video/quicktime';
  extension: 'mp4' | 'mov';
  width: number;
  height: number;
  /** The film's subtitles as an .srt (when subtitles are on and anything is spoken). */
  subtitlesSrt?: string;
  /** Whether the film was signed with Content Credentials (asked for, and how it went). */
  contentCredentials?: ContentCredentialsResult;
  /** The chapters as written into the file (file seconds) — for a video description. */
  chapters?: FilmChapter[];
  /** The stems (dialogue, music, ambience, effects WAVs) as a .zip, when asked for. */
  stemsZip?: Buffer;
  /** Where the shots the monitor shows start, after a recap (seconds). */
  leadOffsetSec?: number;
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
  speechCues?: Array<{
    file: string;
    from: number;
    to: number;
    /** Outlined subtitle looks: one file per line, each drawn centred (subtitle-style.ts). */
    lines?: string[];
  }>;
  titleFile?: string | null;
  subtitleFile?: string | null;
  /** End credits: one file per line (empty lines are gaps), rolled up over the card. */
  creditsLines?: Array<string | null>;
};

/**
 * Quote a value for a filtergraph option (paths, expressions). ffmpeg treats single-quoted text
 * literally, so callers never pass values containing a quote (see `usableFilterPath`).
 */
/** The fade at each end of a clip's piece of sound (s): too short to hear, long enough not to click. */
const EDGE_FADE_SEC = 0.008;

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
  /** The effects track (cut-sound.ts, M10 T4): each placed sound's input, film time and level. */
  effectInputs?: ReadonlyArray<{
    input: number;
    atSec: number;
    level?: number;
    lengthSec?: number;
    /** A music cue: it joins the music bed and ducks under the lines (Part 19 G4). */
    duck?: boolean;
  }>;
  /**
   * Per shot: the input to read a clip's sound from (its own sound-only input), else the clip's
   * own input. M6 D17: the sound is mixed in parallel, so reading it from the picture's input
   * decoded every clip from the start and held its frames until its turn (26 GB for 60 clips).
   */
  clipAudioInputs?: ReadonlyArray<number | null | undefined>;
  /** Per shot: a face-following scale + crop in place of the centre crop (cut-reframe.ts). */
  reframes?: ReadonlyArray<string | null | undefined>;
  /** Per shot: a picture-in-picture (its looped picture's input index and corner). */
  pips?: ReadonlyArray<
    | {
        input: number;
        corner: OverlayCorner;
        /** Full frame over this window of the shot (its seconds) instead of in a corner. */
        cutaway?: { fromSec: number; toSec: number } | null;
        /** The input is a clip: it starts playing at the window's start (not a looped picture). */
        clip?: boolean;
      }
    | null
    | undefined
  >;
  /** A logo / watermark over the whole film. */
  logo?: { input: number; corner: OverlayCorner } | null;
  /** A light unsharp mask over the finished picture (before the logo). */
  sharpen?: boolean;
  /** How the subtitles look (subtitle-style.ts). */
  subtitleStyle?: SubtitleStyle;
  /** Also tap the mix's parts as stems: dialogue, music, ambience, effects (a mixer's handoff). */
  stems?: boolean;
  /** A .cube file applied to every shot after its grade (the film's LUT). */
  lutFile?: string | null;
  /** Per shot: a clip's sound level points (shot seconds; cut-sound.ts). */
  volumeKeys?: ReadonlyArray<CutLevelKey[] | undefined>;
  /** "REVIEW" and the running timecode over the whole film (needs the font). */
  reviewBurnIn?: boolean;
  /** Per shot: a clip's punch-in or pull-back. */
  clipMoves?: ReadonlyArray<'in' | 'out' | undefined>;
}): {
  filter: string;
  videoLabel: string;
  audioLabel: string | null;
  durationSec: number;
  /** With `stems`: each stem's output label, as long as the film (film-finish.ts STEM names). */
  stems?: Array<{ name: FilmStemName; label: string }>;
} {
  const { shotCount, kinds, holdSecs, width, height, crossfadeSec, hasAudioBed } = input;
  const centreFit = buildFilmScaleFilter(width, height);
  const font = input.fontFile ? q(input.fontFile) : null;
  const captionSize = Math.round(Math.min(width, height) * 0.045);
  const margin = Math.round(Math.min(width, height) * 0.06);
  const subtitleLook = subtitleDrawSettings(
    normalizeSubtitleStyle(input.subtitleStyle),
    width,
    height,
    margin
  );

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
    if (kind === 'title' && text?.creditsLines?.length) {
      // End credits: each line centred on its own, the block rolling up (polish.ts creditsRollTop).
      const { size, gap } = creditsTypeSize(width, height);
      const lines = text.creditsLines;
      const blockHeight = lines.length * (size + gap) - gap;
      const draws = font
        ? lines.flatMap((file, k) =>
            file
              ? [
                  `drawtext=fontfile=${font}:textfile=${q(file)}:fontcolor=white:fontsize=${size}:x=(w-tw)/2:y=${q(`h-(h+${blockHeight})*t/${hold}+${k * (size + gap)}`)}`,
                ]
              : []
          )
        : [];
      chain = [
        `[${i}:v]format=yuv420p,setsar=1`,
        ...draws,
        `fps=${STILL_MOTION_FPS},trim=duration=${hold},setpts=PTS-STARTPTS`,
      ].join(',');
    } else if (kind === 'title') {
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
    // A clip's punch-in / pull-back over what plays (the fitted frame scaled, cropped back).
    const clipMove = kind === 'clip' ? input.clipMoves?.[i] : undefined;
    if (clipMove) chain += `,${clipMoveFilter(clipMove, hold, width, height)}`;
    // The grade before any text, so captions and subtitles keep their own colour.
    if (kind !== 'title' && input.grades?.[i]) chain += `,${input.grades[i]}`;
    // The film's LUT (cut-lut.ts), after the shot's grade and the look.
    if (kind !== 'title' && input.lutFile)
      chain += `,lut3d=file=${q(input.lutFile)}:interp=tetrahedral`;
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
      `,drawtext=fontfile=${font}:textfile=${q(file)}:${subtitleLook.draw}`;
    if (kind !== 'title' && font && text?.speechCues?.length) {
      // Timed subtitles: each phrase while it is spoken.
      for (const cue of text.speechCues) {
        const enable = `:enable=${q(`between(t,${cue.from.toFixed(3)},${cue.to.toFixed(3)})`)}`;
        chain +=
          cue.lines?.length && subtitleLook.lineAt
            ? cue.lines
                .map(
                  (file, index) =>
                    `,drawtext=fontfile=${font}:textfile=${q(file)}:${subtitleLook.lineAt!(index, cue.lines!.length)}${enable}`
                )
                .join('')
            : `${subtitleDraw(cue.file)}${enable}`;
      }
    } else if (kind !== 'title' && font && text?.speechFile) {
      // Subtitles: bottom centre for the whole shot, wrapped by the writer (subtitleLines).
      chain += subtitleDraw(text.speechFile);
    }
    // setpts leaves the frame rate unknown, and ffmpeg 7's xfade rejects that ("inputs needs to
    // be a constant frame rate") — so every shot ends on a fixed rate.
    const pip = kind !== 'title' ? input.pips?.[i] : null;
    if (pip?.cutaway) {
      // A cutaway: the picture full frame over part of the shot; the shot's sound goes on.
      parts.push(`${chain},fps=${STILL_MOTION_FPS}[${label}b]`);
      const { fromSec, toSec } = pip.cutaway;
      // A clip: its first frame at the window's start, stopped at its end, then the shot again.
      const timing = pip.clip
        ? `trim=duration=${(toSec - fromSec).toFixed(3)},setpts=PTS-STARTPTS+${fromSec}/TB,`
        : '';
      parts.push(
        `[${pip.input}:v]${timing}scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=yuv420p[${label}p]`
      );
      parts.push(
        `[${label}b][${label}p]overlay=0:0:${pip.clip ? 'eof_action=pass' : 'shortest=1'}:enable=${q(`between(t,${fromSec},${toSec})`)},fps=${STILL_MOTION_FPS}[${label}]`
      );
    } else if (pip) {
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
  // Stems (input.stems): a label split in two — one on into the mix, one out as its own track,
  // padded to the film's length (and faded out with it when the mix fades it later).
  const stems: Array<{ name: FilmStemName; label: string }> = [];
  const stemTap = (from: string, mixLabel: string, name: FilmStemName, fade: boolean) => {
    parts.push(`[${from}]asplit=2[${mixLabel}][st_${name}_raw]`);
    parts.push(
      `[st_${name}_raw]apad=whole_dur=${end},atrim=0:${end}${fade ? `,${fadeOut}` : ''}[st_${name}]`
    );
    stems.push({ name, label: `st_${name}` });
  };
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
  // Voice cleanup (cut-sound.ts): on each clip's sound and each narration, before its level.
  const cleanup = input.sound?.voiceCleanup === true ? VOICE_CLEANUP_FILTERS : '';
  // The music's level points: a volume that follows the line through the film (film seconds).
  const musicKeysExpr = levelKeysExpr(normalizeCutLevelKeys(input.sound?.musicKeys));
  const musicKeys = musicKeysExpr ? `,volume=${q(musicKeysExpr)}:eval=frame` : '';
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
    // The clip's own level points (shot seconds), moved past a J cut's early sound.
    const keyExpr = levelKeysExpr(
      normalizeCutLevelKeys(input.volumeKeys?.[index]).map(key => ({
        ...key,
        atSec: key.atSec + lead,
      }))
    );
    const keyed = keyExpr ? `volume=${q(keyExpr)}:eval=frame,` : '';
    // A few milliseconds faded in and out at the piece's edges: a hard cut lands mid-waveform,
    // and without them it clicks.
    const pieceSec = holdSec + (lead + tail) / speed;
    const edgeFades =
      pieceSec > 4 * EDGE_FADE_SEC
        ? `afade=t=in:st=0:d=${EDGE_FADE_SEC},afade=t=out:st=${(pieceSec - EDGE_FADE_SEC).toFixed(3)}:d=${EDGE_FADE_SEC},`
        : '';
    // The clip's own level (Cut's shot list) on top of the Lines level.
    const own = input.volumes?.[index];
    const gain =
      typeof own === 'number' && own !== 1
        ? `volume=${Number((voiceLevel * own).toFixed(3))},`
        : voiceGain;
    parts.push(
      `[${input.clipAudioInputs?.[index] ?? index}:a]${stereo},atrim=${Math.max(0, from - lead)}:${from + holdSec * speed + tail},asetpts=PTS-STARTPTS,${cleanup}${paced}${gain}${keyed}${edgeFades}adelay=${Math.max(0, delayMs - Math.round(lead * 1000))}:all=1[s${index}]`
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
        `[${entry.input}:a]${stereo},asetpts=PTS-STARTPTS,${cleanup}${voiceGain}adelay=${Math.round(start * 1000)}:all=1[n${entry.shot}]`
      );
      narrationLabels.push(`[n${entry.shot}]`);
    }
  }
  const speechCount = voiced.length + narrationLabels.length;
  if (speechCount > 0) {
    const speechLabels =
      voiced.map(({ index }) => `[s${index}]`).join('') + narrationLabels.join('');
    parts.push(
      `${speechLabels}${speechCount > 1 ? `amix=inputs=${speechCount}:duration=longest:normalize=0` : 'anull'},${input.sound?.evenVoices === true ? EVEN_VOICES_FILTERS : ''}apad=whole_dur=${end}${input.stems ? '[speech0]' : '[speech]'}`
    );
    if (input.stems) stemTap('speech0', 'speech', 'dialogue', true);
  }
  // Music cues (temp music by scene, Part 19 G4): placed like effects, but part of the music bed —
  // under the score when there is one, the whole bed when not — so they duck under the lines.
  const cues = effectsFilterParts({
    effects: (input.effectInputs ?? []).filter(effect => effect.duck),
    endSec: end,
    stereo,
    fadeOut: 'anull',
    label: 'cue',
  });
  if (cues) parts.push(...cues.parts);
  if (hasAudioBed || cues) {
    if (hasAudioBed) {
      const audioIndex = shotCount;
      // The music from its start point, faded in when asked (the fade out is on the whole mix).
      const musicStart = normalizeMusicStartSec(input.sound?.musicStartSec);
      const fadeIn = normalizeMusicFadeInSec(input.sound?.musicFadeInSec);
      parts.push(
        `[${audioIndex}:a]${stereo},atrim=${musicStart}:${musicStart + end},asetpts=PTS-STARTPTS${musicGain}${musicKeys}` +
          (fadeIn > 0 ? `,afade=t=in:st=0:d=${fadeIn}` : '') +
          `,apad=whole_dur=${end}${cues ? '[score]' : '[bed]'}`
      );
      if (cues) parts.push(`[score][cue]amix=inputs=2:duration=first:normalize=0[bed]`);
    } else {
      parts.push(`[cue]anull[bed]`);
    }
    if (speechCount > 0) {
      // Duck the music under the lines, then lay the lines on top.
      parts.push(`[speech]asplit=2[sp1][sp2]`);
      parts.push(
        `[bed][sp1]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400${input.stems ? '[ducked0]' : '[ducked]'}`
      );
      // The music stem is the music as it is in the mix: ducked under the lines.
      if (input.stems) stemTap('ducked0', 'ducked', 'music', true);
      parts.push(
        `[ducked][sp2]amix=inputs=2:duration=first:normalize=0,atrim=0:${end},${fadeOut}[aout]`
      );
    } else {
      parts.push(`[bed]atrim=0:${end},${fadeOut}${input.stems ? '[aout0]' : '[aout]'}`);
      if (input.stems) stemTap('aout0', 'aout', 'music', false);
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
      `[${input.ambienceInput}:a]${stereo},atrim=0:${end},asetpts=PTS-STARTPTS,volume=${level},${fadeOut}${input.stems ? '[amb0]' : '[amb]'}`
    );
    if (input.stems) stemTap('amb0', 'amb', 'ambience', false);
    if (audioLabel) {
      parts.push(`[${audioLabel}][amb]amix=inputs=2:duration=first:normalize=0[amix]`);
      audioLabel = 'amix';
    } else {
      audioLabel = 'amb';
    }
  }
  // Effects: each placed sound at its time, on top of everything (they don't duck the music).
  const effects = effectsFilterParts({
    effects: (input.effectInputs ?? []).filter(effect => !effect.duck),
    endSec: end,
    stereo,
    fadeOut,
  });
  if (effects) {
    parts.push(...effects.parts);
    if (input.stems) {
      parts.push(`[${effects.label}]asplit=2[fxmix][st_effects_raw]`);
      parts.push(`[st_effects_raw]apad=whole_dur=${end},atrim=0:${end}[st_effects]`);
      stems.push({ name: 'effects', label: 'st_effects' });
      effects.label = 'fxmix';
    }
    if (audioLabel) {
      parts.push(`[${audioLabel}][${effects.label}]amix=inputs=2:duration=first:normalize=0[afx]`);
      audioLabel = 'afx';
    } else {
      audioLabel = effects.label;
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
  // A review copy: REVIEW and the film's timecode (30 fps, as Cut's monitor counts it), top left,
  // over everything — reviewers quote the exact frame, and a copy that gets out is marked.
  if (input.reviewBurnIn && font) {
    const size = Math.round(Math.min(width, height) * 0.035);
    const pad = Math.round(Math.min(width, height) * 0.03);
    parts.push(
      // Two lines (drawtext drops a trailing space, so "REVIEW " ran into the timecode).
      `[${videoLabel}]drawtext=fontfile=${font}:text='REVIEW':fontcolor=white@0.9:fontsize=${size}:box=1:boxcolor=black@0.5:boxborderw=${Math.round(size * 0.35)}:x=${pad}:y=${pad},` +
        `drawtext=fontfile=${font}:timecode='00\\:00\\:00\\:00':timecode_rate=${STILL_MOTION_FPS}:fontcolor=white@0.9:fontsize=${size}:box=1:boxcolor=black@0.5:boxborderw=${Math.round(size * 0.35)}:x=${pad}:y=${pad + Math.round(size * 1.6)}[vreview]`
    );
    videoLabel = 'vreview';
  }
  return {
    filter: parts.join(';'),
    videoLabel,
    audioLabel,
    durationSec: total,
    ...(input.stems ? { stems } : {}),
  };
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
    const pipFiles: Array<{
      path: string;
      corner: OverlayCorner;
      cutaway?: { fromSec: number; toSec: number } | null;
      /** A moving cutaway: the file is a clip, read as it plays (not looped). */
      clip?: boolean;
    } | null> = [];
    for (const [index, shot] of shots.entries()) {
      const url = shot.pipUrl?.trim();
      const cutaway = shot.pipFull ? normalizeCutaway(shot.pipFromSec, shot.pipToSec) : null;
      // A clip cutaway is fetched as a clip (an animated WebP made an MP4 first).
      const clipFile =
        url && cutaway && shot.pipKind === 'clip'
          ? await fetchShotBytes(url, requestOrigin, undefined, options.userId)
              .then(async fetched => {
                const file = path.join(/* turbopackIgnore: true */ workDir, `pip-${index}.bin`);
                const { writeClipSource } = await import('../clip/clip-source-server');
                await writeClipSource(ffmpeg, fetched.buffer, file);
                return file;
              })
              .catch(() => null)
          : null;
      const file = clipFile ?? (url ? await fetchOverlay(url, `pip-${index}.png`) : null);
      pipFiles.push(
        file
          ? {
              path: file,
              corner: normalizeOverlayCorner(shot.pipCorner, 'tr'),
              cutaway,
              ...(clipFile ? { clip: true } : {}),
            }
          : null
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

    // The effects track (M10 T4): each placed sound the cut hears.
    const effectFiles: Array<{
      path: string;
      atSec: number;
      level?: number;
      lengthSec?: number;
      duck?: boolean;
    }> = [];
    for (const [k, effect] of heardEffects(options.sound).entries()) {
      try {
        const fetched = await fetchShotBytes(effect.url, requestOrigin, undefined, options.userId);
        const filePath = path.join(/* turbopackIgnore: true */ workDir, `effect-${k}.audio`);
        await fs.writeFile(/* turbopackIgnore: true */ filePath, fetched.buffer);
        effectFiles.push({
          path: filePath,
          atSec: effect.atSec,
          level: effect.level,
          ...(effect.lengthSec ? { lengthSec: effect.lengthSec } : {}),
          ...(effect.duck ? { duck: true } : {}),
        });
      } catch {
        options.onProgress?.(
          0.43,
          `${effect.name || 'A sound effect'} could not be fetched — left out`
        );
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
      options.reviewBurnIn ||
      options.credits?.some(line => line.trim()) ||
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

    const subtitleStyle = normalizeSubtitleStyle(options.subtitleStyle);
    const subtitleWrapSize = subtitleDrawSettings(subtitleStyle, width, height, 0).size;
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
    const graphPipFiles: Array<(typeof pipFiles)[number]> = [];
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
    const handGrades = localFiles.map((_, i) => shots[i]?.grade);
    const shotGrades =
      look !== 'none' || options.matchShots || handGrades.some(Boolean)
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
              matchTo: options.matchTo ?? null,
              grades: handGrades,
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
          // Timed for the burned-in subtitles, and for the subtitle track (which needs no font).
          const line =
            (options.subtitles || options.subtitleTrack) && shots[i]
              ? filmShotSubtitle(shots[i])
              : '';
          if (!line || (!usableFont && !options.subtitleTrack)) return undefined;
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
          // Word by word: what the .srt keeps is the whole phrase; the picture shows a few words.
          for (const cue of cues) filmCues.push({ shot: graphKinds.length - 1, cue });
          // A track only: timed, not drawn.
          if (!options.subtitles || !usableFont) return undefined;
          const drawn = subtitleStyle === 'words' ? wordChunks(cues) : cues;
          for (const [k, cue] of drawn.entries()) {
            const wrapped = subtitleLines(cue.text, Math.round(width / (subtitleWrapSize * 0.55)));
            const file = await writeRawText(`speech-${i}-${k}.txt`, wrapped);
            if (!file) continue;
            // Outlined looks: each line its own file, drawn centred.
            const lines =
              subtitleStyle === 'classic'
                ? []
                : (
                    await Promise.all(
                      wrapped
                        .split('\n')
                        .map((line, at) => writeRawText(`speech-${i}-${k}-${at}.txt`, line))
                    )
                  ).filter((line): line is string => Boolean(line));
            out.push({ file, from: cue.from, to: cue.to, ...(lines.length ? { lines } : {}) });
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
    // End credits: a black card after the last shot, the lines rolling up (the music runs on).
    const creditLines = normalizeFilmCredits((options.credits ?? []).join('\n'));
    if (creditLines.length && usableFont) {
      const creditsSec = creditsDurationSec(creditLines);
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
      graphHolds.push(creditsSec);
      graphText.push({
        creditsLines: await Promise.all(
          creditLines.map((line, k) =>
            line ? writeRawText(`credits-${k}.txt`, sanitizeFilmCaption(line)) : null
          )
        ),
      });
      inputArgs.push([
        '-f',
        'lavfi',
        '-t',
        String(creditsSec),
        '-i',
        `color=c=black:s=${even(width)}x${even(height)}:r=30`,
      ]);
    }
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
    const {
      filter,
      videoLabel,
      audioLabel,
      stems: stemLabels,
    } = buildFilterComplex({
      stems: options.stems === true,
      reviewBurnIn: options.reviewBurnIn === true,
      lutFile: await (async () => {
        const lut = loadStoredLut(options.lut);
        if (!lut) return null;
        const file = path.join(/* turbopackIgnore: true */ workDir, 'film.cube');
        await fs.writeFile(/* turbopackIgnore: true */ file, lutToCube(lut));
        return usableFilterPath(file) ? file : null;
      })(),
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
      clipMoves: graphKinds.map((kind, g) => {
        if (kind === 'title') return undefined;
        return shots[titleAt >= 0 && g > titleAt ? g - 1 : g]?.clipMove;
      }),
      // Each graph shot's level points: a clip's own, none for a title or the credits.
      volumeKeys: graphKinds.map((kind, g) => {
        if (kind === 'title') return undefined;
        const i = titleAt >= 0 && g > titleAt ? g - 1 : g;
        return shots[i]?.volumeKeys;
      }),
      grades: graphGrades,
      speeds: graphSpeeds,
      reverses: graphReverses,
      reframes: graphReframes,
      sharpen: options.sharpen === true,
      subtitleStyle,
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
        return graphPipFiles.map(pip =>
          pip
            ? {
                input: next++,
                corner: pip.corner,
                ...(pip.cutaway ? { cutaway: pip.cutaway } : {}),
                ...(pip.clip ? { clip: true } : {}),
              }
            : null
        );
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
      // After the clips' sound-only inputs: the effects, in order.
      effectInputs: effectFiles.map((effect, k) => ({
        input:
          graphKinds.length +
          (audioPath ? 1 : 0) +
          narrationFiles.length +
          (ambiencePath ? 1 : 0) +
          graphPipFiles.filter(Boolean).length +
          (logoFile ? 1 : 0) +
          localFiles.filter((_, i) => kinds[i] === 'clip').length +
          k,
        atSec: effect.atSec,
        level: effect.level,
        ...(effect.lengthSec ? { lengthSec: effect.lengthSec } : {}),
        ...(effect.duck ? { duck: true } : {}),
      })),
      musicLevel: options.musicLevel,
      voiceLevel: options.voiceLevel,
      // Graph shot index = shot index + the title card when there is one; narration inputs follow
      // the shots and the music bed.
      narration: narrationFiles.map((entry, k) => ({
        input: graphKinds.length + (audioPath ? 1 : 0) + k,
        shot: graphIndexOf(entry.shot),
      })),
    });

    // A master (ProRes .mov) or the everyday MP4 (film-finish.ts filmCodec).
    const codec = filmCodec(options.master === true);
    const outputPath = path.join(/* turbopackIgnore: true */ workDir, `out.${codec.extension}`);
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
      if (pip?.clip) args.push('-an', '-i', pip.path);
      else if (pip) args.push('-loop', '1', '-i', pip.path);
    }
    if (logoFile) args.push('-loop', '1', '-i', logoFile);
    // Each clip's sound-only inputs, last (no input before them moves), as clipAudioInputs said.
    for (const [i, file] of localFiles.entries()) {
      if (kinds[i] === 'clip') args.push('-vn', '-i', file);
    }
    // The effects, after them (as effectInputs said).
    for (const effect of effectFiles) args.push('-vn', '-i', effect.path);
    args.push('-filter_complex', filter, '-map', `[${videoLabel}]`);
    if (audioLabel) {
      args.push('-map', `[${audioLabel}]`, ...codec.audio);
    } else {
      args.push('-an');
    }
    args.push(...codec.video, ...codec.container, outputPath);
    // Stems: each part of the mix as its own 24-bit WAV, in the same pass (a second output).
    const stemsDir = path.join(/* turbopackIgnore: true */ workDir, 'stems');
    if (stemLabels?.length) {
      await fs.mkdir(/* turbopackIgnore: true */ stemsDir, { recursive: true });
      for (const stem of stemLabels) {
        args.push(
          '-map',
          `[${stem.label}]`,
          '-c:a',
          'pcm_s24le',
          '-ar',
          '48000',
          path.join(/* turbopackIgnore: true */ stemsDir, `${stem.name}.wav`)
        );
      }
    }

    options.onProgress?.(0.55, 'Encoding MP4…');
    await runCapture(ffmpeg, args);
    // Just a part, and chapter marks (film-finish.ts): times as the monitor showed them, moved
    // past a recap the monitor doesn't show.
    const leadShots = Math.max(0, Math.min(localFiles.length, Math.floor(options.leadShots ?? 0)));
    const offsetSec = leadShots
      ? (shotStarts[titleAt === leadShots ? titleAt : graphIndexOf(leadShots)] ?? 0)
      : 0;
    const finished = await finishFilmFile({
      ffmpeg,
      file: outputPath,
      workDir,
      range: options.range ?? null,
      chapters: options.chapters ?? [],
      offsetSec,
      hasAudio: Boolean(audioLabel),
      loudness: options.loudness ?? null,
      master: options.master === true,
      onProgress: options.onProgress,
    });
    // The subtitle track: the (range-cut) .srt as a soft subtitle stream, the film copied as is.
    const srtForFile = subtitlesSrt
      ? finished.range
        ? srtForRange(subtitlesSrt, finished.range)
        : subtitlesSrt
      : '';
    if (options.subtitleTrack && srtForFile.trim()) {
      const srtPath = path.join(/* turbopackIgnore: true */ workDir, 'track.srt');
      const withTrack = path.join(
        /* turbopackIgnore: true */ workDir,
        `with-subs.${codec.extension}`
      );
      await fs.writeFile(/* turbopackIgnore: true */ srtPath, srtForFile);
      await runCapture(ffmpeg, [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        finished.file,
        '-i',
        srtPath,
        // Picture, sound and the new subtitles; the chapters carried as chapters (a plain
        // -map 0 copied their text track over as a stray data stream).
        '-map',
        '0:v',
        '-map',
        '0:a?',
        '-map',
        '1',
        '-map_chapters',
        '0',
        '-c',
        'copy',
        '-c:s',
        'mov_text',
        '-metadata:s:s:0',
        'language=eng',
        '-metadata:s:s:0',
        'title=Subtitles',
        ...codec.container,
        withTrack,
      ]);
      finished.file = withTrack;
    }
    const stemsZip = stemLabels?.length
      ? await zipStems({
          ffmpeg,
          dir: stemsDir,
          names: stemLabels.map(stem => stem.name),
          range: finished.range,
          gainDb: finished.gainDb ?? 0,
        })
      : null;
    const credentials = await filmCredentials(finished.file, codec.extension, options);
    options.onProgress?.(0.95, 'Reading encode…');
    const buffer = await fs.readFile(/* turbopackIgnore: true */ credentials.file);
    if (buffer.byteLength === 0) {
      throw new Error('Server encode produced an empty file.');
    }
    options.onProgress?.(1, 'Encode complete');
    return {
      buffer,
      mimeType: codec.mimeType,
      extension: codec.extension,
      width: even(width),
      height: even(height),
      ...(subtitlesSrt
        ? {
            subtitlesSrt: finished.range ? srtForRange(subtitlesSrt, finished.range) : subtitlesSrt,
          }
        : {}),
      ...(finished.chapters.length ? { chapters: finished.chapters } : {}),
      ...(offsetSec > 0 ? { leadOffsetSec: offsetSec } : {}),
      ...(stemsZip ? { stemsZip } : {}),
      ...(credentials.result ? { contentCredentials: credentials.result } : {}),
    };
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ workDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

/** The last step before the film is read: signed with Content Credentials, when asked. */
async function filmCredentials(
  file: string,
  extension: string,
  options: FilmServerEncodeOptions
): Promise<{ file: string; result?: ContentCredentialsResult }> {
  if (!options.contentCredentials) return { file };
  options.onProgress?.(0.94, 'Signing (Content Credentials)…');
  return signFilmWithContentCredentials({
    file,
    extension,
    title: options.titleCard?.title,
    request: options.contentCredentials,
  });
}

/**
 * The finishing pass (film-finish.ts): cut the encoded film to a range (re-encoded, so it starts
 * on the exact frame) and/or write chapter marks. The film as it was when there is neither.
 */
async function finishFilmFile(input: {
  ffmpeg: string;
  file: string;
  workDir: string;
  range: FilmRange | null;
  chapters: FilmChapter[];
  offsetSec: number;
  hasAudio: boolean;
  /** Bring the film to this loudness (two-pass loudnorm, one gain for the whole film). */
  loudness?: { lufs: number; peakDbtp: number } | null;
  /** A master (ProRes .mov): every re-encode here keeps its codecs. */
  master?: boolean;
  onProgress?: (ratio: number, label: string) => void;
}): Promise<{
  file: string;
  range: FilmRange | null;
  chapters: FilmChapter[];
  /** The gain the loudness pass gave the film (dB) — the stems get the same. */
  gainDb?: number;
}> {
  const cut = await cutFilmFile(input);
  if (!input.loudness || !input.hasAudio) return cut;
  input.onProgress?.(0.92, 'Setting the loudness…');
  const measured = parseLoudnormMeasure(
    (
      await runCapture(input.ffmpeg, [
        '-hide_banner',
        '-nostats',
        '-i',
        cut.file,
        '-vn',
        '-af',
        loudnormFilters(input.loudness),
        '-f',
        'null',
        '-',
      ])
    ).stderr
  );
  // Silence (nothing to measure): left as it is.
  if (!measured) return cut;
  const codec = filmCodec(input.master === true);
  const out = path.join(/* turbopackIgnore: true */ input.workDir, `loud.${codec.extension}`);
  await runCapture(input.ffmpeg, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    cut.file,
    '-map',
    '0',
    '-c:v',
    'copy',
    '-af',
    loudnormFilters(input.loudness, measured),
    '-ar',
    '48000',
    ...codec.audio,
    ...codec.container,
    out,
  ]);
  return { ...cut, file: out, gainDb: input.loudness.lufs - measured.inputI };
}

/**
 * The stems as a .zip: cut to the range when there is one, at the film's loudness gain, so they
 * line up with the film and add up to its mix (a sound mixer's handoff). Null when none was written.
 */
async function zipStems(input: {
  ffmpeg: string;
  dir: string;
  names: readonly FilmStemName[];
  range: FilmRange | null;
  gainDb: number;
}): Promise<Buffer | null> {
  const entries: ZipDiskEntry[] = [];
  for (const name of input.names) {
    const raw = path.join(/* turbopackIgnore: true */ input.dir, `${name}.wav`);
    const ok = await fs
      .stat(/* turbopackIgnore: true */ raw)
      .then(stat => stat.size > 0)
      .catch(() => false);
    if (!ok) continue;
    let file = raw;
    if (input.range || Math.abs(input.gainDb) > 0.05) {
      file = path.join(/* turbopackIgnore: true */ input.dir, `${name}-final.wav`);
      await runCapture(input.ffmpeg, [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        ...(input.range ? ['-ss', input.range.fromSec.toFixed(3)] : []),
        '-i',
        raw,
        ...(input.range ? ['-t', (input.range.toSec - input.range.fromSec).toFixed(3)] : []),
        ...(Math.abs(input.gainDb) > 0.05 ? ['-af', `volume=${input.gainDb.toFixed(2)}dB`] : []),
        '-c:a',
        'pcm_s24le',
        file,
      ]);
    }
    entries.push({ archivePath: `stems/${name}.wav`, diskPath: file });
  }
  if (!entries.length) return null;
  const zipPath = path.join(/* turbopackIgnore: true */ input.dir, 'stems.zip');
  // Loaded here: the zip writer is server-only, and the graph builder above is tested in plain node.
  const { createZipFileFromDiskPaths } = await import('../gallery/zip-stream');
  await createZipFileFromDiskPaths(zipPath, entries);
  return fs.readFile(/* turbopackIgnore: true */ zipPath);
}

/** The range and chapter half of the finishing pass (finishFilmFile). */
async function cutFilmFile(input: {
  ffmpeg: string;
  file: string;
  workDir: string;
  range: FilmRange | null;
  chapters: FilmChapter[];
  offsetSec: number;
  hasAudio: boolean;
  master?: boolean;
  onProgress?: (ratio: number, label: string) => void;
}): Promise<{ file: string; range: FilmRange | null; chapters: FilmChapter[] }> {
  const codec = filmCodec(input.master === true);
  const totalSec = (await clipDurationSec(input.ffmpeg, input.file)) ?? 0;
  const range = input.range
    ? normalizeFilmRange({
        fromSec: Math.min(totalSec, input.range.fromSec + input.offsetSec),
        toSec: Math.min(totalSec, input.range.toSec + input.offsetSec),
      })
    : null;
  if (input.range && !range) throw new Error('That part of the film is too short to render.');
  const chapters = chaptersForFile({
    chapters: input.chapters,
    offsetSec: input.offsetSec,
    range: input.range,
  });
  if (!range && !chapters.length) return { file: input.file, range: null, chapters: [] };
  input.onProgress?.(0.9, range ? 'Cutting out the part…' : 'Writing the chapters…');
  const out = path.join(/* turbopackIgnore: true */ input.workDir, `finished.${codec.extension}`);
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (range) args.push('-ss', range.fromSec.toFixed(3));
  args.push('-i', input.file);
  if (chapters.length) {
    const meta = path.join(/* turbopackIgnore: true */ input.workDir, 'chapters.txt');
    const length = range ? range.toSec - range.fromSec : totalSec;
    await fs.writeFile(/* turbopackIgnore: true */ meta, chaptersFfmetadata(chapters, length));
    args.push('-i', meta, '-map_metadata', '1', '-map_chapters', '1');
  }
  args.push('-map', '0:v', ...(input.hasAudio ? ['-map', '0:a'] : []));
  if (range) {
    args.push(
      '-t',
      (range.toSec - range.fromSec).toFixed(3),
      ...codec.video,
      ...(input.hasAudio ? codec.audio : [])
    );
  } else {
    args.push('-c', 'copy');
  }
  args.push(...codec.container, out);
  await runCapture(input.ffmpeg, args);
  return { file: out, range, chapters };
}

/**
 * A long film (more than LONG_FORM_MIN_SHOTS shots, a half-hour episode) in pieces (Part 19): each
 * run of shots rendered on its own — the pictures, the clips' sound, the narration, its subtitles;
 * the title card on the first, the credits on the last — then joined as they are, then one pass
 * over the whole film lays the music (ducked under the lines), the ambience and the effects, and
 * the usual finish (a part, chapters, loudness, the subtitle track). One ffmpeg graph of hundreds
 * of inputs would hold too much at once; a piece at a time never does. Joins are hard cuts.
 * Stems are not made at this length.
 */
export async function encodeFilmLongFormServer(
  shots: FilmPlaylistShot[],
  options: FilmServerEncodeOptions = {},
  requestOrigin?: string
): Promise<FilmServerEncodeResult> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const workDir = path.join(/* turbopackIgnore: true */ filmWorkRoot(), `long-${randomUUID()}`);
  await ensureDir(workDir);
  const codec = filmCodec(options.master === true);
  const chunks = longFormChunks(shots.length, options.titleCard?.afterShots ?? 0);
  const progress = (from: number, to: number) => (ratio: number, label: string) =>
    options.onProgress?.(from + (to - from) * ratio, label);
  try {
    const pieces: Array<{ file: string; seconds: number; srt?: string }> = [];
    let leadOffsetSec = 0;
    for (const [index, [start, end]] of chunks.entries()) {
      const first = index === 0;
      const last = index === chunks.length - 1;
      const piece = await encodeFilmPlaylistServer(
        shots.slice(start, end),
        {
          ...options,
          // The whole-film layers wait for the last pass.
          audioBedUrl: undefined,
          sound: options.sound
            ? {
                ...options.sound,
                effects: [],
                ambienceUrl: undefined,
                musicFadeOutSec: 0,
                musicKeys: undefined,
              }
            : { musicFadeOutSec: 0 },
          titleCard: first ? options.titleCard : null,
          credits: last ? options.credits : [],
          logo: null,
          leadShots: first ? options.leadShots : 0,
          range: null,
          chapters: [],
          loudness: null,
          stems: false,
          // Kept on so each piece times its subtitles (the last pass keeps only picture and sound).
          subtitleTrack: options.subtitleTrack,
          reviewBurnIn: false,
          // Signed once, as a whole film.
          contentCredentials: null,
          onProgress: progress(
            0.02 + (0.78 * index) / chunks.length,
            0.02 + (0.78 * (index + 1)) / chunks.length
          ),
        },
        requestOrigin
      );
      if (first) leadOffsetSec = piece.leadOffsetSec ?? 0;
      const file = path.join(
        /* turbopackIgnore: true */ workDir,
        `piece-${index}.${codec.extension}`
      );
      await fs.writeFile(/* turbopackIgnore: true */ file, piece.buffer);
      // Every piece needs a sound track for the join (a piece of stills alone has none).
      const hasAudio = /Audio:/.test(
        (
          await runCapture(ffmpeg, ['-hide_banner', '-i', file]).catch(error => ({
            stderr: String((error as Error).message),
          }))
        ).stderr
      );
      let joinable = file;
      if (!hasAudio) {
        joinable = path.join(
          /* turbopackIgnore: true */ workDir,
          `piece-${index}-sound.${codec.extension}`
        );
        await runCapture(ffmpeg, [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          file,
          '-f',
          'lavfi',
          '-i',
          'anullsrc=channel_layout=stereo:sample_rate=48000',
          '-map',
          '0:v',
          '-map',
          '1:a',
          '-c:v',
          'copy',
          ...codec.audio,
          '-shortest',
          ...codec.container,
          joinable,
        ]);
      }
      pieces.push({
        file: joinable,
        seconds: (await clipDurationSec(ffmpeg, joinable)) ?? 0,
        ...(piece.subtitlesSrt ? { srt: piece.subtitlesSrt } : {}),
      });
    }

    options.onProgress?.(0.82, 'Joining the pieces…');
    const list = path.join(/* turbopackIgnore: true */ workDir, 'pieces.txt');
    await fs.writeFile(
      /* turbopackIgnore: true */ list,
      pieces.map(piece => `file '${piece.file.replace(/'/g, "'\\''")}'`).join('\n')
    );
    const joined = path.join(/* turbopackIgnore: true */ workDir, `joined.${codec.extension}`);
    await runCapture(ffmpeg, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-c',
      'copy',
      ...codec.container,
      joined,
    ]);
    const total = pieces.reduce((sum, piece) => sum + piece.seconds, 0);

    // The whole-film sound: music ducked under what the pieces say, ambience, effects, the fade.
    options.onProgress?.(0.86, 'Mixing the music and sound…');
    const fetchTo = async (url: string | undefined, name: string) => {
      if (!url?.trim()) return null;
      const fetched = await fetchShotBytes(url.trim(), requestOrigin, undefined, options.userId);
      const file = path.join(/* turbopackIgnore: true */ workDir, name);
      await fs.writeFile(/* turbopackIgnore: true */ file, fetched.buffer);
      return file;
    };
    const bed = await fetchTo(options.audioBedUrl, 'bed.audio').catch(() => null);
    const ambience = await fetchTo(options.sound?.ambienceUrl, 'ambience.audio').catch(() => null);
    const effects: Array<{
      path: string;
      atSec: number;
      level?: number;
      lengthSec?: number;
      duck?: boolean;
    }> = [];
    for (const [k, effect] of heardEffects(options.sound).entries()) {
      const file = await fetchTo(effect.url, `effect-${k}.audio`).catch(() => null);
      if (file) {
        effects.push({
          path: file,
          atSec: effect.atSec,
          level: effect.level,
          ...(effect.lengthSec ? { lengthSec: effect.lengthSec } : {}),
          ...(effect.duck ? { duck: true } : {}),
        });
      }
    }
    const stereo = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
    const endSec = Math.max(1, total);
    const fadeOutSec = Math.min(normalizeMusicFadeOutSec(options.sound?.musicFadeOutSec), endSec);
    const fadeOut =
      fadeOutSec > 0
        ? `afade=t=out:st=${Math.max(0, endSec - fadeOutSec).toFixed(3)}:d=${fadeOutSec}`
        : 'anull';
    // Inputs first (the joined film, the score, the ambience, each placed sound), then the graph.
    const inputs: string[] = ['-i', joined];
    let next = 1;
    const bedInput = bed ? (inputs.push('-i', bed), next++) : null;
    const ambienceInput = ambience
      ? (inputs.push('-stream_loop', '-1', '-i', ambience), next++)
      : null;
    const placed = effects.map(effect => {
      inputs.push('-vn', '-i', effect.path);
      return {
        input: next++,
        atSec: effect.atSec,
        level: effect.level,
        lengthSec: effect.lengthSec,
        duck: effect.duck,
      };
    });
    const parts: string[] = [`[0:a]${stereo},apad=whole_dur=${endSec},atrim=0:${endSec}[speech]`];
    let label = 'speech';
    // Music cues join the score (Part 19 G4): the bed, ducked under what the pieces say.
    const cues = effectsFilterParts({
      effects: placed.filter(effect => effect.duck),
      endSec,
      stereo,
      fadeOut: 'anull',
      label: 'cue',
    });
    if (cues) parts.push(...cues.parts);
    if (bedInput !== null || cues) {
      if (bedInput !== null) {
        const musicStart = normalizeMusicStartSec(options.sound?.musicStartSec);
        const fadeIn = normalizeMusicFadeInSec(options.sound?.musicFadeInSec);
        const level = normalizeMusicLevel(options.musicLevel);
        const keys = levelKeysExpr(normalizeCutLevelKeys(options.sound?.musicKeys));
        parts.push(
          `[${bedInput}:a]${stereo},atrim=${musicStart}:${musicStart + endSec},asetpts=PTS-STARTPTS` +
            `${level !== 1 ? `,volume=${level}` : ''}${keys ? `,volume=${q(keys)}:eval=frame` : ''}` +
            `${fadeIn > 0 ? `,afade=t=in:st=0:d=${fadeIn}` : ''},apad=whole_dur=${endSec}${cues ? '[score]' : '[bed]'}`
        );
        if (cues) parts.push(`[score][cue]amix=inputs=2:duration=first:normalize=0[bed]`);
      } else {
        parts.push(`[cue]anull[bed]`);
      }
      parts.push(
        `[speech]asplit=2[sp1][sp2]`,
        `[bed][sp1]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[ducked]`,
        `[ducked][sp2]amix=inputs=2:duration=first:normalize=0[withbed]`
      );
      label = 'withbed';
    }
    if (ambienceInput !== null) {
      parts.push(
        `[${ambienceInput}:a]${stereo},atrim=0:${endSec},asetpts=PTS-STARTPTS,volume=${normalizeAmbienceLevel(options.sound?.ambienceLevel)}[amb]`,
        `[${label}][amb]amix=inputs=2:duration=first:normalize=0[withamb]`
      );
      label = 'withamb';
    }
    const fx = effectsFilterParts({
      effects: placed.filter(effect => !effect.duck),
      endSec,
      stereo,
      fadeOut: 'anull',
    });
    if (fx) {
      parts.push(
        ...fx.parts,
        `[${label}][${fx.label}]amix=inputs=2:duration=first:normalize=0[withfx]`
      );
      label = 'withfx';
    }
    parts.push(`[${label}]${fadeOut}[aout]`);
    // The review timecode runs over the whole film, so it is drawn here (the picture re-encoded).
    const font = options.reviewBurnIn ? await resolveFilmFontFile() : null;
    let videoMap = '0:v';
    if (font && usableFilterPath(font)) {
      const size = 25;
      parts.push(
        `[0:v]drawtext=fontfile=${q(font)}:text='REVIEW':fontcolor=white@0.9:fontsize=${size}:box=1:boxcolor=black@0.5:boxborderw=9:x=22:y=22,` +
          `drawtext=fontfile=${q(font)}:timecode='00\\:00\\:00\\:00':timecode_rate=${STILL_MOTION_FPS}:fontcolor=white@0.9:fontsize=${size}:box=1:boxcolor=black@0.5:boxborderw=9:x=22:y=62[vreview]`
      );
      videoMap = '[vreview]';
    }
    const mixed = path.join(/* turbopackIgnore: true */ workDir, `mixed.${codec.extension}`);
    await runCapture(ffmpeg, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      ...inputs,
      '-filter_complex',
      parts.join(';'),
      '-map',
      videoMap,
      '-map',
      '[aout]',
      ...(videoMap === '0:v' ? ['-c:v', 'copy'] : codec.video),
      ...codec.audio,
      ...codec.container,
      mixed,
    ]);

    // Subtitles: each piece's, moved to its place in the film.
    let at = 0;
    const srts: string[] = [];
    for (const piece of pieces) {
      if (piece.srt) srts.push(shiftSrt(piece.srt, at));
      at += piece.seconds;
    }
    const subtitlesSrt = srts.length ? mergeSrt(srts) : undefined;

    const finished = await finishFilmFile({
      ffmpeg,
      file: mixed,
      workDir,
      range: options.range ?? null,
      chapters: options.chapters ?? [],
      offsetSec: leadOffsetSec,
      hasAudio: true,
      loudness: options.loudness ?? null,
      master: options.master === true,
      onProgress: options.onProgress,
    });
    const srtForFile = subtitlesSrt
      ? finished.range
        ? srtForRange(subtitlesSrt, finished.range)
        : subtitlesSrt
      : '';
    let file = finished.file;
    if (options.subtitleTrack && srtForFile.trim()) {
      const srtPath = path.join(/* turbopackIgnore: true */ workDir, 'track.srt');
      const withTrack = path.join(
        /* turbopackIgnore: true */ workDir,
        `with-subs.${codec.extension}`
      );
      await fs.writeFile(/* turbopackIgnore: true */ srtPath, srtForFile);
      await runCapture(ffmpeg, [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        file,
        '-i',
        srtPath,
        '-map',
        '0:v',
        '-map',
        '0:a?',
        '-map',
        '1',
        '-map_chapters',
        '0',
        '-c',
        'copy',
        '-c:s',
        'mov_text',
        '-metadata:s:s:0',
        'language=eng',
        ...codec.container,
        withTrack,
      ]);
      file = withTrack;
    }
    const credentials = await filmCredentials(file, codec.extension, options);
    options.onProgress?.(0.97, 'Reading encode…');
    const buffer = await fs.readFile(/* turbopackIgnore: true */ credentials.file);
    const { width, height } = FILM_PRESET_SIZE[normalizeFilmResolution(options.resolution)];
    options.onProgress?.(1, 'Encode complete');
    return {
      buffer,
      mimeType: codec.mimeType,
      extension: codec.extension,
      width: even(width),
      height: even(height),
      ...(srtForFile ? { subtitlesSrt: srtForFile } : {}),
      ...(finished.chapters.length ? { chapters: finished.chapters } : {}),
      ...(credentials.result ? { contentCredentials: credentials.result } : {}),
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
