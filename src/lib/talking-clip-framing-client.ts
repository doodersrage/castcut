'use client';

import { locateFaceOnPlateBlob } from './face-locate-client';
import { talkingClipCropRect } from './talking-clip-framing';

/**
 * The still a talking clip starts from: a chest-up crop around the face when the face is small
 * (talking-clip-framing.ts), else null (use the still as it is). Never throws — a still that
 * can't be read or has no face found animates uncropped.
 */
export async function framedTalkingStill(imageUrl: string): Promise<File | null> {
  try {
    const response = await fetch(imageUrl, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const located = await locateFaceOnPlateBlob(blob);
    if (!located?.available || !located.face) return null;
    const bitmap = await createImageBitmap(blob);
    try {
      const rect = talkingClipCropRect(bitmap.width, bitmap.height, located.face);
      if (!rect) return null;
      const canvas = document.createElement('canvas');
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      return out ? new File([out], 'talking-still.png', { type: 'image/png' }) : null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
