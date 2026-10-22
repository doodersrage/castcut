'use client';

import { loadComfyUiSettings } from '@/lib/comfyui/settings';
import { comfyViewUrlForStill } from '@/lib/comfyui/still-comfy-url';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { pickedReframeShot } from './shot-reframe';

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

/** A landed take (Day slot, Story scene, Outfit try-on): its ComfyUI prompt and shown picture. */
export type ShotReframeTake = { imageUrl?: string | null; promptId?: string | null };

/** The take's queued prompt (its gallery entry) picked a shot a cut makes (shot-reframe.ts). */
export function takeWantsShotReframe(take: { promptId?: string | null }): boolean {
  const promptId = take.promptId?.trim();
  if (!promptId) return false;
  const entry = loadComfyGallery().find(item => item.promptId === promptId);
  return Boolean(entry && pickedReframeShot(entry.prompt));
}

/**
 * Cut a landed take to its picked shot: a durable gallery copy is mapped back to the ComfyUI
 * output first (the cut reads the still's own graph). Throws on a server error.
 */
export async function reframeTakeToShot(take: ShotReframeTake): Promise<ShotReframeClientResult> {
  const comfyStillUrl = comfyViewUrlForStill(take, loadComfyGallery());
  if (!comfyStillUrl) return { available: false, reason: 'the still is not in ComfyUI.' };
  return reframeStillToShot(comfyStillUrl);
}

/** What the status line says once a cut landed. */
export function shotReframeDoneWords(shot: 'waist' | 'head'): string {
  return shot === 'head' ? 'head and shoulders' : 'waist-up';
}
