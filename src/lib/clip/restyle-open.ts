'use client';

import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';
import type { ClipStyleId } from './vace';

/** What Restyle was asked for: a preset look, or your own words for one. */
export type ClipRestyleChoice = { style: ClipStyleId } | { look: string };

/**
 * Opens Restyle's look picker (Play's ClipRestyleHost) on a clip. `run`: what to do with the
 * choice (Day and Story put the result on their card); without it the Gallery keeps the new clip
 * as the entry's child.
 */
export const CLIP_RESTYLE_OPEN_EVENT = 'castcut-clip-restyle-open';

export type ClipRestyleTarget = {
  clipUrl: string;
  entry?: ComfyGalleryEntry;
  run?: (choice: ClipRestyleChoice) => void;
};

export function openClipRestyle(target: ClipRestyleTarget): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ClipRestyleTarget>(CLIP_RESTYLE_OPEN_EVENT, { detail: target })
  );
}
