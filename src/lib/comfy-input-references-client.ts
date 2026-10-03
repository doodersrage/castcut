'use client';

import { collectInputNameTokens, isAppMadeInputName } from './comfy-input-cleanup';

/**
 * Every app-made ComfyUI input name this browser still mentions: its gallery, settings, Cast,
 * Day / Story state and anything else it keeps (IndexedDB and local/session storage). The input
 * folder report treats these as in use — some of it may never have reached the server.
 */
export async function collectBrowserInputReferences(): Promise<string[]> {
  const names = new Set<string>();
  const scan = (value: unknown) => {
    if (value === null || value === undefined) return;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text) collectInputNameTokens(text, names, isAppMadeInputName);
  };

  try {
    const { flushBrowserStorageNow } = await import('./browser-storage');
    await flushBrowserStorageNow();
  } catch {
    /* scan what is stored */
  }

  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key) scan(store.getItem(key));
      }
    } catch {
      /* storage blocked */
    }
  }

  const { appDb } = await import('./app-db');
  if (appDb) {
    // Failures here must fail the scan: a missed gallery would make every still look unused.
    await appDb.kv.each(record => scan(record.value));
    await appDb.galleryEntries.each(entry => scan(entry));
  }
  return [...names];
}
