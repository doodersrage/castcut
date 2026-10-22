'use client';

import { loadComfyUiSettings } from '@/lib/comfyui/settings';

export type ShotReframeClientResult =
  | { available: true; imageUrl: string; shot: 'waist' | 'head' }
  | { available: false; reason: string };

/** Cut a finished still to its picked close shot (/api/shot-reframe). Throws on a server error. */
export async function reframeStillToShot(imageUrl: string): Promise<ShotReframeClientResult> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const response = await fetch('/api/shot-reframe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ imageUrl, ...(comfyUrl ? { comfyUrl } : {}) }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    available?: boolean;
    reason?: string;
    image?: { filename: string; subfolder?: string; type?: string };
    shot?: 'waist' | 'head';
    error?: string;
  };
  if (!response.ok || typeof data.available !== 'boolean') {
    throw new Error(data.error ?? `Shot reframe failed (HTTP ${response.status}).`);
  }
  if (!data.available || !data.image?.filename) {
    return { available: false, reason: data.reason ?? 'Shot reframe unavailable.' };
  }
  const params = new URLSearchParams({
    filename: data.image.filename,
    subfolder: data.image.subfolder ?? '',
    type: data.image.type ?? 'output',
  });
  return {
    available: true,
    imageUrl: `/api/comfyui/view?${params.toString()}`,
    shot: data.shot ?? 'waist',
  };
}
