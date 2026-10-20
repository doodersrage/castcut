'use client';

import { useEffect, useState } from 'react';
import {
  BROWSER_STORAGE_HEALTH_EVENT,
  getBrowserStorageHealth,
  whenBrowserStorageReady,
  type BrowserStorageHealth,
} from '@/lib/storage/browser-storage';

export function useBrowserStorageHealth(): BrowserStorageHealth {
  const [health, setHealth] = useState<BrowserStorageHealth>(() => getBrowserStorageHealth());

  useEffect(() => {
    const refresh = () => setHealth(getBrowserStorageHealth());
    void whenBrowserStorageReady().then(refresh);
    window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, refresh);
    return () => window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, refresh);
  }, []);

  return health;
}
