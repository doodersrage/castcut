/**
 * Cut polish shared by the server ffmpeg encode and the browser fallback: slow zoom on stills
 * (so a stills-only cut isn't a slideshow), an opening title card, and a short caption per shot.
 * Client-safe — no Node imports.
 */

/** Opening title card: film title plus an optional second line. */
export type FilmTitleCard = {
  title: string;
  subtitle?: string;
  /** Shown after this many shots instead of first (after a "Previously on" recap). */
  afterShots?: number;
};

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

/** Caption burned onto a shot: the one edited in the Cut shot list, else the shot title. */
export function filmShotCaption(shot: {
  title?: string;
  caption?: string;
  captionless?: boolean;
}): string {
  if (shot.captionless) return '';
  return sanitizeFilmCaption(shot.caption?.trim() || shot.title);
}

/** Normalize a title card; null when there is no title to show. */
export function normalizeFilmTitleCard(value: unknown): FilmTitleCard | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { title?: unknown; subtitle?: unknown; afterShots?: unknown };
  const title = sanitizeFilmCaption(typeof raw.title === 'string' ? raw.title : '', 48);
  if (!title) return null;
  const subtitle = sanitizeFilmCaption(typeof raw.subtitle === 'string' ? raw.subtitle : '', 64);
  const afterShots =
    typeof raw.afterShots === 'number' && Number.isFinite(raw.afterShots) && raw.afterShots > 0
      ? Math.min(20, Math.floor(raw.afterShots))
      : 0;
  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(afterShots ? { afterShots } : {}),
  };
}

/**
 * A subtitle wrapped to lines of about `perLine` characters (at most three; the rest cut with an
 * ellipsis), ffmpeg-safe: drawtext reads the file as is, so quotes, % and backslashes are taken out.
 */
export function subtitleLines(text: string, perLine: number): string {
  const words = text
    .replace(/[\\%]/g, ' ')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const width = Math.max(12, perLine);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = `${lines[2]!.replace(/[.,;:!?]*$/, '')}…`;
  }
  return lines.join('\n');
}

/** End credits: at most this many lines, each this long. */
const CREDITS_MAX_LINES = 40;
const CREDITS_LINE_MAX = 80;

/** End credits text as its lines (blank lines kept as gaps, trimmed at both ends). */
export function normalizeFilmCredits(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const lines = value
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim().slice(0, CREDITS_LINE_MAX))
    .slice(0, CREDITS_MAX_LINES);
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

/** How long the credits roll: about 0.7 s a line, 5–30 s. */
export function creditsDurationSec(lines: readonly string[]): number {
  if (!lines.length) return 0;
  return Math.round(Math.min(30, Math.max(5, 3 + lines.length * 0.7)) * 10) / 10;
}

/** The credits' type size for a frame, and the gap between lines (both px). */
export function creditsTypeSize(width: number, height: number): { size: number; gap: number } {
  const size = Math.round(Math.min(width, height) * 0.045);
  return { size, gap: Math.round(size * 0.5) };
}

/** Where the roll's top is at `t` (px): from just under the frame to just over it. */
export function creditsRollTop(t: number, durSec: number, height: number, textHeight: number) {
  const p = durSec > 0 ? Math.min(1, Math.max(0, t / durSec)) : 1;
  return height - (height + textHeight) * p;
}

/** How far a clip's punch-in goes (1 → 1.15, or back). */
export const CLIP_MOVE_ZOOM = 0.15;

/** A clip's zoom at `t` of `durSec` for its move (1 = as shot): in pushes in, out pulls back. */
export function clipMoveZoom(move: 'in' | 'out' | undefined, t: number, durSec: number): number {
  if (!move || durSec <= 0) return 1;
  const p = Math.min(1, Math.max(0, t / durSec));
  return 1 + CLIP_MOVE_ZOOM * (move === 'in' ? p : 1 - p);
}

/** The same move for ffmpeg: a per-frame scale of the fitted frame, cropped back to the frame. */
export function clipMoveFilter(
  move: 'in' | 'out',
  durSec: number,
  width: number,
  height: number
): string {
  const z =
    move === 'in'
      ? `(1+${CLIP_MOVE_ZOOM}*min(t/${durSec},1))`
      : `(1+${CLIP_MOVE_ZOOM}*(1-min(t/${durSec},1)))`;
  return `scale=w='trunc(${width}*${z}/2)*2':h='trunc(${height}*${z}/2)*2':eval=frame,crop=${width}:${height}`;
}
