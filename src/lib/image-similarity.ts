/**
 * Whether two pictures are the same picture, give or take resampling — for a try-on that came
 * back as the plate it started from (the model ignored the clothing: one seed in four live on
 * Qwen-Image 2.1). Compared as small grey thumbnails, so size and compression do not matter.
 */

/** Side of the grey thumbnail both pictures are reduced to. */
export const SIMILARITY_THUMB = 24;

/** Mean absolute grey difference (0–255) under which two thumbnails are the same picture. */
export const SAME_PICTURE_MAX_DIFF = 8;

/** RGBA pixels → grey values. */
export function greyValues(rgba: ArrayLike<number>): number[] {
  const grey: number[] = [];
  for (let index = 0; index + 3 < rgba.length; index += 4) {
    grey.push(0.299 * rgba[index]! + 0.587 * rgba[index + 1]! + 0.114 * rgba[index + 2]!);
  }
  return grey;
}

/** Mean absolute difference of two equal-length grey thumbnails, or null when they differ in size. */
export function meanGreyDifference(a: readonly number[], b: readonly number[]): number | null {
  if (a.length === 0 || a.length !== b.length) return null;
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += Math.abs(a[index]! - b[index]!);
  }
  return total / a.length;
}

export function looksLikeSamePicture(a: readonly number[], b: readonly number[]): boolean {
  const difference = meanGreyDifference(a, b);
  return difference !== null && difference < SAME_PICTURE_MAX_DIFF;
}
