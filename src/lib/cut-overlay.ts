/**
 * Cut overlays: a lower third on a shot (a name or a line, bottom left), a picture in a corner of
 * a shot (picture-in-picture) and a logo / watermark over the whole film. The render
 * (video-server-encode.ts) and the monitor (useCutPreview.ts) place them from the same numbers.
 */

export type OverlayCorner = 'tl' | 'tr' | 'bl' | 'br';

export const OVERLAY_CORNERS: ReadonlyArray<{ id: OverlayCorner; label: string }> = [
  { id: 'tr', label: 'top right' },
  { id: 'tl', label: 'top left' },
  { id: 'br', label: 'bottom right' },
  { id: 'bl', label: 'bottom left' },
];

export function normalizeOverlayCorner(value: unknown, fallback: OverlayCorner): OverlayCorner {
  return value === 'tl' || value === 'tr' || value === 'bl' || value === 'br' ? value : fallback;
}

/** A picture-in-picture is this share of the frame's width; a logo this share. */
export const PIP_WIDTH = 0.32;
export const LOGO_WIDTH = 0.12;
/** Gap from the frame's edge, as a share of its shorter side. */
export const OVERLAY_MARGIN = 0.04;

/** Where an overlay of `w`×`h` goes in a `frameW`×`frameH` frame. */
export function overlayBox(
  corner: OverlayCorner,
  frame: { width: number; height: number },
  size: { width: number; height: number }
): { x: number; y: number } {
  const margin = Math.round(Math.min(frame.width, frame.height) * OVERLAY_MARGIN);
  const x = corner === 'tl' || corner === 'bl' ? margin : frame.width - size.width - margin;
  const y = corner === 'tl' || corner === 'tr' ? margin : frame.height - size.height - margin;
  return { x: Math.round(x), y: Math.round(y) };
}

/** ffmpeg overlay x / y for a corner (W/H the frame, w/h the overlay). */
export function overlayFfmpegXY(corner: OverlayCorner, marginPx: number): string {
  const x = corner === 'tl' || corner === 'bl' ? `${marginPx}` : `W-w-${marginPx}`;
  const y = corner === 'tl' || corner === 'tr' ? `${marginPx}` : `H-h-${marginPx}`;
  return `x=${x}:y=${y}`;
}

/** Lower-third text kept to one short line each. */
export function cleanLowerThird(value: unknown, max = 60): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** A lower third's opacity at `local` seconds into a `hold`-second shot: in at 0.4 s, out before the end. */
export function lowerThirdAlpha(local: number, hold: number): number {
  const fade = 0.35;
  const start = Math.min(0.4, hold * 0.1);
  const end = Math.max(start + fade, hold - 0.3);
  if (local < start) return 0;
  if (local < start + fade) return (local - start) / fade;
  if (local > end) return 0;
  if (local > end - fade) return (end - local) / fade;
  return 1;
}

/** The same fade as an ffmpeg drawtext alpha expression. */
export function lowerThirdAlphaExpr(hold: number): string {
  const fade = 0.35;
  const start = Math.min(0.4, hold * 0.1);
  const end = Math.max(start + fade, hold - 0.3);
  const f = (v: number) => v.toFixed(3);
  return (
    `if(lt(t,${f(start)}),0,if(lt(t,${f(start + fade)}),(t-${f(start)})/${fade},` +
    `if(gt(t,${f(end)}),0,if(gt(t,${f(end - fade)}),(${f(end)}-t)/${fade},1))))`
  );
}
