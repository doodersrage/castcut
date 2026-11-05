'use client';

import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';

/** Opens Change the background (Play's ClipBackgroundHost) on a Gallery clip. */
export const CLIP_BACKGROUND_OPEN_EVENT = 'castcut-clip-background-open';

export type ClipBackgroundTarget = { clipUrl: string; entry: ComfyGalleryEntry };

export function openClipBackground(target: ClipBackgroundTarget): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ClipBackgroundTarget>(CLIP_BACKGROUND_OPEN_EVENT, { detail: target })
  );
}
