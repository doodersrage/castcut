/**
 * The cut before it's encoded: which shots go in and in what order (the shot list), what each
 * caption says, how long stills hold (fit to the music or a set length, optionally on the beat),
 * and which shots have problems worth a look first. Pure — no browser, no ffmpeg.
 */

import { normalizeCutFraming, type CutFraming } from '../cut-move';
import { cleanLowerThird, normalizeOverlayCorner } from '../cut-overlay';
import {
  CUT_TRANSITION_SEC,
  CUT_TRANSITIONS,
  cutJoins,
  type CutTransitionKind,
} from '../cut-timeline';
import {
  DEFAULT_STILL_HOLD_SEC,
  MAX_STILL_HOLD_SEC,
  MIN_STILL_HOLD_SEC,
  type FilmPlaylistShot,
} from './character-film';
import { TITLE_CARD_SEC } from '../video-polish';
import { clipIsTrimmed, clipTrimWindow, MIN_CLIP_TRIM_SEC } from '../clip-trim';

/** A shot with a stable key (Day slot id, Story beat id@at) the edits refer to. */
export type KeyedShot = FilmPlaylistShot & { key: string };

export type CutShotEdit = {
  /** false = leave the shot out. */
  include?: boolean;
  /** Caption shown when titles are on (default: from the beat). */
  caption?: string;
  /** Still hold in seconds (ignored for clips; overridden by length fitting). */
  holdSec?: number;
  /** Clips: start here (seconds into the clip). */
  trimStartSec?: number;
  /** Clips: end here (seconds into the clip; unset = the clip's end). */
  trimEndSec?: number;
  /** Stills: as shot (unset), waist up or chest up — a crop around the face. */
  framing?: StillFraming;
  /** How this shot comes in from the one before; unset = the cut's crossfade. */
  transition?: CutTransitionKind;
  /** Clips: the sound's level (1 = as recorded, 0 = muted). */
  volume?: number;
  /** Stills: push in, pull out or hold still (unset = alternating). */
  motion?: 'in' | 'out' | 'none' | 'custom';
  /** Stills, motion 'custom': the framing the move starts on and ends on (cut-move.ts). */
  moveFrom?: CutFraming;
  moveTo?: CutFraming;
  /** Clips: playback speed, 0.25–4 (1 = as shot); under 1 is smooth slow motion. */
  speed?: number;
  /** Clips: play backwards. */
  reverse?: boolean;
  /** Clips: J cut — the sound starts this many seconds before the picture (cut-sound.ts). */
  soundLeadSec?: number;
  /** Clips: L cut — the sound carries on this many seconds after the picture. */
  soundTailSec?: number;
  /** A lower third over the shot: a name / line, and a smaller line under it (cut-overlay.ts). */
  lowerThird?: string;
  lowerThirdSub?: string;
  /** Picture-in-picture: a picture in a corner of the shot. */
  pipUrl?: string;
  pipCorner?: 'tl' | 'tr' | 'bl' | 'br';
};

/** A still's framing in the cut. Prompts can't get it (live, Edit 2511: 0 of 4 close-ups). */
export type StillFraming = 'full' | 'medium' | 'close';

/**
 * Crop height in face heights (brow to chin): chest up matches the talking-clip crop, waist up
 * about twice the face lower. Live, 2026-10-11: asking Edit 2511 for "a close-up from the chest
 * up" / "the frame cuts off at her waist" on a seated vacation still kept her thighs in frame in
 * all four renders — so a closer shot is a crop of the finished still.
 */
export const FRAMING_FACE_HEIGHTS: Record<'medium' | 'close', number> = {
  medium: 7.5,
  close: 4.2,
};

/** Smallest crop height in pixels (looser than asked when the face is tiny). */
export const FRAMING_MIN_CROP_PX = 420;

/**
 * The 3:4 crop for a framing, or null when the still is already that close (the crop would
 * keep most of it) — never upscaled past the still.
 */
