import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import {
  loadSettingsCache,
  saveSharedSettings,
  saveSharedSettingsNow,
  saveSessionLoraSelectionNow,
  saveSettingsCache,
  setUseSystemWorkflowsPref,
  SYSTEM_WORKFLOWS_PREF_KEY,
  SESSION_LORA_PREFS_KEY,
} from './settings-cache';

async function withMockLocalStorage(run: () => void | Promise<void>): Promise<void> {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        get length() {
          return storage.size;
        },
        key: (index: number) => [...storage.keys()][index] ?? null,
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      dispatchEvent: () => true,
    },
  });
  try {
    await run();
  } finally {
    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  }
}

describe('settings persistence sidecars', () => {
  beforeEach(async () => {
    await withMockLocalStorage(() => resetBrowserStorageCache());
  });

  afterEach(async () => {
    await withMockLocalStorage(() => resetBrowserStorageCache());
  });

  it('persists useSystemWorkflows via sidecar and reloads after cache reset', async () => {
    await withMockLocalStorage(async () => {
      resetBrowserStorageCache();
      const shared = {
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
      };
      await saveSharedSettingsNow(shared);
      assert.equal(window.localStorage.getItem(SYSTEM_WORKFLOWS_PREF_KEY), '1');

      resetBrowserStorageCache();
      const reloaded = loadSettingsCache().shared;
      assert.equal(reloaded.useSystemWorkflows, true);
    });
  });

  it('a fresh profile saving defaults before the server pull does not turn system workflows off', async () => {
    await withMockLocalStorage(async () => {
      resetBrowserStorageCache();
      // Plugin manifest / migration save on a fresh profile — defaults, before the server pull.
      saveSettingsCache(loadSettingsCache());
      assert.equal(window.localStorage.getItem(SYSTEM_WORKFLOWS_PREF_KEY), null);
      // The server pull merges the stored "on" and saves it — the sidecar must not undo that.
      const pulled = loadSettingsCache();
      saveSettingsCache({ ...pulled, shared: { ...pulled.shared, useSystemWorkflows: true } });
      assert.equal(loadSettingsCache().shared.useSystemWorkflows, true);
      assert.equal(window.localStorage.getItem(SYSTEM_WORKFLOWS_PREF_KEY), '1');
    });
  });

  it('unrelated shared save preserves multi-lora stack', async () => {
    await withMockLocalStorage(async () => {
      resetBrowserStorageCache();
      const shared = {
        ...loadSettingsCache().shared,
        sessionActiveLoraIdsByModel: { 'flux-dev': ['lora-a', 'lora-b', 'lora-c'] },
      };
      await saveSharedSettingsNow(shared);
      saveSharedSettings({
        ...loadSettingsCache().shared,
        detail: 'rich',
      });
      assert.deepEqual(loadSettingsCache().shared.sessionActiveLoraIdsByModel?.['flux-dev'], [
        'lora-a',
        'lora-b',
        'lora-c',
      ]);
    });
  });

  it('map-only save does not clear useSystemWorkflows when sidecar is enabled', async () => {
    await withMockLocalStorage(async () => {
      resetBrowserStorageCache();
      await setUseSystemWorkflowsPref(true);
      const shared = loadSettingsCache().shared;
      saveSharedSettings({
        ...shared,
        useSystemWorkflows: false,
        modelCheckpointMap: { ...shared.modelCheckpointMap, 'test-model': 'test.ckpt' },
      });
      assert.equal(loadSettingsCache().shared.useSystemWorkflows, true);
      assert.equal(window.localStorage.getItem(SYSTEM_WORKFLOWS_PREF_KEY), '1');
    });
  });

  it('persists session LoRAs via sidecar and reloads after cache reset', async () => {
    await withMockLocalStorage(async () => {
      resetBrowserStorageCache();
      const shared = {
        ...loadSettingsCache().shared,
        sessionActiveLoraIdsByModel: { 'flux-dev': ['lora-a', 'lora-b'] },
      };
      await saveSessionLoraSelectionNow(shared);
      assert.ok(window.localStorage.getItem(SESSION_LORA_PREFS_KEY)?.includes('lora-a'));

      resetBrowserStorageCache();
      const reloaded = loadSettingsCache().shared;
      assert.deepEqual(reloaded.sessionActiveLoraIdsByModel?.['flux-dev'], ['lora-a', 'lora-b']);
    });
  });

  it('keeps a shorter session LoRA stack after uncheck + reload', async () => {
    await withMockLocalStorage(async () => {
      resetBrowserStorageCache();
      await saveSessionLoraSelectionNow({
        ...loadSettingsCache().shared,
        sessionActiveLoraIdsByModel: {
          'flux-2-klein-9b': ['klein-snofs', 'klein-realistic-detail', 'klein-ultra-real-v4'],
        },
      });
      await saveSessionLoraSelectionNow({
        ...loadSettingsCache().shared,
        sessionActiveLoraIdsByModel: {
          'flux-2-klein-9b': ['klein-realistic-detail', 'klein-ultra-real-v4'],
        },
      });

      resetBrowserStorageCache();
      const reloaded = loadSettingsCache().shared;
      assert.deepEqual(reloaded.sessionActiveLoraIdsByModel?.['flux-2-klein-9b'], [
        'klein-realistic-detail',
        'klein-ultra-real-v4',
      ]);
      assert.equal(
        window.localStorage.getItem(SESSION_LORA_PREFS_KEY)?.includes('klein-snofs'),
        false
      );
    });
  });

  it('a load that migrates does not undo the save that follows it', async () => {
    await withMockLocalStorage(async () => {
      resetBrowserStorageCache();
      // Legacy `duo` tools make every load migrate and queue a save of its snapshot.
      saveSettingsCache({
        shared: {
          ...loadSettingsCache().shared,
          sessionActiveLoraIdsByModel: { 'flux-2-klein-9b': ['klein-a', 'sdxl-b'] },
        },
        tools: { duo: {} } as never,
        installedPlugins: [],
      });
      await new Promise(resolve => setTimeout(resolve, 0));

      saveSharedSettings({
        ...loadSettingsCache().shared,
        sessionActiveLoraIdsByModel: { 'flux-2-klein-9b': ['klein-a'] },
      });
      await new Promise(resolve => setTimeout(resolve, 0));

      resetBrowserStorageCache();
      assert.deepEqual(loadSettingsCache().shared.sessionActiveLoraIdsByModel?.['flux-2-klein-9b'], [
        'klein-a',
      ]);
    });
  });

  it('persists session LoRAs via sidecar', async () => {
    await withMockLocalStorage(async () => {
      resetBrowserStorageCache();
      const shared = {
        ...loadSettingsCache().shared,
        sessionActiveLoraIdsByModel: { 'flux-dev': ['lora-a', 'lora-b'] },
      };
      await saveSharedSettingsNow(shared);
      assert.ok(window.localStorage.getItem(SESSION_LORA_PREFS_KEY)?.includes('lora-a'));

      resetBrowserStorageCache();
      const reloaded = loadSettingsCache().shared;
      assert.deepEqual(reloaded.sessionActiveLoraIdsByModel?.['flux-dev'], ['lora-a', 'lora-b']);
    });
  });
});
