'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import type { DuoStillCheckResult } from '@/lib/duo-still-check';

/**
 * Browser: count faces, hands, bodies and limbs on a two-person intimate still via
 * `/api/duo-still-check` (duo-still-check.ts). Rejects on errors; `available: false` when
 * ComfyUI lacks a node or model.
 */
export async function countDuoStill(imageUrl: string): Promise<DuoStillCheckResult> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const response = await fetch('/api/duo-still-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ imageUrl, ...(comfyUrl ? { comfyUrl } : {}) }),
  });
  const data = (await response.json().catch(() => ({}))) as Partial<DuoStillCheckResult> & {
    error?: string;
  };
  if (!response.ok || typeof data.available !== 'boolean') {
    throw new Error(data.error ?? `Duo still check failed (HTTP ${response.status}).`);
  }
  return data as DuoStillCheckResult;
}
