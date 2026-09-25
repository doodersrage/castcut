'use client';

import { useSyncExternalStore } from 'react';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery-storage-meta';
import { getGalleryCache } from '@/lib/gallery-db-store';

const NO_GALLERY: ComfyGalleryEntry[] = [];

function subscribe(onChange: () => void): () => void {
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
  return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
}

/** The gallery entry for one ComfyUI prompt — carries queue position and sampler progress. */
export function useGalleryJobEntry(promptId: string | null | undefined): ComfyGalleryEntry | null {
  const gallery = useSyncExternalStore(subscribe, getGalleryCache, () => NO_GALLERY);
  const id = promptId?.trim();
  if (!id) {
    return null;
  }
  return gallery.find(entry => entry.promptId === id) ?? null;
}
