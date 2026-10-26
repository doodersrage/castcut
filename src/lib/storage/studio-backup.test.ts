import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import { loadGalleryEloStore } from '../gallery/elo-store';
import { loadSettingsCache, saveSettingsCache } from '../settings/cache';
import { loadWebhookSettings, saveWebhookSettings } from '../settings/webhook-settings';
import {
  exportStudioBackup,
  importStudioBackup,
  isSupportedStudioBackupVersion,
  parseStudioBackupFile,
  type StudioBackupV5,
} from './studio-backup';
import type { SettingsCache } from '../settings/cache';

function emptySettings(): SettingsCache {
  return { shared: {}, tools: {} } as SettingsCache;
}

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
  resetBrowserStorageCache();
  try {
    await run();
  } finally {
    resetBrowserStorageCache();
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

describe('studio backup versions', () => {
  it('accepts v1 through v5', () => {
    assert.equal(isSupportedStudioBackupVersion(1), true);
    assert.equal(isSupportedStudioBackupVersion(5), true);
    assert.equal(isSupportedStudioBackupVersion(6), false);
  });

  it('parses a v5 file that includes extras', () => {
    const parsed = parseStudioBackupFile(
      JSON.stringify({
        version: 5,
        exportedAt: '2026-08-13T00:00:00.000Z',
        history: [],
        locationBlocklist: [],
        settings: emptySettings(),
        extras: { updatedAt: 1, galleryElo: {} },
      })
    );
    assert.equal(parsed.version, 5);
    assert.ok(parsed.version === 5 && parsed.extras?.galleryElo);
  });

  it('rejects missing history', () => {
    assert.throws(() => parseStudioBackupFile(JSON.stringify({ version: 5, settings: {} })));
  });
});

describe('studio backup import', () => {
  beforeEach(() => {
    resetBrowserStorageCache();
  });
  afterEach(() => {
    resetBrowserStorageCache();
  });

  it('restores gallery ELO from v5 extras on a new machine', async () => {
    await withMockLocalStorage(() => {
      const backup: StudioBackupV5 = {
        version: 5,
        exportedAt: new Date().toISOString(),
        history: [],
        locationBlocklist: [],
        settings: emptySettings(),
        extras: {
          updatedAt: 99,
          galleryElo: {
            g1: { groupId: 'g1', entries: [], winnerId: 'winner-a', updatedAt: 99 },
          },
        },
      };
      importStudioBackup(backup);
      assert.equal(loadGalleryEloStore().g1?.winnerId, 'winner-a');
    });
  });
});

// R3: credentials typed in Settings stay in this browser (settings/secret-fields.ts).
describe('studio backup and credentials', () => {
  beforeEach(() => resetBrowserStorageCache());
  afterEach(() => resetBrowserStorageCache());

  it('writes no keys or webhook secret into the file, and keeps the rest', async () => {
    await withMockLocalStorage(() => {
      const cache = loadSettingsCache();
      saveSettingsCache({
        ...cache,
        shared: { ...cache.shared, sessionFalApiKey: 'fal-mine', sessionLlmApiKey: 'llm-mine' },
      });
      saveWebhookSettings({ ...loadWebhookSettings(), url: 'https://hooks.example/x', secret: 'hook-mine' });
      const file = JSON.stringify(exportStudioBackup());
      for (const secret of ['fal-mine', 'llm-mine', 'hook-mine']) {
        assert.equal(file.includes(secret), false, secret);
      }
      assert.ok(file.includes('https://hooks.example/x'), 'the webhook URL is settings, not a key');
      assert.equal(loadSettingsCache().shared.sessionFalApiKey, 'fal-mine', 'still here');
    });
  });

  it("restores a file without touching this browser's keys, and never takes a file's", async () => {
    await withMockLocalStorage(() => {
      const fromOlderFile = (key: string): StudioBackupV5 => ({
        version: 5,
        exportedAt: new Date().toISOString(),
        history: [],
        locationBlocklist: [],
        settings: {
          shared: { sessionFalApiKey: key, expandWildcards: false },
          tools: {},
        } as unknown as SettingsCache,
        webhookSettings: { enabled: true, url: 'https://hooks.example/y', secret: 'file-hook' },
      });
      // A new browser: the file's key is not adopted.
      importStudioBackup(fromOlderFile('file-key'));
      assert.equal(loadSettingsCache().shared.sessionFalApiKey, undefined);
      assert.equal(loadSettingsCache().shared.expandWildcards, false, 'the rest is restored');
      assert.equal(loadWebhookSettings().secret || undefined, undefined);
      assert.equal(loadWebhookSettings().url, 'https://hooks.example/y');

      // A browser with its own key and secret keeps them.
      const cache = loadSettingsCache();
      saveSettingsCache({ ...cache, shared: { ...cache.shared, sessionFalApiKey: 'mine' } });
      saveWebhookSettings({ ...loadWebhookSettings(), secret: 'my-hook' });
      importStudioBackup(fromOlderFile('file-key'));
      assert.equal(loadSettingsCache().shared.sessionFalApiKey, 'mine');
      assert.equal(loadWebhookSettings().secret, 'my-hook');
    });
  });
});
