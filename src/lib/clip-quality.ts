/**
 * Animate clip checks (pure). A few frames are sampled from each finished Day clip in the
 * browser; these helpers judge whether the clip actually moves, whether any sampled frame went
 * blank, and whether the face at the end still matches the Cast (I2V faces drift over a clip).
 * Clips are only flagged — a re-animate is a full video render, so the player decides.
 */

import { DEFAULT_MIN_FACE_MATCH, FACE_MATCH_WARN_BELOW } from '@/lib/face-match';

/** Grayscale thumbnail of one sampled frame, values 0–1, all the same size. */
export type FrameLuma = number[];

/** Below this mean frame-to-frame change the clip reads as a still. */
export const CLIP_MIN_MOTION = 0.012;

export function frameMean(frame: FrameLuma): number {
  return frame.length ? frame.reduce((sum, v) => sum + v, 0) / frame.length : 0;
}

function frameStdev(frame: FrameLuma): number {
  const mean = frameMean(frame);
  return frame.length
    ? Math.sqrt(frame.reduce((sum, v) => sum + (v - mean) ** 2, 0) / frame.length)
    : 0;
}

/** A near-uniform frame (black, white, or one flat colour) — a decode or render failure. */
export function frameIsBlank(frame: FrameLuma): boolean {
  return frame.length > 0 && frameStdev(frame) < 0.02;
}

/** Mean absolute change between consecutive sampled frames (0 = identical). */
export function clipMotion(frames: FrameLuma[]): number {
  if (frames.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1]!;
    const b = frames[i]!;
    const n = Math.min(a.length, b.length);
    if (n === 0) continue;
    let diff = 0;
    for (let j = 0; j < n; j += 1) diff += Math.abs(a[j]! - b[j]!);
    total += diff / n;
    pairs += 1;
  }
  return pairs ? total / pairs : 0;
}

export type ClipCheck = {
  clipUrl: string;
  /** 'warn' when something is worth re-animating; 'ok' otherwise. */
  status: 'ok' | 'warn';
  notes: string[];
  motion: number;
  faceMatch?: number;
};

export function decideClipQuality(input: {
  clipUrl: string;
  frames: FrameLuma[];
  faceMatch?: number | null;
}): ClipCheck {
  const motion = clipMotion(input.frames);
  const notes: string[] = [];
  let warn = false;
  if (input.frames.some(frameIsBlank)) {
    notes.push('blank frames');
    warn = true;
  }
  if (input.frames.length >= 2 && motion < CLIP_MIN_MOTION) {
    notes.push('barely moves');
    warn = true;
  }
  const face = input.faceMatch;
  if (typeof face === 'number') {
    const pct = Math.round(face * 100);
    if (face < DEFAULT_MIN_FACE_MATCH) {
      notes.push(`face drifted from the Cast (${pct}%)`);
      warn = true;
    } else if (face < FACE_MATCH_WARN_BELOW) {
      notes.push(`face match ${pct}% at the end`);
    }
  }
  return {
    clipUrl: input.clipUrl,
    status: warn ? 'warn' : 'ok',
    notes,
    motion,
    ...(typeof face === 'number' ? { faceMatch: face } : {}),
  };
}

/** Slot card line for a checked clip, or null when there is nothing to say. */
export function clipCheckLabel(check: ClipCheck | undefined): string | null {
  if (!check || check.notes.length === 0) return null;
  return `Clip: ${check.notes.join(', ')}${check.status === 'warn' ? ' — try Animate again' : ''}`;
}
