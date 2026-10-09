/**
 * Features learn from Gallery judgments (docs/architecture-boundaries.md): Play learns pose layouts
 * from kept intimate two-person stills. Registered at app start; the Gallery never imports them.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export type GalleryKeeperHook = (entries: readonly ComfyGalleryEntry[]) => void;

const keeperHooks: GalleryKeeperHook[] = [];

export function registerGalleryKeeperHook(hook: GalleryKeeperHook): void {
  if (!keeperHooks.includes(hook)) keeperHooks.push(hook);
}

/** A favorite or 4★+ in the Gallery. */
export function runGalleryKeeperHooks(entries: readonly ComfyGalleryEntry[]): void {
  for (const hook of keeperHooks) {
    try {
      hook(entries);
    } catch {
      // A feature's learning never blocks the Gallery.
    }
  }
}
