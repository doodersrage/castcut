/**
 * A landed still's white shares, measured in the browser (still-backdrop.ts): fetched, drawn
 * small on a canvas, counted. Null when it could not be measured — the check fails open.
 */
import {
  STILL_BACKDROP_SAMPLE,
  stillBackdropShares,
  type StillBackdropShares,
} from './still-backdrop';

export async function measureStillBackdrop(imageUrl: string): Promise<StillBackdropShares | null> {
  const url = imageUrl.trim();
  if (!url || typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return null;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const { width, height } = STILL_BACKDROP_SAMPLE;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return stillBackdropShares(context.getImageData(0, 0, width, height).data, width, height, 4);
  } catch {
    return null;
  }
}
