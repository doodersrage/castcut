'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';

export type AnatomyFinishClientResult =
  { available: true; imageUrl: string } | { available: false; reason: string };

/** Browser: run Anatomy finish on a still via `/api/anatomy-finish`; rejects on errors. */
export async function runStillAnatomyFinish(imageUrl: string): Promise<AnatomyFinishClientResult> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const response = await fetch('/api/anatomy-finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ imageUrl, ...(comfyUrl ? { comfyUrl } : {}) }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    available?: boolean;
    reason?: string;
    image?: { filename: string; subfolder?: string; type?: string };
    error?: string;
  };
  if (!response.ok || typeof data.available !== 'boolean') {
    throw new Error(data.error ?? `Anatomy finish failed (HTTP ${response.status}).`);
  }
  if (!data.available || !data.image?.filename) {
    return { available: false, reason: data.reason ?? 'Anatomy finish unavailable.' };
  }
  const params = new URLSearchParams({
    filename: data.image.filename,
    subfolder: data.image.subfolder ?? '',
    type: data.image.type ?? 'input',
  });
  return { available: true, imageUrl: `/api/comfyui/view?${params.toString()}` };
}
