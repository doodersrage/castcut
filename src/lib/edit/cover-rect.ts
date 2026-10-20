/**
 * Center-crop geometry shared by the poster frame and the identity-compare pair.
 * Pure — no canvas, no DOM.
 */

export type CoverRect = { sx: number; sy: number; sw: number; sh: number };

/**
 * Source rect that fills a dst box without distortion (the `object-fit: cover` rect).
 * Degenerate sizes fall back to the whole source so a draw is never zero-sized.
 */
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number): CoverRect {
  const sourceW = srcW > 0 ? srcW : 1;
  const sourceH = srcH > 0 ? srcH : 1;
  if (dstW <= 0 || dstH <= 0) {
    return { sx: 0, sy: 0, sw: sourceW, sh: sourceH };
  }
  const srcAspect = sourceW / sourceH;
  const dstAspect = dstW / dstH;
  if (srcAspect > dstAspect) {
    // Source is wider — trim the sides.
    const sw = sourceH * dstAspect;
    return { sx: (sourceW - sw) / 2, sy: 0, sw, sh: sourceH };
  }
  // Source is taller (or equal) — trim top and bottom.
  const sh = sourceW / dstAspect;
  return { sx: 0, sy: (sourceH - sh) / 2, sw: sourceW, sh };
}
