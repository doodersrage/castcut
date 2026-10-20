import { hydrateGalleryStore, isGalleryStoreReady } from './gallery/db-store';
import { initBrowserStorage, isBrowserStorageReady } from './browser-storage';

export async function initAppDb(): Promise<void> {
  await Promise.all([initBrowserStorage(), hydrateGalleryStore()]);
}

/** Gallery-only hydration — avoids blocking on the full browser KV store. */
export async function initGalleryStore(): Promise<void> {
  return hydrateGalleryStore();
}

export function isAppDbReady(): boolean {
  return isBrowserStorageReady() && isGalleryStoreReady();
}

export { isGalleryStoreReady } from './gallery/db-store';
