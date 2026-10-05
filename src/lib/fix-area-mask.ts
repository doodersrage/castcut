/**
 * "Fix an area" mask math (pure — the server runs it on decoded pixels, the tests on tiny ones).
 *
 * The player paints the area to fix. From that painted mask P:
 * - the SOFT mask is P grown by the feather radius r and box-blurred by r: 255 everywhere on P,
 *   a ramp over the next 2r pixels, 0 beyond — the composite takes the new pixels on P, blends
 *   across the ramp and keeps the original, byte for byte, everywhere else;
 * - the HARD mask (the sampler's noise mask, and the grey fill) is P grown by 2r plus a margin,
 *   so the regenerated area covers the whole ramp and its edge (where a latent noise mask leaves
 *   a faint 1-px seam — the limb-repair study, 2026-10-03) lies outside the composite.
 *
 * Masks are one byte per pixel, 0 = keep, 255 = fix.
 */

export type MaskSize = { width: number; height: number };

/** Feather radius for a still: about 0.6% of its long side, never under 4 px. */
export function fixAreaFeatherRadius(size: MaskSize): number {
  return Math.max(4, Math.round(Math.max(size.width, size.height) * 0.006));
}

/** Extra growth of the hard mask past the soft ramp: one latent cell (8 px) plus a pixel. */
export const FIX_AREA_HARD_MARGIN = 9;

/** 0/255 from any 8-bit coverage (a brush's anti-aliased edge counts from half). */
export function binarizeMask(values: Uint8Array, threshold = 128): Uint8Array {
  const out = new Uint8Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    out[index] = values[index]! >= threshold ? 255 : 0;
  }
  return out;
}

/** One channel out of interleaved pixels (RGB = 3, RGBA = 4). */
export function maskFromChannel(pixels: Uint8Array, channels: number, channel = 0): Uint8Array {
  const count = Math.floor(pixels.length / channels);
  const out = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) out[index] = pixels[index * channels + channel]!;
  return out;
}

/** Painted pixels (value > 0). */
export function maskArea(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) if (value > 0) count += 1;
  return count;
}

/**
 * Grow a mask by `radius` pixels (square structuring element, max filter in two separable
 * passes). Any nonzero pixel counts as painted; the result is 0/255.
 */
export function dilateMask(mask: Uint8Array, size: MaskSize, radius: number): Uint8Array {
  const { width, height } = size;
  const r = Math.max(0, Math.round(radius));
  const src = binarizeMask(mask, 1);
  if (r === 0) return src;
  const horizontal = new Uint8Array(src.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    // Distance to the nearest painted pixel to the left / right, in one sweep each way.
    let last = -Infinity;
    const leftDistance = new Float64Array(width);
    for (let x = 0; x < width; x += 1) {
      if (src[row + x]) last = x;
      leftDistance[x] = x - last;
    }
    last = Infinity;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (src[row + x]) last = x;
      horizontal[row + x] = Math.min(leftDistance[x]!, last - x) <= r ? 255 : 0;
    }
  }
  const out = new Uint8Array(src.length);
  const topDistance = new Float64Array(height);
  for (let x = 0; x < width; x += 1) {
    let last = -Infinity;
    for (let y = 0; y < height; y += 1) {
      if (horizontal[y * width + x]) last = y;
      topDistance[y] = y - last;
    }
    last = Infinity;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (horizontal[y * width + x]) last = y;
      out[y * width + x] = Math.min(topDistance[y]!, last - y) <= r ? 255 : 0;
    }
  }
  return out;
}

