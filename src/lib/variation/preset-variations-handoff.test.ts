import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

type FakeCache = { tools: { variations?: Record<string, unknown> } };
let cache: FakeCache = { tools: {} };
const loadSettingsCache = mock.fn(() => cache);
const saveSettingsCache = mock.fn((next: FakeCache) => {
  cache = next;
});
mock.module('../settings/cache', { namedExports: { loadSettingsCache, saveSettingsCache } });

const store = new Map<string, string>();

function installSessionStorage(): void {
  const sessionStorage = {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { sessionStorage },
  });
}

afterEach(() => {
  store.clear();
  delete (globalThis as { window?: unknown }).window;
  cache = { tools: {} };
  loadSettingsCache.mock.resetCalls();
  saveSettingsCache.mock.resetCalls();
});

describe('preset-variations-handoff', async () => {
  const {
    PRESET_VARIATIONS_HANDOFF_KEY,
    buildPresetVariationsHandoff,
    savePresetVariationsHandoff,
    loadPresetVariationsHandoff,
    presetVariationsPath,
  } = await import('./preset-variations-handoff');

  describe('buildPresetVariationsHandoff', () => {
    it('trims hints and defaults target/count when not given', () => {
      const payload = buildPresetVariationsHandoff({ hints: '  a scene  ' });
      assert.equal(payload.hints, 'a scene');
      assert.equal(payload.target, 'generate');
      assert.equal(payload.count, 4);
      assert.ok(typeof payload.savedAt === 'number');
    });

    it('passes through explicit target/count/portraitStyle/sportPresetId', () => {
      const payload = buildPresetVariationsHandoff({
        hints: 'x',
        target: 'character',
        count: 8,
        portraitStyle: 'action',
        sportPresetId: 'sport-1',
      });
      assert.equal(payload.target, 'character');
      assert.equal(payload.count, 8);
      assert.equal(payload.portraitStyle, 'action');
      assert.equal(payload.sportPresetId, 'sport-1');
    });
  });

  describe('savePresetVariationsHandoff (no window)', () => {
    it('is a no-op without window', () => {
      savePresetVariationsHandoff(buildPresetVariationsHandoff({ hints: 'x' }));
      assert.equal(loadSettingsCache.mock.calls.length, 0);
    });
  });

  describe('loadPresetVariationsHandoff (no window)', () => {
    it('returns null without window', () => {
      assert.equal(loadPresetVariationsHandoff(), null);
    });
  });

  describe('with a stubbed window', () => {
    it('savePresetVariationsHandoff writes to sessionStorage and merges into the settings cache variations tool', () => {
      installSessionStorage();
      const payload = buildPresetVariationsHandoff({
        hints: 'a scene',
        target: 'pet',
        count: 6,
        portraitStyle: 'full-body',
        sportPresetId: 'sport-2',
      });
      savePresetVariationsHandoff(payload);
      assert.equal(store.get(PRESET_VARIATIONS_HANDOFF_KEY), JSON.stringify(payload));
      assert.equal(saveSettingsCache.mock.calls.length, 1);
      const saved = saveSettingsCache.mock.calls[0]!.arguments[0] as FakeCache;
      assert.deepEqual(saved.tools.variations, {
        hints: 'a scene',
        count: 6,
        target: 'pet',
        portraitStyle: 'full-body',
        sportPresetId: 'sport-2',
        gridMode: 'roll',
      });
    });

    it('loadPresetVariationsHandoff round-trips a freshly saved payload', () => {
      installSessionStorage();
      const payload = buildPresetVariationsHandoff({ hints: 'a scene' });
      savePresetVariationsHandoff(payload);
      // JSON.stringify drops keys whose value is undefined (portraitStyle,
      // sportPresetId here), so the round-tripped object omits them rather
      // than carrying them as `undefined` -- compare against the same
      // JSON round trip rather than the original payload object.
      assert.deepEqual(loadPresetVariationsHandoff(), JSON.parse(JSON.stringify(payload)));
    });

    it('returns null when nothing is stored', () => {
      installSessionStorage();
      assert.equal(loadPresetVariationsHandoff(), null);
    });

    it('returns null and clears storage for a payload older than 30 minutes', () => {
      installSessionStorage();
      const stale = { ...buildPresetVariationsHandoff({ hints: 'a scene' }), savedAt: Date.now() - 31 * 60 * 1000 };
      store.set(PRESET_VARIATIONS_HANDOFF_KEY, JSON.stringify(stale));
      assert.equal(loadPresetVariationsHandoff(), null);
      assert.equal(store.has(PRESET_VARIATIONS_HANDOFF_KEY), false);
    });

    it('returns null for a payload with blank/missing hints', () => {
      installSessionStorage();
      const noHints = { ...buildPresetVariationsHandoff({ hints: 'x' }), hints: '   ' };
      store.set(PRESET_VARIATIONS_HANDOFF_KEY, JSON.stringify(noHints));
      assert.equal(loadPresetVariationsHandoff(), null);
    });

    it('returns null (does not throw) for malformed stored JSON', () => {
      installSessionStorage();
      store.set(PRESET_VARIATIONS_HANDOFF_KEY, '{not json');
      assert.equal(loadPresetVariationsHandoff(), null);
    });
  });

  describe('presetVariationsPath', () => {
    it('returns the fixed variations-from-preset path', () => {
      assert.equal(presetVariationsPath(), '/variations?from=preset');
    });
  });
});
