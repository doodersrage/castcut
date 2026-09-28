'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';

export type FaceFinishClientResult =
  { available: true; imageUrl: string } | { available: false; reason: string };

/** Browser: run Face finish on a still via `/api/face-finish`; rejects on errors. */
export async function runStillFaceFinish(input: {
  imageUrl: string;
  faceUrl: string;
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
  return { available: true, imageUrl: `/api/comfyui/view?${params.toString()}` };
}
