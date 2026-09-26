/**
 * The cut before it's encoded: which shots go in and in what order (the shot list), what each
 * caption says, how long stills hold (fit to the music or a set length, optionally on the beat),
 * and which shots have problems worth a look first. Pure — no browser, no ffmpeg.
 */

import {
  DEFAULT_STILL_HOLD_SEC,
  MAX_STILL_HOLD_SEC,
  MIN_STILL_HOLD_SEC,
  type FilmPlaylistShot,
} from './character-film';
import { TITLE_CARD_SEC } from './film-polish';

/** A shot with a stable key (Day slot id, Story beat id@at) the edits refer to. */
export type KeyedShot = FilmPlaylistShot & { key: string };

export type CutShotEdit = {
  /** false = leave the shot out. */
  include?: boolean;
  /** Caption shown when titles are on (default: from the beat). */
  caption?: string;
  /** Still hold in seconds (ignored for clips; overridden by length fitting). */
  holdSec?: number;
};

export type CutShotEdits = {
  /** Shot keys in the order the player set; unknown / new keys follow in natural order. */
  order?: string[];
  shots?: Record<string, CutShotEdit>;
};

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
    return [
      {
        ...shot,
        ...(caption ? { caption } : {}),
        ...(shot.kind === 'still' && typeof edit?.holdSec === 'number' && edit.holdSec > 0
          ? { holdSec: clampHold(edit.holdSec) }
          : {}),
      },
    ];
  });
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

function clampHold(value: number): number {
  return Math.min(MAX_STILL_HOLD_SEC, Math.max(MIN_STILL_HOLD_SEC, Math.round(value * 10) / 10));
}

/** Seconds a shot occupies (clips: measured length, else their hold, else 4 s). */
export function shotSeconds(shot: FilmPlaylistShot, clipSec?: number | null): number {
  if (shot.kind === 'clip') {
    return clipSec && clipSec > 0 ? clipSec : shot.holdSec && shot.holdSec > 0 ? shot.holdSec : 4;
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
  const pieces = input.shots.length + (input.titleCard ? 1 : 0);
  const fades = Math.max(0, pieces - 1) * Math.max(0, input.crossfadeSec ?? 0);
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
  const stills = input.shots.filter(shot => shot.kind === 'still').length;
  if (stills === 0 || !(input.targetSec > 0)) return input.shots;
  const clipsSec = input.shots.reduce(
    (sum, shot, index) =>
      shot.kind === 'clip' ? sum + shotSeconds(shot, input.clipSecs?.[index]) : sum,
    0
  );
  const pieces = input.shots.length + (input.titleCard ? 1 : 0);
  const fades = Math.max(0, pieces - 1) * Math.max(0, input.crossfadeSec ?? 0);
  const fixed = clipsSec + (input.titleCard ? TITLE_CARD_SEC : 0) - fades;
  const hold = clampHold((input.targetSec - fixed) / stills);
  return input.shots.map(shot => (shot.kind === 'still' ? { ...shot, holdSec: hold } : shot));
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

/**
 * Tempo from mono samples: onset energy envelope (10 ms hops), autocorrelated over 60–180 BPM,
 * folded into 80–160. Null when there's no clear pulse.
 */
export function estimateTempoBpm(samples: Float32Array, sampleRate: number): number | null {
  const hop = Math.max(1, Math.round(sampleRate / 100));
  const frames = Math.floor(samples.length / hop);
  if (frames < 300) return null;
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i += 1) sum += samples[i]! * samples[i]!;
    energy[f] = Math.sqrt(sum / hop);
  }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f += 1) onset[f] = Math.max(0, energy[f]! - energy[f - 1]!);
  const mean = onset.reduce((sum, value) => sum + value, 0) / frames;
  for (let f = 0; f < frames; f += 1) onset[f] = onset[f]! - mean;
  const minLag = Math.round(100 * (60 / 180));
  const maxLag = Math.round(100 * (60 / 60));
  let bestLag = 0;
  let best = 0;
  let total = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let f = lag; f < frames; f += 1) sum += onset[f]! * onset[f - lag]!;
    total += Math.max(0, sum);
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  const lags = maxLag - minLag + 1;
  if (!bestLag || best <= 0 || best < (total / lags) * 2) return null;
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
