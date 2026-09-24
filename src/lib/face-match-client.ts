'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import type { FaceMatchResult } from '@/lib/face-match';

/**
 * Browser: face similarity of a still to its reference via `/api/face-match`.
 * Resolves `null` when ComfyUI could not find a face (nothing to judge); rejects on errors.
 */
export async function measureStillFaceMatch(input: {
  referenceUrl: string;
  imageUrl: string;
}): Promise<FaceMatchResult | null> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const response = await fetch('/api/face-match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, ...(comfyUrl ? { comfyUrl } : {}) }),
  });
  if (response.status === 422) {
    return null;
  }
  const data = (await response.json().catch(() => ({}))) as Partial<FaceMatchResult> & {
    error?: string;
  };
  if (!response.ok || typeof data.available !== 'boolean') {
    throw new Error(data.error ?? `Face match failed (HTTP ${response.status}).`);
  }
  return data as FaceMatchResult;
}

/** ComfyUI view URL for an input-folder upload (plates are uploaded there at queue time). */
export function comfyInputViewUrl(filename: string | null | undefined): string | null {
  const name = filename?.trim();
  if (!name) return null;
  const slash = name.lastIndexOf('/');
  const params = new URLSearchParams({
    filename: slash >= 0 ? name.slice(slash + 1) : name,
    subfolder: slash >= 0 ? name.slice(0, slash) : '',
    type: 'input',
  });
  return `/api/comfyui/view?${params.toString()}`;
}
