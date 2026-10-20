/**
 * Where each shot of a cut sits in time — shared by the server mix (video-server-encode.ts), the
 * browser's Preview the mix (film-mix-preview.ts) and Cut's monitor (film-cut-preview.ts), so
 * each line and each picture lands where the encode puts it. Pure.
 *
 * Shots join by a transition: a hard cut, or one that overlaps the two shots for a moment
 * (crossfade, fade through black, flash of white, slide). Each shot may pick how it comes in
 * (`transitionIn`); one that does not takes the cut's crossfade (Crossfade option; 0 = cut).
 */

import { DEFAULT_STILL_HOLD_SEC } from '../media/kind';

/** A shot's kind in the joined film; `title` is the opening card. */
export type CutTimelineKind = 'still' | 'clip' | 'title';

/** How a shot comes in from the one before. */
export type CutTransitionKind = 'cut' | 'fade' | 'black' | 'white' | 'slide';

export type CutTransitionIn = { kind: CutTransitionKind; sec: number };

/** How long a picked transition takes (a crossfade set on the whole cut keeps its own length). */
export const CUT_TRANSITION_SEC = 0.6;

export const CUT_TRANSITIONS: { id: CutTransitionKind; label: string; short: string }[] = [
  { id: 'cut', label: 'Cut', short: '|' },
  { id: 'fade', label: 'Crossfade', short: '⨯' },
  { id: 'black', label: 'Fade through black', short: '◐' },
  { id: 'white', label: 'Flash of white', short: '○' },
  { id: 'slide', label: 'Slide', short: '→' },
];

/** ffmpeg xfade's name for a transition. */
export function xfadeTransitionName(kind: CutTransitionKind): string {
  switch (kind) {
    case 'black':
      return 'fadeblack';
    case 'white':
      return 'fadewhite';
    case 'slide':
      return 'slideleft';
    default:
      return 'fade';
  }
}

export function normalizeCutTransition(value: unknown): CutTransitionIn | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const kind = (value as { kind?: unknown }).kind;
  const sec = Number((value as { sec?: unknown }).sec);
  if (!CUT_TRANSITIONS.some(entry => entry.id === kind)) return undefined;
  return {
    kind: kind as CutTransitionKind,
    sec: kind === 'cut' ? 0 : Math.min(2, Math.max(0.1, Number.isFinite(sec) ? sec : 0.6)),
  };
}

/**
 * Each join in the cut: `overlaps[i]` is how long shot i overlaps the one before (0 for the
 * first shot and for hard cuts), `kinds[i]` how it comes in.
 */
export function cutJoins(input: {
  count: number;
  crossfadeSec: number;
  transitions?: ReadonlyArray<CutTransitionIn | null | undefined>;
}): { overlaps: number[]; kinds: CutTransitionKind[] } {
  const fallback = input.count >= 2 ? Math.max(0, input.crossfadeSec) : 0;
  const overlaps: number[] = [];
  const kinds: CutTransitionKind[] = [];
  for (let i = 0; i < input.count; i += 1) {
    if (i === 0) {
      overlaps.push(0);
      kinds.push('cut');
      continue;
    }
    const own = input.transitions?.[i];
    if (own) {
      overlaps.push(own.kind === 'cut' ? 0 : Math.max(0, own.sec));
      kinds.push(own.sec > 0 ? own.kind : 'cut');
    } else {
      overlaps.push(fallback);
      kinds.push(fallback > 0 ? 'fade' : 'cut');
    }
  }
  return { overlaps, kinds };
}

function holdOf(kind: CutTimelineKind | undefined, hold: number | undefined): number {
  return kind === 'clip' ? (hold && hold > 0 ? hold : 4) : (hold ?? DEFAULT_STILL_HOLD_SEC);
}

/**
 * When each shot starts (seconds) and how long the cut runs: a shot starts where the one
 * before ends, less its overlap (but at least 0.1 s after the one before starts).
 */
export function cutStarts(
  holds: number[],
  overlaps: number[]
): { starts: number[]; total: number } {
  const starts: number[] = [];
  let start = 0;
  let end = 0;
  for (let i = 0; i < holds.length; i += 1) {
    if (i > 0) start = Math.max(start + 0.1, end - (overlaps[i] ?? 0));
    starts.push(Number(start.toFixed(3)));
    end = start + holds[i]!;
  }
  return { starts, total: Number(end.toFixed(3)) };
}

/** When each shot starts in the cut (seconds), transitions counted — as the video joins them. */
export function filmShotStarts(input: {
  kinds: CutTimelineKind[];
  holdSecs: number[];
  crossfadeSec: number;
  transitions?: ReadonlyArray<CutTransitionIn | null | undefined>;
}): number[] {
  const holds = input.kinds.map((kind, i) => holdOf(kind, input.holdSecs[i]));
  const { overlaps } = cutJoins({
    count: input.kinds.length,
    crossfadeSec: input.crossfadeSec,
    transitions: input.transitions,
  });
  return cutStarts(holds, overlaps).starts;
}

/** Where each talking clip starts in the cut, and for how long it plays. */
export function filmSpeechStarts(input: {
  kinds: CutTimelineKind[];
  holdSecs: number[];
  crossfadeSec: number;
  transitions?: ReadonlyArray<CutTransitionIn | null | undefined>;
  speech?: boolean[];
}): Array<{ index: number; startSec: number; holdSec: number }> {
  if (!input.speech?.some(Boolean)) return [];
  const starts = filmShotStarts(input);
  const out: Array<{ index: number; startSec: number; holdSec: number }> = [];
  input.kinds.forEach((kind, i) => {
    if (kind === 'clip' && input.speech?.[i]) {
      out.push({ index: i, startSec: starts[i]!, holdSec: holdOf(kind, input.holdSecs[i]) });
    }
  });
  return out;
}
