/**
 * A clip's in and out points in a cut (the Cut shot list's trim). Shared: both film encoders
 * (video-assemble.ts in the browser, video-server-encode.ts with ffmpeg) play only this piece.
 */

export type ClipTrim = { trimStartSec?: number; trimEndSec?: number };

/** Shortest piece of a clip a trim may leave. */
export const MIN_CLIP_TRIM_SEC = 0.5;

/**
 * The part of a clip the cut plays: from `start` to `end` (null = the clip's end). A trim that
 * would leave less than {@link MIN_CLIP_TRIM_SEC}, or runs past a known length, is pulled back.
 */
export function clipTrimWindow(
  shot: ClipTrim,
  durationSec?: number | null
): { start: number; end: number | null } {
  const known = typeof durationSec === 'number' && durationSec > 0 ? durationSec : null;
  let start =
    typeof shot.trimStartSec === 'number' && shot.trimStartSec > 0 ? shot.trimStartSec : 0;
  let end = typeof shot.trimEndSec === 'number' && shot.trimEndSec > 0 ? shot.trimEndSec : null;
  if (known != null) {
    if (end != null && end > known) end = null;
    start = Math.min(start, Math.max(0, known - MIN_CLIP_TRIM_SEC));
  }
  if (end != null && end - start < MIN_CLIP_TRIM_SEC) {
    end = start + MIN_CLIP_TRIM_SEC;
    if (known != null && end > known) end = null;
  }
  return { start: round2(start), end: end == null ? null : round2(end) };
}

/** Is this clip trimmed at all? */
export function clipIsTrimmed(shot: ClipTrim): boolean {
  return (shot.trimStartSec ?? 0) > 0 || (shot.trimEndSec ?? 0) > 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