export function framingCropRect(
  width: number,
  height: number,
  face: { x: number; y: number; width: number; height: number },
  framing: 'medium' | 'close'
): { x: number; y: number; width: number; height: number } | null {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const faceH = Math.max(1, face.height);
  // Never under 420 px tall: a 250 px chest-up crop of a full-body still is mush at 720p.
  let cropH = Math.min(
    h,
    Math.max(FRAMING_MIN_CROP_PX, Math.round(faceH * FRAMING_FACE_HEIGHTS[framing]))
  );
  if (cropH >= h * 0.85) return null;
  let cropW = Math.round(cropH * 0.75);
  if (cropW > w) {
    cropW = w;
    cropH = Math.min(h, Math.round(cropW / 0.75));
  }
  const centerX = face.x + face.width / 2;
  const x = Math.round(Math.min(Math.max(0, centerX - cropW / 2), w - cropW));
  const y = Math.round(Math.min(Math.max(0, face.y - faceH * 0.9), h - cropH));
  return { x, y, width: cropW, height: cropH };
}

export { clipIsTrimmed, clipTrimWindow, MIN_CLIP_TRIM_SEC } from '../clip-trim';

export type CutShotEdits = {
  /** Shot keys in the order the player set; unknown / new keys follow in natural order. */
  order?: string[];
  shots?: Record<string, CutShotEdit>;
  /** The shot Save poster uses (a clip: the frame at `atSec`). Unset: the first still. */
  poster?: { key: string; atSec?: number };
};

/** What Save poster should draw: a still, or one frame of a clip. */
export type PosterPick = { imageUrl: string } | { videoUrl: string; timeSec: number };

/**
 * The poster the player picked in the shot list, if that shot is still in the cut. A clip's
 * frame defaults to its trim's in point (else its first second).
 */
export function cutPosterPick(shots: KeyedShot[], edits?: CutShotEdits | null): PosterPick | null {
  const pick = edits?.poster;
  if (!pick) return null;
  const shot = shots.find(entry => entry.key === pick.key);
  if (!shot?.url?.trim()) return null;
  if (shot.kind === 'still') return { imageUrl: shot.url };
  const at =
    typeof pick.atSec === 'number' && pick.atSec >= 0
      ? pick.atSec
      : shot.trimStartSec && shot.trimStartSec > 0
        ? shot.trimStartSec
        : 1;
  return { videoUrl: shot.url, timeSec: Math.round(at * 10) / 10 };
}

/** How long the cut runs: as the shots hold, to the music track, or a set length. */
export type FilmCutLength = 'shots' | 'music' | 15 | 30 | 60;
export const FILM_CUT_LENGTHS: readonly FilmCutLength[] = ['shots', 'music', 15, 30, 60];

export function normalizeFilmCutLength(raw: unknown): FilmCutLength {
  return raw === 'music' || raw === 15 || raw === 30 || raw === 60 ? raw : 'shots';
}

const CAPTION_MAX = 42;

/**
 * A short caption from beat text: the first clause, trimmed at a word boundary, with any
 * pose-guide / camera jargon after the first "·" dropped.
 */
