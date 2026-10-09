'use client';

import { locateFaceOnPlateBlob } from '@/lib/face-locate-client';
import {
  cropFaceBoxFromBlob,
  cropPortraitFaceRegionFromBlob,
  type PortraitFaceCropOptions,
} from '@/lib/portrait-face-crop';

/**
 * The Cast face crop (Day / Story Image 1, the Face finish reference) cut around the face the
 * detector found, for any plate orientation. The top-of-plate window is kept only as a fallback:
 * on a plate where she lies down it held only hair, and Face finish then moved faces further
 * from her.
 *
 * `face`: `found` — cut around the face; `missing` — the detector ran and found no face (the
 * plate is flagged: NO_FACE_ON_PLATE_MESSAGE); `unknown` — no detector (ComfyUI down, no
 * FaceAnalysis pack), old crop, no flag.
 */
export type CastFaceCropOutcome = 'found' | 'missing' | 'unknown';

export async function cropCastFaceFromBlob(
  blob: Blob,
  filename: string,
  fallback: PortraitFaceCropOptions,
  options?: {
    comfyUrl?: string | null;
    /** Framing around a found face (computeFaceBoxCropRect); default 2.2× face, lift 0.12. */
    faceBox?: { scale?: number; liftRatio?: number };
  }
): Promise<{ file: File; face: CastFaceCropOutcome }> {
  const located = await locateFaceOnPlateBlob(blob, options);
  if (located?.available && located.face) {
    try {
      // Not turned upright: InsightFace also finds a face upside down, so the turn that found
      // it does not say which way is up. The crop keeps the plate's own orientation.
      const file = await cropFaceBoxFromBlob(blob, filename, located.face, {
        ...(fallback.minPixels !== undefined ? { minPixels: fallback.minPixels } : {}),
        ...(options?.faceBox ?? {}),
      });
      return { file, face: 'found' };
    } catch {
      // Fall through to the top-of-plate window.
    }
  }
  const file = await cropPortraitFaceRegionFromBlob(blob, filename, fallback);
  return { file, face: located?.available && !located.face ? 'missing' : 'unknown' };
}

export { clearCastFaceLocateCache, locateFaceOnPlateBlob } from '@/lib/face-locate-client';
