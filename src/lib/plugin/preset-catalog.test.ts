import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { PluginManifest, PluginManifestPresetProvider } from './manifest';

let installedPlugins: PluginManifest[] = [];
const loadInstalledPlugins = mock.fn(() => installedPlugins);
mock.module('./manifest', {
  namedExports: {
    loadInstalledPlugins,
    PLUGIN_MANIFEST_UPDATED_EVENT: 'plugin-manifest-updated',
  },
});

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;
function installFetchStub(impl: FetchImpl) {
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) =>
    Promise.resolve(impl(url, init))) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

function plugin(
  id: string,
  provider: PluginManifestPresetProvider,
  overrides: Partial<PluginManifest> = {}
): PluginManifest {
  return { id, label: id, version: '1.0.0', presetProvider: provider, ...overrides };
}

afterEach(() => {
  installedPlugins = [];
  loadInstalledPlugins.mock.resetCalls();
  delete (globalThis as { window?: unknown }).window;
});

describe('plugin-preset-catalog', async () => {
  const {
    hydratePluginPresetCache,
    schedulePluginPresetCacheHydration,
    searchPluginPresetCache,
    registerPluginPresetCacheListeners,
  } = await import('./preset-catalog');

  describe('searchPluginPresetCache with an empty cache', () => {
    it('returns [] for a query below 2 characters', () => {
      assert.deepEqual(searchPluginPresetCache('a'), []);
    });

    it('returns [] when no plugin catalog has ever been hydrated with this term', () => {
      assert.deepEqual(searchPluginPresetCache('never-hydrated-term'), []);
    });
  });

  describe('hydratePluginPresetCache (no window)', () => {
    it('is a no-op without window', async () => {
      installedPlugins = [plugin('p-nowindow', { kind: 'scene-starter', catalogUrl: '/x' })];
      await hydratePluginPresetCache();
      assert.equal(loadInstalledPlugins.mock.calls.length, 0);
    });
  });

  describe('with a stubbed window', () => {
    it('fetches scene-starter presets, normalizes them, and makes them searchable', async () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      const restoreFetch = installFetchStub(() =>
        jsonResponse([
          { id: 'sunset', name: 'Sunset Beach', hints: 'golden hour, beach' },
          { id: '  ', name: 'blank id skipped' },
        ])
      );
      try {
        installedPlugins = [plugin('p-scene-1', { kind: 'scene-starter', catalogUrl: '/scene-1' })];
        await hydratePluginPresetCache();
        const results = searchPluginPresetCache('sunset beach');
        assert.equal(results.length, 1);
        assert.equal(results[0]!.label, 'Sunset Beach');
        assert.equal(results[0]!.group, 'Presets');
        assert.equal(results[0]!.href, '/?scene=sunset');
      } finally {
        restoreFetch();
      }
    });

    it('fetches nsfw-generator presets and tags them under the Adult presets group', async () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      const restoreFetch = installFetchStub(() =>
        jsonResponse([{ id: 'edgy-1', label: 'Edgy Look', hints: 'dramatic lighting' }])
      );
      try {
        installedPlugins = [plugin('p-nsfw-1', { kind: 'nsfw-generator', catalogUrl: '/nsfw-1' })];
        await hydratePluginPresetCache();
        const results = searchPluginPresetCache('edgy');
        assert.equal(results.length, 1);
        assert.equal(results[0]!.group, 'Adult presets');
        assert.equal(results[0]!.href, '/plugins/p-nsfw-1?presetId=edgy-1');
      } finally {
        restoreFetch();
      }
    });

    it('skips plugins with enabled:false or no presetProvider.catalogUrl', async () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      const restoreFetch = installFetchStub(() =>
        jsonResponse([{ id: 'x', name: 'Should not fetch', hints: '' }])
      );
      try {
        installedPlugins = [
          plugin('p-disabled', { kind: 'scene-starter', catalogUrl: '/disabled' }, { enabled: false }),
          { id: 'p-no-provider', label: 'x', version: '1.0.0' },
        ];
        await hydratePluginPresetCache();
        assert.deepEqual(searchPluginPresetCache('should not fetch'), []);
      } finally {
        restoreFetch();
      }
    });

    it('caches an empty preset list for a non-ok fetch response, without throwing', async () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      const restoreFetch = installFetchStub(() => jsonResponse([], false));
      try {
        installedPlugins = [plugin('p-notok-1', { kind: 'scene-starter', catalogUrl: '/notok-1' })];
        await hydratePluginPresetCache();
        assert.deepEqual(searchPluginPresetCache('anything at all'), []);
      } finally {
        restoreFetch();
      }
    });

    it('catches a thrown fetch error and caches an empty list instead of rejecting', async () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      const restoreFetch = installFetchStub(() => {
        throw new Error('network down');
      });
      try {
        installedPlugins = [plugin('p-error-1', { kind: 'scene-starter', catalogUrl: '/error-1' })];
        await assert.doesNotReject(() => hydratePluginPresetCache());
      } finally {
        restoreFetch();
      }
    });

    it('does not re-fetch a fresh cache entry unless force=true', async () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      let fetchCount = 0;
      const restoreFetch = installFetchStub(() => {
        fetchCount += 1;
        return jsonResponse([{ id: 'p1', name: `Preset ${fetchCount}`, hints: '' }]);
      });
      try {
        installedPlugins = [plugin('p-cache-1', { kind: 'scene-starter', catalogUrl: '/cache-1' })];
        await hydratePluginPresetCache();
        await hydratePluginPresetCache();
        assert.equal(fetchCount, 1);
        await hydratePluginPresetCache(true);
        assert.equal(fetchCount, 2);
      } finally {
        restoreFetch();
      }
    });

    it('searchPluginPresetCache scores an exact match above a substring match and truncates the subtitle to 60 chars', async () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      const longHint = 'x'.repeat(100);
      const restoreFetch = installFetchStub(() =>
        jsonResponse([
          { id: 'exact', name: 'forest', hints: longHint },
          { id: 'partial', name: 'forest clearing at dawn', hints: '' },
        ])
      );
      try {
        installedPlugins = [plugin('p-score-1', { kind: 'scene-starter', catalogUrl: '/score-1' })];
        await hydratePluginPresetCache();
        const results = searchPluginPresetCache('forest');
        assert.equal(results.length, 2);
        assert.equal(results[0]!.label, 'forest');
        assert.equal(results[0]!.subtitle!.length, 60);
      } finally {
        restoreFetch();
      }
    });

    it('searchPluginPresetCache respects the limit parameter', async () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      const restoreFetch = installFetchStub(() =>
        jsonResponse(
          Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `matchme-${i}`, hints: '' }))
        )
      );
      try {
        installedPlugins = [plugin('p-limit-1', { kind: 'scene-starter', catalogUrl: '/limit-1' })];
        await hydratePluginPresetCache();
        const results = searchPluginPresetCache('matchme', 2);
        assert.equal(results.length, 2);
      } finally {
        restoreFetch();
      }
    });

    it('schedulePluginPresetCacheHydration dedupes concurrent calls unless force is set', async () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      let fetchCount = 0;
      const restoreFetch = installFetchStub(() => {
        fetchCount += 1;
        return jsonResponse([{ id: 'p1', name: 'Preset', hints: '' }]);
      });
      try {
        installedPlugins = [plugin('p-sched-1', { kind: 'scene-starter', catalogUrl: '/sched-1' })];
        schedulePluginPresetCacheHydration();
        schedulePluginPresetCacheHydration();
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(fetchCount, 1);
      } finally {
        restoreFetch();
      }
    });

    it('registerPluginPresetCacheListeners kicks off hydration and re-hydrates on the manifest-updated event, then unregisters cleanly', async () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
      let fetchCount = 0;
      const restoreFetch = installFetchStub(() => {
        fetchCount += 1;
        return jsonResponse([{ id: 'p1', name: `Preset ${fetchCount}`, hints: '' }]);
      });
      try {
        installedPlugins = [plugin('p-listen-1', { kind: 'scene-starter', catalogUrl: '/listen-1' })];
        const unregister = registerPluginPresetCacheListeners();
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(fetchCount, 1);
        window.dispatchEvent(new Event('plugin-manifest-updated'));
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(fetchCount, 2);
        unregister();
        window.dispatchEvent(new Event('plugin-manifest-updated'));
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(fetchCount, 2);
      } finally {
        restoreFetch();
      }
    });

    it('registerPluginPresetCacheListeners is a no-op returning a callable teardown without window', () => {
      const teardown = registerPluginPresetCacheListeners();
      assert.equal(typeof teardown, 'function');
      assert.doesNotThrow(() => teardown());
    });
  });
});
