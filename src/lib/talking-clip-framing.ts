/**
 * Talking clips start from a closer framing of the still. LTX-2.5 speaks the line either way,
 * but from a full-body still the face is ~20 px tall and the lips can't be read — the user's
 * "not syncing" night clip (2026-10-10). Live, same still / line / seeds: a chest-up crop around
 * the face kept her face and outfit and the mouth formed the words (mouth-motion vs loudness 0.68
 * / 0.73 vs 0.64 / 0.54 full-frame). A still where the face is already large is left alone.
 */

import type { FaceBox } from './portrait-face-crop';

/** Face (brow to chin) at least this share of the still's height: already close enough. */
export const TALKING_CLOSE_FACE_SHARE = 0.16;
/**
 * Face under this share of the still's height: a full-body shot. Kept whole (Keep the full
 * frame), it gets the wide-shot talking prompt (talkingClipPrompt `wide`).
 */
export const TALKING_WIDE_FACE_SHARE = 0.08;
/** Crop height in face heights: head, shoulders and chest. */
export const TALKING_CROP_FACE_HEIGHTS = 4.2;

export type CropRect = { x: number; y: number; width: number; height: number };

/** The chest-up 3:4 crop for a talking clip, or null when the still is already close. */
export function talkingClipCropRect(width: number, height: number, face: FaceBox): CropRect | null {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const faceH = Math.max(1, face.height);
  if (faceH / h >= TALKING_CLOSE_FACE_SHARE) return null;
  let cropH = Math.min(h, Math.round(faceH * TALKING_CROP_FACE_HEIGHTS));
  let cropW = Math.round(cropH * 0.75);
  if (cropW > w) {
    cropW = w;
    cropH = Math.min(h, Math.round(cropW / 0.75));
  }
  // The face sits in the upper third, hair inside the frame.
  const centerX = face.x + face.width / 2;
  const x = Math.round(Math.min(Math.max(0, centerX - cropW / 2), w - cropW));
  const y = Math.round(Math.min(Math.max(0, face.y - faceH * 0.9), h - cropH));
  return { x, y, width: cropW, height: cropH };
}
