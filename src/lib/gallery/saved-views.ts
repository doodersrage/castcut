'use client';

import type {
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
} from './comfyui-gallery';
import type { GalleryDensity } from './density';
import { readBrowserValue, writeBrowserValue } from '../browser-storage';

export type GallerySavedView = {
  id: string;
  name: string;
  filter: ComfyGalleryFilter;
  sort?: ComfyGallerySort;
  projectFilterId?: string;
  layout?: GalleryLayoutMode;
  pageSize?: GalleryPageSize;
  density?: GalleryDensity;
  createdAt: number;
};

const KEY = 'comfy-gallery-saved-views-v1';

export function loadGallerySavedViews(): GallerySavedView[] {
  if (typeof window === 'undefined') {
    return [];
  }
  return readBrowserValue<GallerySavedView[]>(KEY) ?? [];
}

export function saveGallerySavedViews(views: GallerySavedView[]): void {
  writeBrowserValue(KEY, views.slice(0, 20));
}

export function upsertGallerySavedView(
  view: Omit<GallerySavedView, 'createdAt'> & { createdAt?: number }
): GallerySavedView {
  const next: GallerySavedView = {
    ...view,
    createdAt: view.createdAt ?? Date.now(),
  };
  saveGallerySavedViews([next, ...loadGallerySavedViews().filter(entry => entry.id !== view.id)]);
  return next;
}

export function deleteGallerySavedView(id: string): void {
  saveGallerySavedViews(loadGallerySavedViews().filter(entry => entry.id !== id));
}
