import { readBrowserString, writeBrowserString } from '../storage/browser-storage';

export type GalleryDensity = 'comfortable' | 'compact';

export const GALLERY_DENSITY_KEY = 'comfy-gallery-density-v1';

export function normalizeGalleryDensity(value: unknown): GalleryDensity {
  return value === 'compact' ? 'compact' : 'comfortable';
}

export function loadGalleryDensity(): GalleryDensity {
  if (typeof window === 'undefined') {
    return 'comfortable';
  }
  return normalizeGalleryDensity(readBrowserString(GALLERY_DENSITY_KEY));
}

export function saveGalleryDensity(density: GalleryDensity): void {
  writeBrowserString(GALLERY_DENSITY_KEY, density);
}
