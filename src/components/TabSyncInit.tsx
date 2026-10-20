'use client';

import { useEffect } from 'react';
import { subscribeTabSync } from '@/lib/storage/tab-sync';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/gallery/comfyui-gallery-storage-meta';
import {
  SETTINGS_CACHE_KEY,
  SETTINGS_TOOLS_SIDECAR_KEY,
  SETTINGS_PLUGINS_SIDECAR_KEY,
  SETTINGS_MAPS_SIDECAR_KEY,
  SYSTEM_WORKFLOWS_PREF_KEY,
  SESSION_LORA_PREFS_KEY,
  invalidateSettingsCache,
  notifySettingsCacheUpdated,
} from '@/lib/settings/cache';
import {
  AVOIDED_TOKENS_KEY,
  AVOIDED_TOKENS_SNAPSHOT_KEY,
  AVOIDED_TOKENS_UPDATED_EVENT,
  invalidateAvoidedTokensCache,
} from '@/lib/prompt/avoided-tokens';

export default function TabSyncInit() {
  useEffect(() => {
    return subscribeTabSync(message => {
      if (message.type === 'gallery-updated') {
        // Other tabs mutate IndexedDB; reload before refreshing UI so deletes stick.
        void import('@/lib/gallery/db-store').then(({ reloadGalleryFromDb }) =>
          reloadGalleryFromDb().finally(() => {
            window.dispatchEvent(new Event(COMFYUI_GALLERY_UPDATED_EVENT));
          })
        );
      }
      if (message.type === 'history-updated') {
        window.dispatchEvent(new Event('prompt-history-updated'));
      }
      if (message.type === 'settings-updated') {
        void import('@/lib/storage/browser-storage').then(async ({ reloadBrowserStorageKeys }) => {
          await reloadBrowserStorageKeys([
            SETTINGS_CACHE_KEY,
            SETTINGS_TOOLS_SIDECAR_KEY,
            SETTINGS_PLUGINS_SIDECAR_KEY,
            SETTINGS_MAPS_SIDECAR_KEY,
            SYSTEM_WORKFLOWS_PREF_KEY,
            SESSION_LORA_PREFS_KEY,
          ]);
          invalidateSettingsCache();
          notifySettingsCacheUpdated();
        });
      }
      if (message.type === 'avoided-tokens-updated') {
        void import('@/lib/storage/browser-storage').then(async ({ reloadBrowserStorageKeys }) => {
          await reloadBrowserStorageKeys([AVOIDED_TOKENS_KEY, AVOIDED_TOKENS_SNAPSHOT_KEY]);
          invalidateAvoidedTokensCache();
          window.dispatchEvent(new CustomEvent(AVOIDED_TOKENS_UPDATED_EVENT));
        });
      }
    });
  }, []);

  return null;
}
