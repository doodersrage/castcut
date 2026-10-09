'use client';

/**
 * Find the face on a plate through the app's /api/face-locate route, cached per plate. Shared:
 * Fix area and the Cast face crop use it (cast-face-crop re-exports); docs/architecture-boundaries.md.
 */

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import type { FaceLocateResult } from '@/lib/face-locate';

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