export function captionFromBeat(text: string | null | undefined, max = CAPTION_MAX): string {
  const first = (text ?? '')
    .split(/\s·\s|[.;!?\n]/)[0]!
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/,$/, '');
  if (first.length <= max) return first;
  const cut = first.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : first.slice(0, max)).replace(/[,\s]+$/, '')}…`;
}

/** Apply the shot list: order, leave-outs, captions, holds. */
export function applyCutShotEdits(shots: KeyedShot[], edits?: CutShotEdits | null): KeyedShot[] {
  const order = edits?.order ?? [];
  const rank = new Map(order.map((key, index) => [key, index]));
  const ordered = shots
    .map((shot, index) => ({ shot, index }))
    .sort((a, b) => {
      const ra = rank.get(a.shot.key);
      const rb = rank.get(b.shot.key);
      if (ra != null && rb != null) return ra - rb;
      if (ra != null) return -1;
      if (rb != null) return 1;
      return a.index - b.index;
    })
    .map(({ shot }) => shot);
  return ordered.flatMap(shot => {
    const edit = edits?.shots?.[shot.key];
    if (edit?.include === false) return [];
    const caption = edit?.caption?.trim();
    const trim = shot.kind === 'clip' && edit && clipIsTrimmed(edit) ? clipTrimWindow(edit) : null;
    return [
      {
        ...shot,
        ...(caption ? { caption } : {}),
        ...(shot.kind === 'still' && typeof edit?.holdSec === 'number' && edit.holdSec > 0
          ? { holdSec: clampHold(edit.holdSec) }
          : {}),
        ...(trim && trim.start > 0 ? { trimStartSec: trim.start } : {}),
        ...(shot.kind === 'still' && (edit?.framing === 'medium' || edit?.framing === 'close')
          ? { framing: edit.framing }
          : {}),
        ...(trim && trim.end != null ? { trimEndSec: trim.end } : {}),
        ...(shot.kind === 'clip' && typeof edit?.volume === 'number' && edit.volume !== 1
          ? { volume: Math.min(2, Math.max(0, edit.volume)) }
          : {}),
        ...(shot.kind === 'clip' && clipSpeed(edit?.speed) !== 1
          ? { speed: clipSpeed(edit?.speed) }
          : {}),
        ...(shot.kind === 'clip' && edit?.reverse === true ? { reverse: true } : {}),
        ...(shot.kind === 'clip' && (edit?.soundLeadSec ?? 0) > 0
          ? { soundLeadSec: Math.min(3, edit!.soundLeadSec!) }
          : {}),
        ...(shot.kind === 'clip' && (edit?.soundTailSec ?? 0) > 0
          ? { soundTailSec: Math.min(3, edit!.soundTailSec!) }
          : {}),
        ...(cleanLowerThird(edit?.lowerThird)
          ? {
              lowerThird: cleanLowerThird(edit?.lowerThird),
              ...(cleanLowerThird(edit?.lowerThirdSub)
                ? { lowerThirdSub: cleanLowerThird(edit?.lowerThirdSub) }
                : {}),
            }
          : {}),
        ...(edit?.pipUrl?.trim()
          ? {
              pipUrl: edit.pipUrl.trim(),
              pipCorner: normalizeOverlayCorner(edit.pipCorner, 'tr'),
            }
          : {}),
        ...(shot.kind === 'still' &&
        (edit?.motion === 'in' || edit?.motion === 'out' || edit?.motion === 'none')
          ? { motion: edit.motion }
          : {}),
        ...(shot.kind === 'still' && edit?.motion === 'custom'
          ? {
              motion: 'custom' as const,
              moveFrom: normalizeCutFraming(edit.moveFrom) ?? 'whole',
              moveTo: normalizeCutFraming(edit.moveTo) ?? 'centre',
            }
          : {}),
        ...(edit?.transition && CUT_TRANSITIONS.some(entry => entry.id === edit.transition)
          ? {
              transitionIn: {
                kind: edit.transition,
                sec: edit.transition === 'cut' ? 0 : CUT_TRANSITION_SEC,
              },
            }
          : {}),
      },
    ];
  });
}

/** The speeds Cut offers for a clip. */
export const CLIP_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4] as const;

/** A clip's playback speed, 0.25–4 (1 when unset or not a number). */
export function clipSpeed(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(4, Math.max(0.25, value))
    : 1;
}

/** Move a shot one place up (-1) or down (+1) in the list order. */
export function moveCutShot(keys: string[], key: string, delta: -1 | 1): string[] {
  const index = keys.indexOf(key);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= keys.length) return keys;
  const next = [...keys];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** The shot list's order: the player's order first, then any new shots in their natural order. */
export function orderedCutShots<T extends { key: string }>(shots: T[], edits?: CutShotEdits): T[] {
  const rank = new Map((edits?.order ?? []).map((key, index) => [key, index]));
  return [...shots].sort((a, b) => {
    const ra = rank.get(a.key);
    const rb = rank.get(b.key);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return 0;
  });
}

/**
 * The edits with one shot's edit patched, the shown order kept (`order`) and edits of shots no
 * longer in the list dropped (`known`). An `undefined` in the patch clears that field.
 */
export function withCutShotEdit(
  edits: CutShotEdits | undefined,
  order: string[],
  key: string,
  patch: CutShotEdit
): CutShotEdits {
  const known = new Set(order);
  return {
    ...edits,
    order,
    shots: {
      ...Object.fromEntries(
        Object.entries(edits?.shots ?? {}).filter(([shotKey]) => known.has(shotKey))
      ),
      [key]: { ...edits?.shots?.[key], ...patch },
    },
  };
}

/**
 * The shot list after dragging `key` to sit before `beforeKey` (null: to the end). Unknown keys
 * leave the order as it is.
 */
export function moveCutShotBefore(keys: string[], key: string, beforeKey: string | null): string[] {
  if (!keys.includes(key) || key === beforeKey) return keys;
  if (beforeKey !== null && !keys.includes(beforeKey)) return keys;
  const rest = keys.filter(entry => entry !== key);
  const at = beforeKey === null ? rest.length : rest.indexOf(beforeKey);
  return [...rest.slice(0, at), key, ...rest.slice(at)];
}

function clampHold(value: number): number {
  return Math.min(MAX_STILL_HOLD_SEC, Math.max(MIN_STILL_HOLD_SEC, Math.round(value * 10) / 10));
}

/** Seconds the joins overlap in all (crossfades and picked transitions; the title card counted). */
export function cutOverlapSec(
  shots: ReadonlyArray<Pick<FilmPlaylistShot, 'transitionIn'>>,
  crossfadeSec?: number,
  titleCard?: boolean
): number {
  const transitions = [...(titleCard ? [undefined] : []), ...shots.map(shot => shot.transitionIn)];
  const { overlaps } = cutJoins({
    count: transitions.length,
    crossfadeSec: Math.max(0, crossfadeSec ?? 0),
    transitions,
  });
  return overlaps.reduce((sum, sec) => sum + sec, 0);
}

/** Seconds a shot occupies (clips: measured length, else their hold, else 4 s; less any trim). */
export function shotSeconds(shot: FilmPlaylistShot, clipSec?: number | null): number {
  if (shot.kind === 'clip') {
    const full =
      clipSec && clipSec > 0 ? clipSec : shot.holdSec && shot.holdSec > 0 ? shot.holdSec : 4;
    if (!clipIsTrimmed(shot)) return full;
    const { start, end } = clipTrimWindow(shot, clipSec);
    return Math.max(MIN_CLIP_TRIM_SEC, (end ?? full) - start);
  }
  return shot.holdSec && shot.holdSec > 0 ? shot.holdSec : DEFAULT_STILL_HOLD_SEC;
}

/** Running time of a cut: shots, plus the title card, minus crossfade overlaps. */
export function cutRunningSec(input: {
  shots: FilmPlaylistShot[];
  clipSecs?: ReadonlyArray<number | null | undefined>;
  crossfadeSec?: number;
  titleCard?: boolean;
}): number {
  const shotsSec = input.shots.reduce(
    (sum, shot, index) => sum + shotSeconds(shot, input.clipSecs?.[index]),
    0
  );
  const fades = cutOverlapSec(input.shots, input.crossfadeSec, input.titleCard);
  return shotsSec + (input.titleCard ? TITLE_CARD_SEC : 0) - fades;
}

/**
 * Stretch (or shrink) the still holds so the cut runs `targetSec`. Clips keep their length;
 * each still gets the same hold, kept to 0.5–12 s — so a very long track may still outlast the
 * cut (the track is faded at the end, as before).
 */
export function fitHoldsToLength(input: {
  shots: FilmPlaylistShot[];
  targetSec: number;
  clipSecs?: ReadonlyArray<number | null | undefined>;
  crossfadeSec?: number;
  titleCard?: boolean;
}): FilmPlaylistShot[] {
  const stretches = (shot: FilmPlaylistShot) => shot.kind === 'still' && !shot.holdFixed;
  const stills = input.shots.filter(stretches).length;
  if (stills === 0 || !(input.targetSec > 0)) return input.shots;
  // Clips and fixed-hold stills (close-ups, recap shots) keep their length.
  const clipsSec = input.shots.reduce(
    (sum, shot, index) =>
      stretches(shot) ? sum : sum + shotSeconds(shot, input.clipSecs?.[index]),
    0
  );
  const fades = cutOverlapSec(input.shots, input.crossfadeSec, input.titleCard);
  const fixed = clipsSec + (input.titleCard ? TITLE_CARD_SEC : 0) - fades;
  const hold = clampHold((input.targetSec - fixed) / stills);
  return input.shots.map(shot => (stretches(shot) ? { ...shot, holdSec: hold } : shot));
}

/**
 * Put each still cut on the beat: round its hold to a whole number of beats (at least one,
 * grouping fast tempos into two-beat steps so holds stay watchable).
 */
export function snapHoldsToBeat(shots: FilmPlaylistShot[], bpm: number): FilmPlaylistShot[] {
  if (!(bpm > 0)) return shots;
  let beat = 60 / bpm;
  while (beat < MIN_STILL_HOLD_SEC) beat *= 2;
  return shots.map(shot => {
    if (shot.kind !== 'still') return shot;
    const hold = shotSeconds(shot);
    const beats = Math.max(1, Math.round(hold / beat));
    let snapped = beats * beat;
    while (snapped > MAX_STILL_HOLD_SEC && snapped - beat >= beat) snapped -= beat;
    return { ...shot, holdSec: Math.round(snapped * 1000) / 1000 };
  });
}

/** Beat confidence (normalized onset autocorrelation) below this means "no clear beat". */
const MIN_TEMPO_CONFIDENCE = 0.3;

/**
 * Tempo from mono samples: Hann-weighted 40 ms energy every 10 ms, onset (rise in energy) with
 * its slow drift removed, autocorrelated over 60–180 BPM and folded into 80–160. Null when
 * there's no clear pulse — the correlation peak is normalized by the onset energy, so white
 * noise, ambient pads and sustained tones score near 0 and drum tracks near 1 (a raw peak
 * ratio called noise 125 BPM, and a pure tone's window ripple looked like a beat).
 */
export function estimateTempoBpm(samples: Float32Array, sampleRate: number): number | null {
  const hop = Math.max(1, Math.round(sampleRate / 100));
  const frames = Math.floor(samples.length / hop);
  if (frames < 300) return null;
  const win = hop * 4;
  const hann = new Float32Array(win);
  for (let i = 0; i < win; i += 1) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    const start = Math.max(0, Math.floor(f * hop - win / 2 + hop / 2));
    const end = Math.min(samples.length, start + win);
    let sum = 0;
    let weight = 0;
    for (let i = start; i < end; i += 1) {
      const w = hann[i - start]!;
      sum += w * samples[i]! * samples[i]!;
      weight += w;
    }
    energy[f] = Math.sqrt(sum / Math.max(1e-9, weight));
  }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f += 1) onset[f] = Math.max(0, energy[f]! - energy[f - 1]!);
  // Remove slow drift (a swelling pad) with a ~0.5 s centered moving average.
  const half = 25;
  const prefix = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f += 1) prefix[f + 1] = prefix[f]! + onset[f]!;
  const detrended = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    const lo = Math.max(0, f - half);
    const hi = Math.min(frames, f + half + 1);
    detrended[f] = onset[f]! - (prefix[hi]! - prefix[lo]!) / (hi - lo);
  }
  let zeroLag = 0;
  for (let f = 0; f < frames; f += 1) zeroLag += detrended[f]! * detrended[f]!;
  if (!(zeroLag > 0)) return null;
  const minLag = Math.round(100 * (60 / 180));
  const maxLag = Math.round(100 * (60 / 60));
  let bestLag = 0;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let f = lag; f < frames; f += 1) sum += detrended[f]! * detrended[f - lag]!;
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  if (!bestLag || best / zeroLag < MIN_TEMPO_CONFIDENCE) return null;
  let bpm = 6000 / bestLag;
  while (bpm < 80) bpm *= 2;
  while (bpm > 160) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

export type CutShotProblem = { key: string; title: string; reasons: string[] };

/** Shots worth a look before cutting: flagged by review, or a pose / face miss. */
export function cutShotProblems(
  shots: KeyedShot[],
  checks: (shot: KeyedShot) => {
    flagged?: string[];
    pose?: number;
    poseMiss?: boolean;
    face?: number;
    faceMiss?: boolean;
  } | null
): CutShotProblem[] {
  return shots.flatMap(shot => {
    const check = checks(shot);
    if (!check) return [];
    const reasons = [
      ...(check.flagged ?? []),
      check.poseMiss
        ? `missed its pose${typeof check.pose === 'number' ? ` (${Math.round(check.pose * 100)}%)` : ''}`
        : null,
      check.faceMiss
        ? `doesn't look like the Cast${typeof check.face === 'number' ? ` (${Math.round(check.face * 100)}%)` : ''}`
        : null,
    ].filter((reason): reason is string => Boolean(reason));
    return reasons.length > 0
      ? [{ key: shot.key, title: shot.title, reasons: [...new Set(reasons)] }]
      : [];
  });
}
