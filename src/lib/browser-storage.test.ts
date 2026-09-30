import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';

// NOTE: `./app-db` exports `appDb`, a Dexie-style wrapper with a `.kv` table
// (get/put/delete/toArray) plus `.kv.clear()`. We mock it with a tiny
// in-memory implementation so we can control "Dexie available" vs.
// "no Dexie" (SSR / unit-test) states across tests.
type KvRecord = { key: string; value: unknown };

function makeFakeAppDb() {
  const store = new Map<string, unknown>();
  return {
    store,
    kv: {
      async get(key: string): Promise<KvRecord | undefined> {
        return store.has(key) ? { key, value: store.get(key) } : undefined;
      },
      async put(record: KvRecord): Promise<void> {
        store.set(record.key, record.value);
      },
      async delete(key: string): Promise<void> {
        store.delete(key);
      },
      async toArray(): Promise<KvRecord[]> {
        return [...store.entries()].map(([key, value]) => ({ key, value }));
      },
      async clear(): Promise<void> {
        store.clear();
      },
    },
  };
}

let currentAppDb: ReturnType<typeof makeFakeAppDb> | null = null;

mock.module('./app-db', {
  namedExports: {
    get appDb() {
      return currentAppDb;
    },
  },
});

mock.module('./comfyui-gallery-storage-meta', {
  namedExports: {
    COMFYUI_GALLERY_KEY: 'comfyui-gallery-v1',
  },
});

const mergeSessionLoraIdsByModelMock = mock.fn(
  (
    a: Partial<Record<string, string[]>> | undefined,
    b: Partial<Record<string, string[]>> | undefined
  ) => ({ ...(a ?? {}), ...(b ?? {}) })
);

mock.module('./model-lora-map', {
  namedExports: {
    mergeSessionLoraIdsByModel: mergeSessionLoraIdsByModelMock,
  },
});

mock.module('./durable-sync-keys', {
  namedExports: {
    DURABLE_BROWSER_SYNC_KEYS: new Set(['comfy-prompt-tool-settings-v1']),
  },
});

// Fake localStorage: minimal Storage-like implementation backed by a Map.
function makeFakeLocalStorage() {
  const data = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, value);
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    clear(): void {
      data.clear();
    },
    key(index: number): string | null {
      return [...data.keys()][index] ?? null;
    },
    get length(): number {
      return data.size;
    },
    _data: data,
  };
}

type TimerCall = { id: number; delay: number; fired: boolean; cb: () => void };
let timerCalls: TimerCall[] = [];
let nextTimerId = 1;

function installFakeWindow() {
  const localStorage = makeFakeLocalStorage();
  const listeners: Record<string, Array<() => void>> = {};
  const fakeWindow: Record<string, unknown> = {
    localStorage,
    dispatchEvent(_event: Event) {
      return true;
    },
    addEventListener(type: string, cb: () => void) {
      listeners[type] = listeners[type] ?? [];
      listeners[type].push(cb);
    },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      addEventListener() {
        /* not exercised directly in these tests */
      },
      visibilityState: 'visible',
    },
  });
  return { localStorage, listeners };
}

function uninstallFakeWindow() {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
}

// Fake setTimeout/clearTimeout: records scheduling without waiting on real
// timers. Tests that need the debounced persist to actually run call
// flushTimers() to synchronously invoke pending callbacks.
let originalSetTimeout: typeof setTimeout;
let originalClearTimeout: typeof clearTimeout;

