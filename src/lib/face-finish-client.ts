'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';

export type FaceFinishClientResult =
  | { available: true; imageUrl: string; finisher: 'qwen-edit' | 'klein-distilled' | 'rapid' }
  | { available: false; reason: string };

/**
 * Browser: the main model the Face finish pass on this still would load (nothing is queued), or
 * null when unknown — for holding the pass while the app's stills on another model still wait.
 */
export async function planStillFaceFinishModel(imageUrl: string): Promise<string | null> {
  try {
    const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
    const response = await fetch('/api/face-finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ imageUrl, plan: true, ...(comfyUrl ? { comfyUrl } : {}) }),
    });
    if (!response.ok) return null;
    const data = (await response.json().catch(() => ({}))) as { modelKey?: unknown };
    return typeof data.modelKey === 'string' && data.modelKey ? data.modelKey : null;
  } catch {
    return null;
  }
}

/** Browser: run Face finish on a still via `/api/face-finish`; rejects on errors. */
export async function runStillFaceFinish(input: {
  imageUrl: string;
  faceUrl: string;
  /** People in the still (2 = finish only the lead's face). */
  people?: number;
}): Promise<FaceFinishClientResult> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const response = await fetch('/api/face-finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, ...(comfyUrl ? { comfyUrl } : {}) }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    available?: boolean;
    reason?: string;
    image?: { filename: string; subfolder?: string; type?: string };
    finisher?: 'qwen-edit' | 'klein-distilled' | 'rapid';
    error?: string;
  };
  if (!response.ok || typeof data.available !== 'boolean') {
    throw new Error(data.error ?? `Face finish failed (HTTP ${response.status}).`);
  }
  if (!data.available || !data.image?.filename) {
    return { available: false, reason: data.reason ?? 'Face finish unavailable.' };
  }
  const params = new URLSearchParams({
    filename: data.image.filename,
    subfolder: data.image.subfolder ?? '',
    type: data.image.type ?? 'output',
  });
  return {
    available: true,
    imageUrl: `/api/comfyui/view?${params.toString()}`,
    finisher: data.finisher ?? 'rapid',
  };
}
