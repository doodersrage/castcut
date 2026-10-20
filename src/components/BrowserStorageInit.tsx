'use client';

import { useEffect } from 'react';
import { initBrowserStorage } from '@/lib/storage/browser-storage';

/** Eager IndexedDB hydrate — settings/history must not read stale localStorage mirrors. */
export default function BrowserStorageInit() {
  useEffect(() => {
    void initBrowserStorage();
  }, []);

  return null;
}
