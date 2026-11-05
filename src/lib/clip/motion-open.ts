'use client';

import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';

/** Opens the Motion brush (Play's MotionBrushHost) on a still: shared menus send this event. */
export const MOTION_BRUSH_OPEN_EVENT = 'castcut-motion-brush-open';

export type MotionBrushTarget = { stillUrl: string; entry: ComfyGalleryEntry };

export function openMotionBrush(target: MotionBrushTarget): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<MotionBrushTarget>(MOTION_BRUSH_OPEN_EVENT, { detail: target })
  );
}
