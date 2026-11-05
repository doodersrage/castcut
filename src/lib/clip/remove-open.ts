'use client';

import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';

/**
 * Opens "Remove from clip" (Play's ClipRemoveHost) on a clip: shared menus name no feature, they
 * send this event and whoever hosts the dialog shows it.
 */
export const CLIP_REMOVE_OPEN_EVENT = 'castcut-clip-remove-open';

export type ClipRemoveTarget = { clipUrl: string; entry: ComfyGalleryEntry };

export function openClipRemove(target: ClipRemoveTarget): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ClipRemoveTarget>(CLIP_REMOVE_OPEN_EVENT, { detail: target })
  );
}
