'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import type { PoseDetectResult } from '@/lib/pose-score';

/** Browser: detect the pose in a finished still via `/api/pose-detect`. Rejects on errors. */
export async function detectStillPose(imageUrl: string): Promise<PoseDetectResult> {
  const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
  const response = await fetch('/api/pose-detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ imageUrl, ...(comfyUrl ? { comfyUrl } : {}) }),
  });
  const data = (await response.json().catch(() => ({}))) as Partial<PoseDetectResult> & {
    error?: string;
  };
  if (!response.ok || typeof data.available !== 'boolean') {
    throw new Error(data.error ?? `Pose detection failed (HTTP ${response.status}).`);
  }
  return data as PoseDetectResult;
}
