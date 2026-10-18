/**
 * Hand-set pan and zoom on a still (the shot list's "custom" move): where the frame starts and
 * where it ends, each a named framing of the picture. The move eases in and out. The render
 * (zoompan in video-server-encode.ts) and the monitor (useCutPreview.ts) follow the same path.
 */

export type CutFraming =
  | 'whole'
  | 'centre'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'tight';

export const CUT_FRAMINGS: ReadonlyArray<{ id: CutFraming; label: string }> = [
  { id: 'whole', label: 'whole picture' },
  { id: 'centre', label: 'closer, centre' },
  { id: 'tight', label: 'close, centre' },
  { id: 'top', label: 'closer, top' },
  { id: 'bottom', label: 'closer, bottom' },
  { id: 'left', label: 'closer, left' },
  { id: 'right', label: 'closer, right' },
  { id: 'top-left', label: 'closer, top left' },
  { id: 'top-right', label: 'closer, top right' },
  { id: 'bottom-left', label: 'closer, bottom left' },
  { id: 'bottom-right', label: 'closer, bottom right' },
];

/** A framing's centre (0–1 of the frame) and zoom (1 = the whole frame). */
export type FramePoint = { x: number; y: number; zoom: number };

const CLOSER = 1.45;

export function framingPoint(framing: CutFraming | undefined): FramePoint {
  switch (framing) {
    case 'centre':
      return { x: 0.5, y: 0.5, zoom: CLOSER };
    case 'tight':
      return { x: 0.5, y: 0.45, zoom: 2 };
    case 'top':
      return { x: 0.5, y: 0, zoom: CLOSER };
    case 'bottom':
      return { x: 0.5, y: 1, zoom: CLOSER };
    case 'left':
      return { x: 0, y: 0.5, zoom: CLOSER };
    case 'right':
      return { x: 1, y: 0.5, zoom: CLOSER };
    case 'top-left':
      return { x: 0, y: 0, zoom: CLOSER };
    case 'top-right':
      return { x: 1, y: 0, zoom: CLOSER };
    case 'bottom-left':
      return { x: 0, y: 1, zoom: CLOSER };
    case 'bottom-right':
      return { x: 1, y: 1, zoom: CLOSER };
    default:
      return { x: 0.5, y: 0.5, zoom: 1 };
  }
}

export function normalizeCutFraming(value: unknown): CutFraming | undefined {
  return CUT_FRAMINGS.some(framing => framing.id === value) ? (value as CutFraming) : undefined;
}

const ease = (p: number) => {
  const c = Math.min(1, Math.max(0, p));
  return c * c * (3 - 2 * c);
};

/**
 * Where the picture sits in the frame (0–1): all of it when it fills the frame, a centred band
 * when a different-shaped still is letterboxed / pillarboxed into it.
 */
export type PictureBox = { x: number; y: number; w: number; h: number };
export const FULL_BOX: PictureBox = { x: 0, y: 0, w: 1, h: 1 };

/** The picture's box in a contain-fitted frame. */
export function containBox(
  picture: { width: number; height: number },
  frame: { width: number; height: number }
): PictureBox {
  const pa = picture.width / Math.max(1, picture.height);
  const fa = frame.width / Math.max(1, frame.height);
  if (Math.abs(pa - fa) < 0.01) return FULL_BOX;
  return pa < fa
    ? { x: (1 - pa / fa) / 2, y: 0, w: pa / fa, h: 1 }
    : { x: 0, y: (1 - fa / pa) / 2, w: 1, h: fa / pa };
}

/**
 * The window's centre on one axis: the framing's point inside the picture, and the window kept
 * on the picture (no black bands) when it fits there — centred in the frame when it does not.
 */
function placeCentre(point: number, zoom: number, start: number, size: number): number {
  const half = 0.5 / zoom;
  const lo = start + half;
  const hi = start + size - half;
  if (hi < lo) return Math.min(1 - half, Math.max(half, 0.5));
  return Math.min(hi, Math.max(lo, start + point * size));
}

/** Where the frame is at `p` (0–1 through the shot), within the picture's box. */
export function moveAt(
  from: FramePoint,
  to: FramePoint,
  p: number,
  box: PictureBox = FULL_BOX
): FramePoint {
  const e = ease(p);
  const zoom = from.zoom + (to.zoom - from.zoom) * e;
  return {
    zoom,
    x: placeCentre(from.x + (to.x - from.x) * e, zoom, box.x, box.w),
    y: placeCentre(from.y + (to.y - from.y) * e, zoom, box.y, box.h),
  };
}

/**
 * zoompan `z`, `x`, `y` for the move over `frames` output frames (`on` is zoompan's frame
 * number; iw / ih the input it zooms within).
 */
export function moveZoompanExprs(
  from: FramePoint,
  to: FramePoint,
  frames: number,
  box: PictureBox = FULL_BOX
): { z: string; x: string; y: string } {
  const n = (v: number) => Number(v.toFixed(4)).toString();
  const p = `min(1,on/${Math.max(1, frames - 1)})`;
  const e = `(${p})*(${p})*(3-2*(${p}))`;
  const z = `${n(from.zoom)}+(${n(to.zoom - from.zoom)})*${e}`;
  // As placeCentre, in pixels of the window's top-left: kept on the picture when it fits.
  const axis = (a: number, b: number, start: number, size: number, dim: 'iw' | 'ih') => {
    const centre = `(${n(start)}+(${n(a)}+(${n(b - a)})*${e})*${n(size)})*${dim}`;
    const lo = `${n(start)}*${dim}`;
    const hi = `${n(start + size)}*${dim}-${dim}/zoom`;
    return `if(gte(${hi},${lo}),max(${lo},min(${hi},${centre}-${dim}/zoom/2)),(${dim}-${dim}/zoom)/2)`;
  };
  return {
    z,
    x: axis(from.x, to.x, box.x, box.w, 'iw'),
    y: axis(from.y, to.y, box.y, box.h, 'ih'),
  };
}
