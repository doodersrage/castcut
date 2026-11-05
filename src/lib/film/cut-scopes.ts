/**
 * The monitor's colour scopes, from its frame's pixels: a luma waveform (each column's
 * brightness, bottom black to top white) and a vectorscope (each pixel's hue and saturation
 * around the centre, the skin-tone line marked). For reading exposure and skin across shots
 * now that each shot has its own colour (cut-look.ts). Pure.
 */

/** Rec. 709 luma of an RGB pixel (0–255 → 0–1). */
export function luma709(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * The waveform: for each of `columns` columns, how many pixels sit at each of `rows` brightness
 * levels (row 0 = black). Counts, column-major: `counts[col * rows + row]`.
 */
export function waveformCounts(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  columns: number,
  rows: number
): Uint32Array {
  const counts = new Uint32Array(columns * rows);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const col = Math.min(columns - 1, Math.floor((x / width) * columns));
      const row = Math.min(
        rows - 1,
        Math.floor(luma709(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!) * rows)
      );
      counts[col * rows + row]! += 1;
    }
  }
  return counts;
}

/**
 * A pixel's place on the vectorscope: its Cb / Cr (Rec. 709), each −0.5…0.5, x to the right for
 * blue, y up for red — so reds sit upper left, blues right, greens lower left, as on a scope.
 */
export function vectorPoint(r: number, g: number, b: number): { x: number; y: number } {
  const y = luma709(r, g, b);
  const cb = (b / 255 - y) / 1.8556;
  const cr = (r / 255 - y) / 1.5748;
  return { x: cb, y: cr };
}

/**
 * The skin-tone line's angle on that scope (radians, from +x, counter-clockwise): where the
 * hues of every skin sit, whatever its shade — about 123° on a standard vectorscope.
 */
export const SKIN_LINE_RAD = (123 * Math.PI) / 180;

/** How far the frame's brightest and darkest pixels are clipped (0–1 of the pixels at each end). */
export function clippedShares(rgba: ArrayLike<number>): { black: number; white: number } {
  let black = 0;
  let white = 0;
  let count = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const value = luma709(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    if (value <= 0.02) black += 1;
    if (value >= 0.98) white += 1;
    count += 1;
  }
  return count ? { black: black / count, white: white / count } : { black: 0, white: 0 };
}