/** Box blur of radius `radius` (separable, edges clamped), rounded to bytes. */
export function boxBlurMask(mask: Uint8Array, size: MaskSize, radius: number): Uint8Array {
  const { width, height } = size;
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return Uint8Array.from(mask);
  const span = 2 * r + 1;
  const horizontal = new Float64Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let k = -r; k <= r; k += 1) sum += mask[row + Math.min(width - 1, Math.max(0, k))]!;
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / span;
      const drop = mask[row + Math.min(width - 1, Math.max(0, x - r))]!;
      const add = mask[row + Math.min(width - 1, Math.max(0, x + r + 1))]!;
      sum += add - drop;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -r; k <= r; k += 1)
      sum += horizontal[Math.min(height - 1, Math.max(0, k)) * width + x]!;
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = Math.round(sum / span);
      const drop = horizontal[Math.min(height - 1, Math.max(0, y - r)) * width + x]!;
      const add = horizontal[Math.min(height - 1, Math.max(0, y + r + 1)) * width + x]!;
      sum += add - drop;
    }
  }
  return out;
}

/** The soft (composite) mask: 255 on the painted area, a 2r ramp outside it, 0 beyond. */
export function featherMask(painted: Uint8Array, size: MaskSize, radius: number): Uint8Array {
  const r = Math.max(1, Math.round(radius));
  const soft = boxBlurMask(dilateMask(painted, size, r), size, r);
  // The painted area itself is always taken whole (a blur never lowers it below 255 there, but
  // clamp so rounding at image borders cannot either).
  for (let index = 0; index < soft.length; index += 1) if (painted[index]) soft[index] = 255;
  return soft;
}

/** The hard (noise / grey-fill) mask: the painted area grown past the whole soft ramp. */
export function hardMask(painted: Uint8Array, size: MaskSize, radius: number): Uint8Array {
  return dilateMask(painted, size, 2 * Math.max(1, Math.round(radius)) + FIX_AREA_HARD_MARGIN);
}

export type FixAreaMasks = {
  soft: Uint8Array;
  hard: Uint8Array;
  radius: number;
  /** Painted pixels before growing. */
  area: number;
};

/** Both masks for a painted mask at the still's own size. */
export function buildFixAreaMasks(painted: Uint8Array, size: MaskSize): FixAreaMasks {
  const binary = binarizeMask(painted);
  const radius = fixAreaFeatherRadius(size);
  return {
    soft: featherMask(binary, size, radius),
    hard: hardMask(binary, size, radius),
    radius,
    area: maskArea(binary),
  };
}

/**
 * Masked composite of interleaved 8-bit pixels: out = (dest·(255−m) + src·m) / 255, rounded.
 * m = 0 gives the destination byte for byte; m = 255 the source.
 */
export function compositeMasked(
  destination: Uint8Array,
  source: Uint8Array,
  mask: Uint8Array,
  channels: number
): Uint8Array {
  const out = new Uint8Array(destination.length);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const m = mask[pixel]!;
    for (let c = 0; c < channels; c += 1) {
      const index = pixel * channels + c;
      out[index] =
        m === 0
          ? destination[index]!
          : m === 255
            ? source[index]!
            : Math.round((destination[index]! * (255 - m) + source[index]! * m) / 255);
    }
  }
  return out;
}

/** Mid grey, the fill the limb-repair study used for the area to repaint. */
export const FIX_AREA_GREY = 128;

/** The still with the hard-mask area filled flat grey (Image 1 of the grey variant). */
export function fillMaskedGrey(
  pixels: Uint8Array,
  mask: Uint8Array,
  channels: number,
  grey = FIX_AREA_GREY
): Uint8Array {
  return compositeMasked(pixels, new Uint8Array(pixels.length).fill(grey), mask, channels);
}

/**
 * Pixels that differ between two images outside a mask (where the mask is 0) — the "nothing
 * else changed" check. Returns the count and the largest channel difference.
 */
export function diffOutsideMask(
  a: Uint8Array,
  b: Uint8Array,
  mask: Uint8Array,
  channels: number
): { pixels: number; maxDelta: number } {
  let pixels = 0;
  let maxDelta = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel]) continue;
    let differs = false;
    for (let c = 0; c < channels; c += 1) {
      const delta = Math.abs(a[pixel * channels + c]! - b[pixel * channels + c]!);
      if (delta > 0) differs = true;
      if (delta > maxDelta) maxDelta = delta;
    }
    if (differs) pixels += 1;
  }
  return { pixels, maxDelta };
}
