'use client';

import { greyValues, looksLikeSamePicture, SIMILARITY_THUMB } from './image-similarity';

async function greyThumbnail(url: string): Promise<number[] | null> {
  try {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image did not load'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = SIMILARITY_THUMB;
    canvas.height = SIMILARITY_THUMB;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    // White behind a cut-out, as the plate is shown.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, SIMILARITY_THUMB, SIMILARITY_THUMB);
    context.drawImage(image, 0, 0, SIMILARITY_THUMB, SIMILARITY_THUMB);
    return greyValues(context.getImageData(0, 0, SIMILARITY_THUMB, SIMILARITY_THUMB).data);
  } catch {
    return null;
  }
}

/** True when the two pictures are the same picture; null when either could not be read. */
export async function picturesLookTheSame(a: string, b: string): Promise<boolean | null> {
  const [first, second] = await Promise.all([greyThumbnail(a), greyThumbnail(b)]);
  if (!first || !second) return null;
  return looksLikeSamePicture(first, second);
}
