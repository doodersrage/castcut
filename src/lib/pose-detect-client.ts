'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { comfyInputViewUrl } from '@/lib/face-match-client';
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

const sharedDetections = new Map<string, Promise<PoseDetectResult>>();

/**
 * One DWPose run per image for this page session: the Cast plate check and the plate stance read
 * the same plate, and each run queues on ComfyUI behind whatever it is rendering. A failed run
 * is forgotten so the next caller tries again.
 */
export function detectStillPoseShared(imageUrl: string): Promise<PoseDetectResult> {
  const cached = sharedDetections.get(imageUrl);
  if (cached) {
    return cached;
  }
  const pending = detectStillPose(imageUrl).catch(error => {
    sharedDetections.delete(imageUrl);
    throw error;
  });
  sharedDetections.set(imageUrl, pending);
  return pending;
}

/** ComfyUI view URL DWPose can read for a plate (its own view URL, else its input upload). */
export function plateDetectUrl(
  plate: { imageUrl?: string; filename?: string } | null | undefined
): string | null {
  const imageUrl = plate?.imageUrl?.trim() || '';
  if (imageUrl.includes('/api/comfyui/view?')) {
    return imageUrl;
  }
  return comfyInputViewUrl(plate?.filename);
}
