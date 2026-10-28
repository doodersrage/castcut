import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
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
import { loadLocations, saveLocation } from '../location/records';

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

  it('carries location records to a new machine (M8 T1)', async () => {
    let file = '';
    await withMockLocalStorage(() => {
      resetBrowserStorageCache();
      saveLocation({ id: 'loc-cafe', name: 'Corner café', look: 'green tiled counter' });
      file = JSON.stringify(exportStudioBackup());
    });
    await withMockLocalStorage(() => {
      resetBrowserStorageCache();
      assert.deepEqual(loadLocations(), []);
      const parsed = parseStudioBackupFile(file);
      assert.ok(parsed?.version === 5 && parsed.extras?.locations, 'in the file');
      // Only the locations from its extras (the rest — workspace mode — wants a document).
      importStudioBackup({
        ...parsed,
        extras: { updatedAt: parsed.extras.updatedAt, locations: parsed.extras.locations },
      });
      assert.deepEqual(
        loadLocations().map(location => [location.id, location.name, location.look]),
        [['loc-cafe', 'Corner café', 'green tiled counter']]
      );
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

// R9 (M1 gate): a backup restored on a new machine keeps the production — the scenes and their
// kept takes, the cut with its pinned shots and versions, and how each take was made.
describe('studio backup round trip (M1)', () => {
  beforeEach(() => resetBrowserStorageCache());
  afterEach(() => resetBrowserStorageCache());

  it('restores scenes, the cut and the takes’ provenance on a new machine', async () => {
    const graph = '{"3":{"class_type":"KSampler","inputs":{"seed":777}}}';
    const takeUrl = '/api/gallery/media/8a6c1f8e-0000-4000-8000-0000000000aa';
    // Restoring appearance and the workspace mode touches the page (its cookie, theme marks).
    const hadDocument = 'document' in globalThis;
    const noop = () => undefined;
    if (!hadDocument) {
      (globalThis as { document?: unknown }).document = {
        cookie: '',
        documentElement: {
          dataset: {},
          style: { setProperty: noop, removeProperty: noop },
          classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
          setAttribute: noop,
          removeAttribute: noop,
        },
        dispatchEvent: () => true,
        querySelector: () => null,
      };
    }
    after(() => {
      if (!hadDocument) delete (globalThis as { document?: unknown }).document;
    });
    await withMockLocalStorage(async () => {
      Object.assign(globalThis.window, {
        matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
        addEventListener: noop,
        removeEventListener: noop,
      });
      const { setGalleryCache, getGalleryEntryById } = await import('../gallery/db-store');
      const scene = {
        id: 'scene-roof',
        castId: 'nora',
        name: 'Rooftop',
        slot: { id: 'evening', label: 'Evening', location: 'rooftop' },
        takes: [
          { id: 'p-take-1', promptId: 'p-take-1', imageUrl: takeUrl, at: 1 },
          // Rejected (M7 T3): the verdict comes back with the backup.
          {
            id: 'p-take-2',
            promptId: 'p-take-2',
            imageUrl: '/api/gallery/media/other',
            at: 2,
            review: 'rejected',
          },
        ],
        keptTakeId: 'p-take-1',
        createdAt: 1,
        updatedAt: 2,
      };
      const cut = {
        options: {
          shotEdits: {
            order: ['scenes:scene-roof'],
            shots: { 'scenes:scene-roof': { holdSec: 4, pin: { url: takeUrl, kind: 'still', at: 3 } } },
          },
        },
        versions: [{ id: 'v1', name: 'Long', savedAt: 3, options: { length: 'shots' } }],
      };
      const cache = loadSettingsCache();
      saveSettingsCache({
        ...cache,
        tools: { ...cache.tools, scene: { scenes: [scene], activeSceneId: 'scene-roof' }, cut },
      } as unknown as SettingsCache);
      setGalleryCache([
        {
          id: '8a6c1f8e-0000-4000-8000-0000000000aa',
          promptId: 'p-take-1',
          prompt: 'rooftop at dusk',
          comfyUrl: 'http://127.0.0.1:8188',
          status: 'completed',
          // Recent: an old graph nothing in the film uses is pruned on save (workflow-hygiene).
          queuedAt: Date.now() - 60_000,
          completedAt: Date.now() - 30_000,
          model: 'qwen-e2e',
          queueParams: { seed: 777 },
          workflowJson: graph,
          hasStoredWorkflow: true,
          images: [{ filename: 'roof.png', subfolder: '', type: 'output' }],
        },
      ]);

      const file = JSON.stringify(exportStudioBackup());

      // A new machine: nothing stored.
      resetBrowserStorageCache();
      setGalleryCache([]);
      saveSettingsCache({ shared: {}, tools: {} } as SettingsCache);

      importStudioBackup(parseStudioBackupFile(file));

      const tools = loadSettingsCache().tools as unknown as {
        scene: { scenes: Array<{ keptTakeId?: string; takes: Array<{ review?: string }> }> };
        cut: {
          options: { shotEdits: { shots: Record<string, { pin?: { url: string } }> } };
          versions: Array<{ name: string }>;
        };
      };
      assert.equal(tools.scene.scenes[0]?.keptTakeId, 'p-take-1');
      assert.equal(tools.scene.scenes[0]?.takes.length, 2);
      assert.equal(tools.scene.scenes[0]?.takes[1]?.review, 'rejected');
      assert.equal(tools.cut.options.shotEdits.shots['scenes:scene-roof']?.pin?.url, takeUrl);
      assert.equal(tools.cut.versions[0]?.name, 'Long');
      const entry = getGalleryEntryById('8a6c1f8e-0000-4000-8000-0000000000aa');
      assert.equal(entry?.promptId, 'p-take-1');
      assert.equal(entry?.queueParams?.seed, 777);
      assert.equal(entry?.workflowJson, graph, 'the exact graph comes back too');
    });
  });
});
