'use client';

/**
 * What this browser still uses of the server's kept Gallery copies: its own Gallery's entry ids
 * and every `/api/gallery/media/<id>` link in what it stores (IndexedDB, local/session storage).
 * Some of it may not have reached the server yet, so the cleanup keeps these too.
 */

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MEDIA_LINK =
  /gallery[/-]media\/(?:[A-Za-z0-9._-]+\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

export async function collectBrowserGalleryMediaIds(): Promise<string[]> {
  const ids = new Set<string>();
  const scan = (value: unknown) => {
    if (value === null || value === undefined) return;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (!text) return;
    for (const match of text.matchAll(MEDIA_LINK)) ids.add(match[1]!);
  };

  try {
    const { flushBrowserStorageNow } = await import('../browser-storage');
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
  const { appDb } = await import('../app-db');
  if (appDb) {
    // Failures here must fail the scan: a missed Gallery would make every copy look unused.
    await appDb.kv.each(record => scan(record.value));
    await appDb.galleryEntries.each(entry => {
      if (typeof entry.id === 'string' && ID.test(entry.id)) ids.add(entry.id);
      scan(entry);
    });
  }
  const { loadComfyGallery } = await import('./comfyui-gallery');
  for (const entry of loadComfyGallery()) if (ID.test(entry.id)) ids.add(entry.id);
  return [...ids];
}

export type GalleryMediaCleanupScan = {
  removable: string[];
  removableBytes: number;
  keptInUse: number;
  keptRecent: number;
  keptBytes: number;
  minAgeDays: number;
  viewCacheBytes: number;
  canClearViewCache: boolean;
};

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/gallery/media/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

export async function scanGalleryMediaCleanup(): Promise<GalleryMediaCleanupScan> {
  return post({ action: 'scan', browserIds: await collectBrowserGalleryMediaIds() });
}

export async function removeGalleryMediaCleanup(
  ids: string[]
): Promise<{ removed: number; freedBytes: number }> {
  return post({ action: 'remove', ids, browserIds: await collectBrowserGalleryMediaIds() });
}

export async function clearThumbnailCache(): Promise<{ freedBytes: number }> {
  return post({ action: 'clear-view-cache' });
}
