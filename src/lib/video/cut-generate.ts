/**
 * Cut's generated shots: a missing shot or B-roll typed as words in the timeline. A picture is
 * rendered in the cut's own frame shape (no letterbox, no crop); a clip is that picture animated
 * (image to video on the bridge engine, cut-bridge.ts). Pure — the queueing is in useCutRoom.
 */

import type { FilmShape } from './resolution';

export type CutGeneratedStatus = 'rendering' | 'ready' | 'failed';

/** What a generated shot is waiting on: its picture, then (for a clip) the motion. */
export type CutGeneratedStage = 'still' | 'clip';

/** The render canvas for a frame shape (multiples of 16, about 1.2 MP). */
export function cutGenerateCanvas(shape: FilmShape): { width: number; height: number } {
  if (shape === 'vertical') return { width: 832, height: 1472 };
  if (shape === 'square') return { width: 1104, height: 1104 };
  return { width: 1472, height: 832 };
}

/** The still's prompt: the words as a film frame — photographic, no text or borders. */
export function cutGenerateStillPrompt(words: string): string {
  const scene = words
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '');
  return `A cinematic film still: ${scene}. Photoreal, natural light, shot on a cinema camera, one continuous frame.`;
}

export const CUT_GENERATE_NEGATIVE =
  'text, captions, watermark, logo, borders, frame, collage, split screen, letterbox, cartoon, illustration, blurry';

/** The clip's prompt: the same scene, gently moving, no cuts. */
export function cutGenerateClipPrompt(words: string): string {
  const scene = words
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '');
  return `${scene}. One continuous shot, no cut and no fade: natural, gentle motion in the scene and a slow, steady camera move.`;
}

/** A generated clip's frames: about 5 s at 16 fps. */
export const CUT_GENERATE_CLIP_FRAMES = 81;

/** Short label for the shot list / timeline. */
export function cutGeneratedTitle(words: string): string {
  const text = words.trim().replace(/\s+/g, ' ');
  return text.length > 40 ? `${text.slice(0, 39)}…` : text || 'Generated shot';
}
