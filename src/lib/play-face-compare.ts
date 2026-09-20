/**
 * Identity-compare pair for the Day quality gate: the plate that was queued as Image 1 and the
 * still that came back, drawn side by side into one image.
 *
 * Why one composite instead of two images: the vision endpoint takes a single image, and a
 * side-by-side panel lets a single-image model answer "same person?" without any multi-image
 * plumbing. The signal is weak for a small face in a wide shot, so the gate treats a mismatch as
 * a warning, never as grounds for an automatic reroll.
 */

import { coverRect, type CoverRect } from './cover-rect';

/** Square tile per panel. Big enough for a face to survive JPEG, small enough to stay cheap. */
export const FACE_COMPARE_TILE = 512;

export type FaceComparePairLayout = {
  width: number;
  height: number;
  /** Source rect + destination x for each panel. */
  left: CoverRect & { dx: number };
  right: CoverRect & { dx: number };
  tile: number;
};

/** Two square cover-cropped panels: reference on the left, new still on the right. */
export function faceComparePairLayout(
  referenceW: number,
  referenceH: number,
  stillW: number,
  stillH: number,
  tile = FACE_COMPARE_TILE
): FaceComparePairLayout {
  const size = Math.max(64, Math.round(tile));
  return {
    width: size * 2,
    height: size,
    left: { ...coverRect(referenceW, referenceH, size, size), dx: 0 },
    right: { ...coverRect(stillW, stillH, size, size), dx: size },
    tile: size,
  };
}

type LoadedImage = { width: number; height: number; draw: CanvasImageSource; close?: () => void };

async function loadImageSource(url: string): Promise<LoadedImage> {
  // Fetch to a blob first so a cross-origin still cannot taint the canvas.
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Could not load the comparison image (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: bitmap,
      close: () => bitmap.close(),
    };
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Could not decode the comparison image.'));
      element.src = objectUrl;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: image,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * Build the side-by-side data URL. Returns null (never throws) when either image cannot be
 * loaded or the browser has no canvas — the gate then reviews the still on its own.
 */
export async function buildFaceComparePair(input: {
  referenceUrl: string;
  stillUrl: string;
  tile?: number;
}): Promise<string | null> {
  if (typeof document === 'undefined') {
    return null;
  }
  let reference: LoadedImage | null = null;
  let still: LoadedImage | null = null;
  try {
    [reference, still] = await Promise.all([
      loadImageSource(input.referenceUrl),
      loadImageSource(input.stillUrl),
    ]);
    const layout = faceComparePairLayout(
      reference.width,
      reference.height,
      still.width,
      still.height,
      input.tile
    );
    const canvas = document.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#000';
    context.fillRect(0, 0, layout.width, layout.height);
    context.drawImage(
      reference.draw,
      layout.left.sx,
      layout.left.sy,
      layout.left.sw,
      layout.left.sh,
      layout.left.dx,
      0,
      layout.tile,
      layout.tile
    );
    context.drawImage(
      still.draw,
      layout.right.sx,
      layout.right.sy,
      layout.right.sw,
      layout.right.sh,
      layout.right.dx,
      0,
      layout.tile,
      layout.tile
    );
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return null;
  } finally {
    reference?.close?.();
    still?.close?.();
  }
}
