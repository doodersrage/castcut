import { h3FrameCount, isH3Model } from '../engine/h3-renderer';
import { isLtx25Model, LTX25_FPS, ltx25FrameCount } from '../video/ltx25-renderer';

/** Day clips are queued at WAN's rate; LTX-2.5 and MiniMax-H3 convert frames/fps to seconds. */
export const DAY_CLIP_FPS = 16;

/** The Animate sheet's Length choices: seconds added to the clip's default length. */
export const DAY_CLIP_EXTRA_SECONDS = [0, 2, 4, 6] as const;
export type DayClipExtraSeconds = (typeof DAY_CLIP_EXTRA_SECONDS)[number];

export function normalizeDayClipExtraSeconds(value: unknown): DayClipExtraSeconds {
  const n = Number(value);
  return (DAY_CLIP_EXTRA_SECONDS as readonly number[]).includes(n) ? (n as DayClipExtraSeconds) : 0;
}

/**
 * Frames for a Day clip at DAY_CLIP_FPS: motion ~4 s, talking ~5 s (a line of ~14 words), a
 * conversation ~6 s (two lines) — plus any extra seconds picked in the Animate sheet.
 */
export function dayClipFrames(input: {
  speaking: boolean;
  conversation: boolean;
  extraSeconds?: number;
}): number {
  const base = input.conversation ? 96 : input.speaking ? 80 : 64;
  return base + normalizeDayClipExtraSeconds(input.extraSeconds) * DAY_CLIP_FPS;
}

/** How long the clip comes out on its engine (LTX snaps to 8k+1 at 24 fps, H3 is ≥ ~5 s). */
export function dayClipSeconds(frames: number, engine: string): number {
  if (isLtx25Model(engine)) return ltx25FrameCount(frames, DAY_CLIP_FPS) / LTX25_FPS;
  if (isH3Model(engine)) return h3FrameCount(frames, DAY_CLIP_FPS) / 24;
  return frames / DAY_CLIP_FPS;
}
