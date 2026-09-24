/**
 * Cut polish shared by the server ffmpeg encode and the browser fallback: slow zoom on stills
 * (so a stills-only cut isn't a slideshow), an opening title card, and a short caption per shot.
 * Client-safe — no Node imports.
 */

/** Opening title card: film title plus an optional second line. */
export type FilmTitleCard = { title: string; subtitle?: string };

export const TITLE_CARD_SEC = 2.4;

/** How far a still zooms over its hold (1 → 1.1). Subtle on purpose. */
export const STILL_MOTION_ZOOM = 0.1;

/** Output frame rate the ffmpeg zoom is rendered at (matches `buildFilmScaleFilter`). */
export const STILL_MOTION_FPS = 30;

/** Captions fade in, hold, and fade out within the first few seconds of a shot. */
const CAPTION_FADE_IN = 0.4;
const CAPTION_HOLD_UNTIL = 2.6;
const CAPTION_FADE_OUT = 0.6;

/**
 * Zoom factor for still `index` at `progress` (0–1 through its hold). Even shots push in,
 * odd shots pull out, so consecutive stills don't all move the same way.
 */
export function stillMotionZoom(
  index: number,
  progress: number,
  amount = STILL_MOTION_ZOOM
): number {
  const p = Math.min(1, Math.max(0, progress));
  return index % 2 === 0 ? 1 + amount * p : 1 + amount * (1 - p);
}

/** ffmpeg zoompan `z` expression for the same curve (`on` = output frame, `frames` = hold). */
export function stillMotionZoomExpr(
  index: number,
  frames: number,
  amount = STILL_MOTION_ZOOM
): string {
  const d = Math.max(1, Math.round(frames));
  return index % 2 === 0 ? `1+${amount}*on/${d}` : `${1 + amount}-${amount}*on/${d}`;
}

/** Caption opacity at `t` seconds into a shot of `holdSec` (fits short shots too). */
export function captionOpacity(t: number, holdSec: number): number {
  const end = Math.min(CAPTION_HOLD_UNTIL + CAPTION_FADE_OUT, Math.max(1, holdSec - 0.2));
  const holdUntil = Math.max(CAPTION_FADE_IN, end - CAPTION_FADE_OUT);
  if (t < 0 || t >= end) return 0;
  if (t < CAPTION_FADE_IN) return t / CAPTION_FADE_IN;
  if (t < holdUntil) return 1;
  return Math.max(0, (end - t) / (end - holdUntil));
}

/** ffmpeg drawtext `alpha` expression for {@link captionOpacity}. */
export function captionAlphaExpr(holdSec: number): string {
  const end = Math.min(CAPTION_HOLD_UNTIL + CAPTION_FADE_OUT, Math.max(1, holdSec - 0.2));
  const holdUntil = Math.max(CAPTION_FADE_IN, end - CAPTION_FADE_OUT);
  const f = (n: number) => n.toFixed(2);
  return `if(lt(t,${f(CAPTION_FADE_IN)}),t/${f(CAPTION_FADE_IN)},if(lt(t,${f(holdUntil)}),1,if(lt(t,${f(end)}),(${f(end)}-t)/${f(end - holdUntil)},0)))`;
}

/** One short line: collapse whitespace, drop control characters, cap the length. */
export function sanitizeFilmCaption(text: string | null | undefined, max = 60): string {
  const clean = String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Normalize a title card; null when there is no title to show. */
export function normalizeFilmTitleCard(value: unknown): FilmTitleCard | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { title?: unknown; subtitle?: unknown };
  const title = sanitizeFilmCaption(typeof raw.title === 'string' ? raw.title : '', 48);
  if (!title) return null;
  const subtitle = sanitizeFilmCaption(typeof raw.subtitle === 'string' ? raw.subtitle : '', 64);
  return subtitle ? { title, subtitle } : { title };
}
