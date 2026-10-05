'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import type { FaceLocateResult } from '@/lib/face-locate';
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

/** One detection per plate (by its bytes) for the page's life. */
const locateCache = new Map<string, Promise<FaceLocateResult | null>>();

export function clearCastFaceLocateCache(): void {
  locateCache.clear();
}

async function blobKey(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  // No subtle crypto (plain http on a LAN address): size + a sample of the bytes.
  const view = new Uint8Array(bytes);
  let hash = 0x811c9dc5;
  const step = Math.max(1, Math.floor(view.length / 4096));
  for (let index = 0; index < view.length; index += step) {
    hash ^= view[index]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${view.length}-${(hash >>> 0).toString(36)}`;
}

async function blobSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** Find the face on a plate (cached per plate). Null when the check could not run. */
export async function locateFaceOnPlateBlob(
  blob: Blob,
  options?: { comfyUrl?: string | null }
): Promise<FaceLocateResult | null> {
  const key = await blobKey(blob);
  const cached = locateCache.get(key);
  if (cached) return cached;
  const pending = (async (): Promise<FaceLocateResult | null> => {
    const size = await blobSize(blob);
    if (!size) return null;
    const form = new FormData();
    form.append('image', blob, 'plate.png');
    form.append('width', String(size.width));
    form.append('height', String(size.height));
    const comfyUrl = options?.comfyUrl?.trim() || loadComfyUiSettings().apiUrl?.trim();
    if (comfyUrl) form.append('comfyUrl', comfyUrl);
    const response = await fetch('/api/face-locate', {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as FaceLocateResult | null;
    return data && typeof data.available === 'boolean' ? data : null;
  })().catch(() => null);
  locateCache.set(key, pending);
  const result = await pending;
  // A failed check (ComfyUI busy or down) is tried again next time; an answer is kept.
  if (!result) locateCache.delete(key);
  return result;
}

export async function cropCastFaceFromBlob(
  blob: Blob,
  filename: string,
  fallback: PortraitFaceCropOptions,
  options?: { comfyUrl?: string | null }
): Promise<{ file: File; face: CastFaceCropOutcome }> {
  const located = await locateFaceOnPlateBlob(blob, options);
  if (located?.available && located.face) {
    try {
      // Not turned upright: InsightFace also finds a face upside down, so the turn that found
      // it does not say which way is up. The crop keeps the plate's own orientation.
      const file = await cropFaceBoxFromBlob(blob, filename, located.face, {
        ...(fallback.minPixels !== undefined ? { minPixels: fallback.minPixels } : {}),
      });
      return { file, face: 'found' };
    } catch {
      // Fall through to the top-of-plate window.
    }
  }
  const file = await cropPortraitFaceRegionFromBlob(blob, filename, fallback);
  return { file, face: located?.available && !located.face ? 'missing' : 'unknown' };
}
