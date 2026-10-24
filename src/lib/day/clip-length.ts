import { h3FrameCount, H3_PART_FRAMES, isH3Model } from '../engine/h3-renderer';
import {
  isLtx25Model,
  LTX25_FPS,
  ltx25FrameCount,
  normalizeSpokenLine,
} from '../video/ltx25-renderer';
import { CLIP_EXTEND_MAX_SEGMENTS, WAN_EXTEND_BLEND_FRAMES } from '../clip/extend';
import type { DaySlotStill } from './planner';

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

/**
 * Talking clips on LTX-2.5 (one speaker): the Animate sheet's Length is the total dialogue. The
 * first clip is the default ~5 s with the slot's line; longer totals continue it in "Make it
 * 30 s" parts (clip/extend.ts), each saying its own next line.
 */
export const DAY_TALK_TOTAL_SECONDS = [5, 10, 15, 20, 30] as const;
export type DayTalkTotalSeconds = (typeof DAY_TALK_TOTAL_SECONDS)[number];

export function normalizeDayTalkTotalSeconds(value: unknown): DayTalkTotalSeconds {
  const n = Number(value);
  return (DAY_TALK_TOTAL_SECONDS as readonly number[]).includes(n) ? (n as DayTalkTotalSeconds) : 5;
}

/** An LTX extension part (extend-server.ts): 121 frames at 24 fps, 17 of them overlapping. */
export const DAY_TALK_PART_SECONDS = 121 / 24;
export const DAY_TALK_OVERLAP_SECONDS = 17 / 24;
const PART_GAIN = DAY_TALK_PART_SECONDS - DAY_TALK_OVERLAP_SECONDS;

/** Extra parts after a first clip of `firstSec` for a talking total (0 at the default). */
export function dayTalkExtraParts(firstSec: number, totalSec: number): number {
  if (normalizeDayTalkTotalSeconds(totalSec) <= DAY_TALK_TOTAL_SECONDS[0]) return 0;
  // The nearest whole number of parts, so each choice lands close to its label (rounding up made
  // "10 s" come out at ~13.7 s): ~9.4 / 13.7 / 18 / 31 s. extendBySec asks for exactly this many.
  const parts = Math.round(Math.max(0, totalSec - firstSec) / PART_GAIN);
  return Math.min(CLIP_EXTEND_MAX_SEGMENTS, Math.max(1, parts));
}

/** About how long the talking clip comes out with `parts` extra parts. */
export function dayTalkTotalOut(firstSec: number, parts: number): number {
  return firstSec + Math.max(0, parts) * PART_GAIN;
}

/**
 * `extendBySec` that asks the extend job for exactly `parts` parts: the server counts parts from
 * the clip it measures, so a length relative to the clip (half a part short of `parts` whole
 * parts) keeps the count — and so the lines — matching what the sheet showed.
 */
export function dayTalkExtendBySec(parts: number): number {
  return Math.round((Math.max(1, parts) - 0.5) * PART_GAIN * 100) / 100;
}

/**
 * MiniMax-H3 past its own shot (~5.2 s) cuts to a new one (H3_PART_FRAMES), so on H3 the Length
 * is a total too: the first clip at H3's length, then H3 parts (extend-server.ts replays its
 * graph from each part's last frame). A part starts on the last one's final frame (dropped) and
 * blends WAN_EXTEND_BLEND_FRAMES, so each adds this much.
 */
export const DAY_H3_PART_GAIN = (H3_PART_FRAMES - 1 - WAN_EXTEND_BLEND_FRAMES) / 24;

/** What each H3 part is told: the clip's own action carries on (its prompt follows). */
export const DAY_H3_CARRY_ON_BEAT =
  'The same moment carries straight on, the same action continuing smoothly.';

/** Extra H3 parts after a first clip of `firstSec` for a total (0 at the default). */
export function dayH3ExtraParts(firstSec: number, totalSec: number): number {
  if (normalizeDayTalkTotalSeconds(totalSec) <= DAY_TALK_TOTAL_SECONDS[0]) return 0;
  const parts = Math.round(Math.max(0, totalSec - firstSec) / DAY_H3_PART_GAIN);
  return Math.min(CLIP_EXTEND_MAX_SEGMENTS, Math.max(1, parts));
}

