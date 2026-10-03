'use client';

import type { CastcutBestOfTwoReport } from '@/lib/castcut-nodes';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';

/** Browser: a finished job's Castcut Best-of-two report via `/api/castcut-report` (null = none). */
export async function fetchCastcutBestOfTwoReport(
  promptId: string
): Promise<CastcutBestOfTwoReport | null> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const response = await fetch('/api/castcut-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ promptId, ...(comfyUrl ? { comfyUrl } : {}) }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    report?: CastcutBestOfTwoReport | null;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error ?? `Castcut report failed (HTTP ${response.status}).`);
  }
  return data.report ?? null;
}
