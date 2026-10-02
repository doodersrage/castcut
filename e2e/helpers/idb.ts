import type { Page } from '@playwright/test';

/** Write app KV rows into Dexie so IDB-authoritative keys survive hydrate. */
export async function putAppKv(page: Page, entries: Record<string, unknown>): Promise<void> {
  await page.evaluate(async pairs => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('comfy-prompt-studio-v1');
      request.onerror = () => reject(request.error ?? new Error('idb open failed'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        for (const [key, value] of Object.entries(pairs)) {
          store.put({ key, value });
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('idb kv put failed'));
      };
    });
  }, entries);
}

/**
 * Seed settings after auth. Tool slices live in the tools sidecar — writing only
 * `comfy-prompt-tool-settings-v1.tools` loses to an empty IDB sidecar on hydrate.
 */
export async function seedSettingsCache(
  page: Page,
  cache: {
    shared?: Record<string, unknown>;
    tools?: Record<string, unknown>;
    characters?: unknown;
  }
): Promise<void> {
  const updatedAt = Date.now();
  const entries: Record<string, unknown> = {
    'comfy-prompt-tool-settings-v1': {
      shared: cache.shared ?? {},
      tools: {},
      updatedAt,
    },
    'comfy-prompt-tool-settings-tools-v1': {
      tools: cache.tools ?? {},
      updatedAt,
    },
  };
  if (cache.characters !== undefined) {
    entries['comfy-prompt-characters-v1'] = cache.characters;
  }
  await putAppKv(page, entries);
}

/**
 * Register an init script that writes settings KV before the app hydrates on
 * the next navigation — avoids pagehide flush from the current page overwriting
 * a mid-session putAppKv seed.
 */
export async function seedSettingsCacheOnNextLoad(
  page: Page,
  cache: {
    shared?: Record<string, unknown>;
    tools?: Record<string, unknown>;
    characters?: unknown;
  }
): Promise<void> {
  const updatedAt = Date.now();
  const entries: Record<string, unknown> = {
    'comfy-prompt-tool-settings-v1': {
      shared: cache.shared ?? {},
      tools: {},
      updatedAt,
    },
    'comfy-prompt-tool-settings-tools-v1': {
      tools: cache.tools ?? {},
      updatedAt,
    },
  };
  if (cache.characters !== undefined) {
    entries['comfy-prompt-characters-v1'] = cache.characters;
  }
  // The init-script write below is async and can lose the race with the app's own hydrate (a
  // localStorage-only seed lost outright). When an app page is already open, also write now
  // from a static same-origin file — no app code is running there, and leaving the app page
  // first means its pagehide settings flush can't land on top of the seed.
  if (/^https?:/.test(page.url())) {
    await page.goto('/manifest.json');
    await putAppKv(page, entries);
  }
  await page.addInitScript(async pairs => {
    // Each store also keeps a localStorage mirror, and an empty one left by an earlier page load
    // could win over the IndexedDB seed at boot (the Cast or a tool's settings came up empty in
    // about a third of parallel runs). Seed the mirrors too, synchronously, before app code runs.
    const all = pairs as Record<string, unknown>;
    const mirrors: Record<string, unknown> = {
      'comfy-prompt-characters-v1': all['comfy-prompt-characters-v1'],
      'comfy-prompt-tool-settings-tools-v1': all['comfy-prompt-tool-settings-tools-v1'],
      'comfy-prompt-tool-settings-v1': all['comfy-prompt-tool-settings-v1']
        ? {
            ...(all['comfy-prompt-tool-settings-v1'] as Record<string, unknown>),
            tools:
              (all['comfy-prompt-tool-settings-tools-v1'] as { tools?: unknown } | undefined)
                ?.tools ?? {},
          }
        : undefined,
    };
    for (const [key, value] of Object.entries(mirrors)) {
      if (value === undefined) continue;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage unavailable on this page */
      }
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('comfy-prompt-studio-v1');
      request.onerror = () => reject(request.error ?? new Error('idb open failed'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        for (const [key, value] of Object.entries(pairs)) {
          store.put({ key, value });
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('idb kv put failed'));
      };
    });
  }, entries);
}

/** Replace gallery Dexie rows + localStorage mirror. */
export async function replaceGalleryIdb(
  page: Page,
  entries: Record<string, unknown>[]
): Promise<void> {
  await page.evaluate(async items => {
    try {
      localStorage.setItem('comfyui-gallery-v1', JSON.stringify(items));
    } catch {
      // ignore
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('comfy-prompt-studio-v1');
      request.onerror = () => reject(request.error ?? new Error('idb open failed'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('galleryEntries')) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction('galleryEntries', 'readwrite');
        const store = tx.objectStore('galleryEntries');
        store.clear();
        for (const entry of items) {
          store.put(entry);
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('idb gallery put failed'));
      };
    });
    window.dispatchEvent(new Event('comfyui-gallery-updated'));
  }, entries);
}