/** About how long an H3 clip comes out with `parts` extra parts. */
export function dayH3TotalOut(firstSec: number, parts: number): number {
  return firstSec + Math.max(0, parts) * DAY_H3_PART_GAIN;
}

/**
 * A clip queued to grow once it lands (DaySlotStill.pendingDialogue): longer dialogue on LTX-2.5,
 * or a longer MiniMax-H3 clip in wordless parts.
 */
export type DayPendingDialogue = {
  targetSec: number;
  /** One line per extra part ('' = that part is wordless). */
  lines: string[];
  tones?: string[];
  /** What happens in each part (unset: written from the scene). */
  beats?: string[];
  /** The clip job it waits for. */
  forClip?: string;
};

/**
 * What a slot's pending dialogue should do now: 'start' its extension (the clip it was queued
 * with has landed), 'wait' (still rendering), 'drop' (the clip failed or is another one), or
 * 'none' (nothing pending).
 */
export function pendingDialogueStep(
  still: Pick<
    DaySlotStill,
    'clipPromptId' | 'clipRenderPromptId' | 'clipStatus' | 'clipUrl' | 'pendingDialogue'
  >
): 'start' | 'wait' | 'drop' | 'none' {
  const pending = still.pendingDialogue;
  if (!pending) return 'none';
  const forClip = pending.forClip?.trim();
  // A voiced / kept copy names the job that rendered it in clipRenderPromptId.
  const sameClip =
    Boolean(forClip) &&
    (still.clipPromptId?.trim() === forClip || still.clipRenderPromptId?.trim() === forClip);
  if (!sameClip || !pending.lines.length || still.clipStatus === 'error') return 'drop';
  if (still.clipStatus === 'completed' && still.clipUrl?.trim()) return 'start';
  return 'wait';
}

/** What the Animate sheet hands back: a motion / short clip's extra seconds, or a talking total. */
export type DayAnimateChoice = {
  direction?: string;
  extraSeconds: DayClipExtraSeconds;
  /** Set when the Length picked was a total: one-person LTX-2.5 talk, or MiniMax-H3. */
  talkTotalSeconds?: DayTalkTotalSeconds;
  /** The lines for the extra parts, in order ('' = wordless). */
  lines?: string[];
  /** What happens in each extra part (H3: the clip's action carries on). */
  beats?: string[];
};

/** The Length pick to remember for the next Animate, or null when it has not changed. */
export function dayAnimateSettingsPatch(
  choice: DayAnimateChoice,
  settings: { dayClipExtraSeconds?: number; dayTalkTotalSeconds?: number }
): { dayClipExtraSeconds: number } | { dayTalkTotalSeconds: number } | null {
  if (choice.talkTotalSeconds !== undefined) {
    return choice.talkTotalSeconds !== normalizeDayTalkTotalSeconds(settings.dayTalkTotalSeconds)
      ? { dayTalkTotalSeconds: choice.talkTotalSeconds }
      : null;
  }
  return choice.extraSeconds !== (settings.dayClipExtraSeconds ?? 0)
    ? { dayClipExtraSeconds: choice.extraSeconds }
    : null;
}

/**
 * animateSlot's options for the choice. A talking total queues the default first clip (no
 * extra seconds) and the lines to continue it with once it lands.
 */
export function dayAnimateOptions(choice: DayAnimateChoice): {
  direction?: string;
  extraSeconds: number;
  dialogue?: { targetSec: number; lines: string[]; beats?: string[] };
} {
  if (choice.talkTotalSeconds === undefined) {
    return { direction: choice.direction, extraSeconds: choice.extraSeconds };
  }
  const lines = (choice.lines ?? []).slice(0, CLIP_EXTEND_MAX_SEGMENTS).map(normalizeSpokenLine);
  const beats = choice.beats?.slice(0, lines.length);
  const direction = choice.direction ? { direction: choice.direction } : {};
  return choice.talkTotalSeconds > DAY_TALK_TOTAL_SECONDS[0] && lines.length
    ? {
        ...direction,
        extraSeconds: 0,
        dialogue: {
          targetSec: choice.talkTotalSeconds,
          lines,
          ...(beats?.length ? { beats } : {}),
        },
      }
    : { ...direction, extraSeconds: 0 };
}