function installFakeTimers() {
  originalSetTimeout = globalThis.setTimeout;
  originalClearTimeout = globalThis.clearTimeout;
  timerCalls = [];
  nextTimerId = 1;
  (globalThis as unknown as { setTimeout: unknown }).setTimeout = ((
    cb: () => void,
    delay: number
  ) => {
    const id = nextTimerId++;
    timerCalls.push({ id, delay, fired: false, cb });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  (globalThis as unknown as { clearTimeout: unknown }).clearTimeout = ((id: number) => {
    const entry = timerCalls.find(t => t.id === id);
    if (entry) {
      entry.fired = true; // treat cleared as "consumed" so flushTimers skips it
    }
  }) as typeof clearTimeout;
}

function uninstallFakeTimers() {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}

async function flushTimers(): Promise<void> {
  // Fire all pending, not-yet-fired timers (in scheduling order), allowing
  // async callbacks (which themselves call `initBrowserStorage().then(...)`)
  // to settle between rounds.
  let progressed = true;
  while (progressed) {
    progressed = false;
    const pending = timerCalls.filter(t => !t.fired);
    for (const entry of pending) {
      entry.fired = true;
      entry.cb();
      progressed = true;
    }
    // Let any queued microtasks/promises from the callbacks resolve.
    await new Promise(resolve => setImmediate(resolve));
  }
}

describe('browser-storage', () => {
  before(() => {
    // node:test module mocks must be registered before the first import of
    // the module under test; importing lazily inside `before` ensures the
    // mock.module() calls above have already run.
  });

  afterEach(() => {
    uninstallFakeWindow();
    uninstallFakeTimers();
    currentAppDb = null;
    mergeSessionLoraIdsByModelMock.mock.resetCalls();
  });

  it('isBrowserStorageReady / getBrowserStorageHealth report SSR-safe defaults with no window', async () => {
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    // No appDb configured (currentAppDb is null) and no window: ready flips
    // true immediately per resetBrowserStorageCache's `!appDb` shortcut.
    assert.equal(mod.isBrowserStorageReady(), true);
    const health = mod.getBrowserStorageHealth();
    assert.equal(health.ready, true);
    assert.equal(health.lastSavedAt, null);
    assert.equal(health.dirtyCount, 0);
  });

  it('readBrowserValue/readBrowserString return null when there is no window (SSR)', async () => {
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    assert.equal(mod.readBrowserValue('anything'), null);
    assert.equal(mod.readBrowserString('anything'), null);
  });

  it('writeBrowserValue/removeBrowserKey/flushBrowserStorage are no-ops when there is no window', async () => {
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    // Should not throw despite no window being present.
    mod.writeBrowserValue('some-key', { a: 1 });
    mod.removeBrowserKey('some-key');
    mod.flushBrowserStorage();
    await mod.flushBrowserStorageNow();
    assert.equal(mod.readBrowserValue('some-key'), null);
  });

  it('writeBrowserValue stores into the cache and mirrors to localStorage for a plain key', async () => {
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();

    mod.writeBrowserValue('plain-key', { hello: 'world' });
    assert.deepEqual(mod.readBrowserValue('plain-key'), { hello: 'world' });

    // Mirrored to localStorage synchronously (mirrorToLocalStorageIfAllowed
    // runs inside writeBrowserValue itself, not only on persist).
    const raw = (globalThis.window as unknown as { localStorage: Storage }).localStorage.getItem(
      'plain-key'
    );
    assert.equal(raw, JSON.stringify({ hello: 'world' }));
  });

  it('writeBrowserString stores a string value retrievable via readBrowserString', async () => {
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();

    mod.writeBrowserString('str-key', 'hello');
    assert.equal(mod.readBrowserString('str-key'), 'hello');
  });

  it('readBrowserString stringifies non-string cached values', async () => {
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();

    mod.writeBrowserValue('num-key', 42);
    assert.equal(mod.readBrowserString('num-key'), '42');
  });

  it('readBrowserValue falls back to a legacy localStorage entry when not cached, and caches it', async () => {
    const { localStorage } = installFakeWindow();
    installFakeTimers();
    localStorage.setItem('legacy-key', JSON.stringify({ legacy: true }));
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();

    assert.deepEqual(mod.readBrowserValue('legacy-key'), { legacy: true });
  });

  it('readBrowserValue returns null for an IDB-only key when appDb is configured and not in the CRITICAL mirror set', async () => {
    currentAppDb = makeFakeAppDb();
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();

    // 'comfy-prompt-tool-settings-v1' is in IDB_ONLY_KEYS and not in the
    // critical localStorage mirror set.
    assert.equal(mod.IDB_ONLY_KEYS.has('comfy-prompt-tool-settings-v1'), true);
    assert.equal(mod.readBrowserValue('comfy-prompt-tool-settings-v1'), null);
  });

  it('removeBrowserKey deletes the cached value and the legacy localStorage mirror for a non-IDB-only key', async () => {
    const { localStorage } = installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();

    mod.writeBrowserValue('to-remove', 'value');
    // NOTE: writeLegacyLocalStorageValue stores string values AS-IS (no
    // JSON.stringify wrapping) -- only non-string values get JSON.stringify'd.
    assert.equal(localStorage.getItem('to-remove'), 'value');

    mod.removeBrowserKey('to-remove');
    assert.equal(mod.readBrowserValue('to-remove'), null);
    assert.equal(localStorage.getItem('to-remove'), null);
  });

  it('withLocalWritesPreserved keeps keys this tab edited since the pull started', async () => {
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();

    mod.writeBrowserValue('old-key', 'old local');
    const pullStartedAt = Date.now() + 1;
    // Pulled values land under a suppressed push; the edit arrives mid-pull.
    mod.withSuppressedDurableSyncPush(() => mod.writeBrowserValue('pulled-key', 'server'));
    const originalNow = Date.now;
    Date.now = () => pullStartedAt + 10;
    try {
      mod.writeBrowserValue('edited-key', 'local edit');
    } finally {
      Date.now = originalNow;
    }

    const kept = mod.withLocalWritesPreserved(pullStartedAt, () =>
      mod.withSuppressedDurableSyncPush(() => {
        mod.writeBrowserValue('edited-key', 'server');
        mod.writeBrowserValue('old-key', 'server');
        mod.writeBrowserValue('pulled-key', 'server 2');
      })
    );

    assert.equal(kept, 1);
    assert.equal(mod.readBrowserValue('edited-key'), 'local edit');
    assert.equal(mod.readBrowserValue('old-key'), 'server');
    assert.equal(mod.readBrowserValue('pulled-key'), 'server 2');
    // Outside the guard, writes apply as usual.
    mod.writeBrowserValue('edited-key', 'later');
    assert.equal(mod.readBrowserValue('edited-key'), 'later');
  });

  it('withSuppressedDurableSyncPush runs the callback and returns its value', async () => {
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    const result = mod.withSuppressedDurableSyncPush(() => 5 + 5);
    assert.equal(result, 10);
  });

  it('withSuppressedDurableSyncPush restores the suppression count even if the callback throws', async () => {
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    assert.throws(() => {
      mod.withSuppressedDurableSyncPush(() => {
        throw new Error('boom');
      });
    }, /boom/);
    // No direct way to observe suppressDurableSyncPush from outside; this
    // test just confirms the finally-block path doesn't itself throw and
    // that subsequent calls still work normally (i.e. the counter wasn't
    // left in a broken state).
    const result = mod.withSuppressedDurableSyncPush(() => 'ok');
    assert.equal(result, 'ok');
  });

  it('flushBrowserStorage with no window is a no-op and does not throw', async () => {
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    mod.flushBrowserStorage();
  });

  it('flushBrowserStorageNow persists dirty keys through appDb.kv.put when appDb is configured', async () => {
    currentAppDb = makeFakeAppDb();
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.initBrowserStorage();

    mod.writeBrowserValue('persist-key', { n: 1 });
    await mod.flushBrowserStorageNow();

    const record = await currentAppDb.kv.get('persist-key');
    assert.deepEqual(record?.value, { n: 1 });

    const health = mod.getBrowserStorageHealth();
    assert.equal(typeof health.lastSavedAt, 'number');
    assert.equal(health.dirtyCount, 0);
  });

  it('flushBrowserStorageNow persists to localStorage only when appDb is unavailable', async () => {
    const { localStorage } = installFakeWindow();
    installFakeTimers();
    currentAppDb = null;
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.initBrowserStorage();

    mod.writeBrowserValue('no-idb-key', 'plain-value');
    await mod.flushBrowserStorageNow();

    // NOTE: string values are written to localStorage as-is, not JSON-encoded.
    assert.equal(localStorage.getItem('no-idb-key'), 'plain-value');
  });

  it('removeBrowserKey followed by flushBrowserStorageNow deletes the record from appDb', async () => {
    currentAppDb = makeFakeAppDb();
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.initBrowserStorage();

    mod.writeBrowserValue('doomed-key', 'x');
    await mod.flushBrowserStorageNow();
    assert.ok(await currentAppDb.kv.get('doomed-key'));

    mod.removeBrowserKey('doomed-key');
    await mod.flushBrowserStorageNow();
    assert.equal(await currentAppDb.kv.get('doomed-key'), undefined);
  });

  it('schedulePersistDirtyKeys via writeBrowserValue schedules a debounced timer that flushes on fire', async () => {
    currentAppDb = makeFakeAppDb();
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.initBrowserStorage();

    mod.writeBrowserValue('debounced-key', 'debounced-value');
    // Not yet persisted to appDb -- only scheduled.
    assert.equal(await currentAppDb.kv.get('debounced-key'), undefined);
    assert.ok(timerCalls.some(t => t.delay === 350 && !t.fired));

    await flushTimers();
    const record = await currentAppDb.kv.get('debounced-key');
    assert.equal(record?.value, 'debounced-value');
  });

  it('initBrowserStorage hydrates HOT_KV_KEYS and remaining records from appDb.kv', async () => {
    currentAppDb = makeFakeAppDb();
    currentAppDb.store.set('comfyui-settings-v4', { theme: 'dark' });
    currentAppDb.store.set('some-other-key', 'other-value');
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();

    await mod.initBrowserStorage();

    assert.deepEqual(mod.readBrowserValue('comfyui-settings-v4'), { theme: 'dark' });
    assert.equal(mod.readBrowserValue('some-other-key'), 'other-value');
    assert.equal(mod.isBrowserStorageReady(), true);
  });

  it('initBrowserStorage is idempotent: a second call while ready resolves immediately without re-reading appDb', async () => {
    currentAppDb = makeFakeAppDb();
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();

    await mod.initBrowserStorage();
    assert.equal(mod.isBrowserStorageReady(), true);

    // Mutate the backing store directly (bypassing the module) -- if a
    // second initBrowserStorage() call re-hydrated, this would appear;
    // since ready===true it should short-circuit and not pick it up.
    currentAppDb.store.set('added-after-ready', 'sneaky');
    await mod.initBrowserStorage();
    assert.equal(mod.readBrowserValue('added-after-ready'), null);
  });

  it('whenBrowserStorageReady resolves immediately with no window', async () => {
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.whenBrowserStorageReady();
    // No throw = success; nothing else externally observable here.
  });

  it('whenBrowserStorageReady triggers initBrowserStorage when not yet ready', async () => {
    currentAppDb = makeFakeAppDb();
    currentAppDb.store.set('comfy-onboarding-v2', 'seen');
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    // With appDb configured, resetBrowserStorageCache leaves ready=false.
    assert.equal(mod.isBrowserStorageReady(), false);

    await mod.whenBrowserStorageReady();
    assert.equal(mod.isBrowserStorageReady(), true);
    assert.equal(mod.readBrowserValue('comfy-onboarding-v2'), 'seen');
  });

  it('clearBrowserKvStore clears the in-memory cache and calls appDb.kv.clear when available', async () => {
    currentAppDb = makeFakeAppDb();
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.initBrowserStorage();

    mod.writeBrowserValue('clear-me', 'x');
    await mod.flushBrowserStorageNow();
    assert.ok(await currentAppDb.kv.get('clear-me'));

    await mod.clearBrowserKvStore();
    // The appDb backing store and in-memory cache are cleared...
    assert.equal(await currentAppDb.kv.get('clear-me'), undefined);
    // NOTE: clearBrowserKvStore does NOT remove the legacy localStorage
    // mirror it left behind during the earlier flush. Since 'clear-me' is a
    // plain (non-IDB-only) key, readBrowserValue's fallback-to-localStorage
    // path recovers and re-caches it -- this is real, if surprising,
    // behavior of the source, not a test bug.
    assert.equal(mod.readBrowserValue('clear-me'), 'x');
  });

  it('clearBrowserKvStore with no window still clears the in-memory cache without throwing', async () => {
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.clearBrowserKvStore();
  });

  it('reloadBrowserStorageKeys with no window or empty key list is a no-op', async () => {
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.reloadBrowserStorageKeys([]);
    installFakeWindow();
    await mod.reloadBrowserStorageKeys([]);
  });

  it('reloadBrowserStorageKeys skips keys that are currently dirty (unflushed local writes win)', async () => {
    currentAppDb = makeFakeAppDb();
    currentAppDb.store.set('shared-key', 'remote-value');
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.initBrowserStorage();

    mod.writeBrowserValue('shared-key', 'local-dirty-value');
    await mod.reloadBrowserStorageKeys(['shared-key']);

    // Still the locally-written dirty value -- the reload should have
    // skipped it because it's dirty.
    assert.equal(mod.readBrowserValue('shared-key'), 'local-dirty-value');
  });

  it('reloadBrowserStorageKeys reloads a clean (non-dirty) key from appDb, dropping the cached copy first', async () => {
    currentAppDb = makeFakeAppDb();
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.initBrowserStorage();

    mod.writeBrowserValue('reload-key', 'first-value');
    await mod.flushBrowserStorageNow();
    assert.equal(mod.readBrowserValue('reload-key'), 'first-value');

    // Simulate another tab updating the record directly in appDb.
    await currentAppDb.kv.put({ key: 'reload-key', value: 'second-value-from-other-tab' });

    await mod.reloadBrowserStorageKeys(['reload-key']);
    assert.equal(mod.readBrowserValue('reload-key'), 'second-value-from-other-tab');
  });

  it('getBrowserStorageHealth reflects a write error recorded during persist (lastError set, health event dispatched)', async () => {
    currentAppDb = {
      kv: {
        async get() {
          return undefined;
        },
        async put() {
          throw new Error('quota exceeded');
        },
        async delete() {
          /* noop */
        },
        async toArray() {
          return [];
        },
        async clear() {
          /* noop */
        },
      },
      // no `store` field needed for this test
    } as unknown as ReturnType<typeof makeFakeAppDb>;
    const { listeners } = installFakeWindow();
    installFakeTimers();
    let dispatchedCount = 0;
    (globalThis.window as unknown as { dispatchEvent: () => void }).dispatchEvent = () => {
      dispatchedCount += 1;
      return true;
    };
    void listeners; // not directly asserted on; dispatchEvent override covers the health signal
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.initBrowserStorage();

    mod.writeBrowserValue('failing-key', 'value');
    await mod.flushBrowserStorageNow();

    const health = mod.getBrowserStorageHealth();
    assert.equal(health.lastError, 'quota exceeded');
    assert.ok(dispatchedCount > 0);
  });

  it('pickNewerStorageValue precedence via reloadBrowserStorageKeys: newer updatedAt wins over an older cached entry', async () => {
    currentAppDb = makeFakeAppDb();
    installFakeWindow();
    installFakeTimers();
    const mod = await import('./browser-storage');
    mod.resetBrowserStorageCache();
    await mod.initBrowserStorage();

    mod.writeBrowserValue('timed-key', { updatedAt: 100, v: 'old' });
    await mod.flushBrowserStorageNow();

    await currentAppDb.kv.put({ key: 'timed-key', value: { updatedAt: 200, v: 'new' } });
    await mod.reloadBrowserStorageKeys(['timed-key']);

    assert.deepEqual(mod.readBrowserValue('timed-key'), { updatedAt: 200, v: 'new' });
  });
});
