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

describe('topics-variations-handoff', async () => {
  const {
    TOPICS_VARIATIONS_HANDOFF_KEY,
    buildTopicsVariationsHandoff,
    saveTopicsVariationsHandoff,
    loadTopicsVariationsHandoff,
    variationsPathFromTopics,
  } = await import('./topics-variations-handoff');

  describe('buildTopicsVariationsHandoff', () => {
    const results = [
      { topic: 'sunset beach', prompt: 'a photo of a sunset beach' },
      { topic: 'mountain cabin', prompt: 'a photo of a mountain cabin' },
    ] as never[];

    it('uses the trimmed seedTopic for hints when given', () => {
      const payload = buildTopicsVariationsHandoff(results, 'generate', '  custom seed  ');
      assert.equal(payload.hints, 'custom seed');
      assert.equal(payload.target, 'generate');
      assert.deepEqual(payload.prompts, [
        'a photo of a sunset beach',
        'a photo of a mountain cabin',
      ]);
      assert.deepEqual(payload.topics, ['sunset beach', 'mountain cabin']);
      assert.ok(typeof payload.savedAt === 'number');
    });

    it('falls back to the first result topic when no seedTopic is given', () => {
      const payload = buildTopicsVariationsHandoff(results, 'character');
      assert.equal(payload.hints, 'sunset beach');
    });

    it('falls back to an empty string hint when there are no results and no seedTopic', () => {
      const payload = buildTopicsVariationsHandoff([], 'pet');
      assert.equal(payload.hints, '');
      assert.deepEqual(payload.prompts, []);
      assert.deepEqual(payload.topics, []);
    });
  });

  describe('saveTopicsVariationsHandoff / loadTopicsVariationsHandoff', () => {
    it('save is a no-op without a window', () => {
      saveTopicsVariationsHandoff({
        hints: 'x',
        prompts: ['a'],
        topics: ['t'],
        target: 'generate',
        savedAt: 1,
      });
      assert.equal(store.size, 0);
    });

    it('load returns null without a window', () => {
      assert.equal(loadTopicsVariationsHandoff(), null);
    });

    it('saves to sessionStorage and updates the variations settings cache', () => {
      installSessionStorage();
      cache = { tools: { variations: { count: 4 } } };
      const payload = {
        hints: 'beach scenes',
        prompts: ['p1', 'p2'],
        topics: ['t1', 't2'],
        target: 'background' as const,
        savedAt: 12345,
      };
      saveTopicsVariationsHandoff(payload);

      const raw = store.get(TOPICS_VARIATIONS_HANDOFF_KEY);
      assert.ok(raw);
      assert.deepEqual(JSON.parse(raw!), payload);

      assert.equal(saveSettingsCache.mock.calls.length, 1);
      const saved = saveSettingsCache.mock.calls[0]!.arguments[0] as FakeCache;
      assert.equal(saved.tools.variations!.hints, 'beach scenes');
      assert.equal(saved.tools.variations!.count, 2);
      assert.equal(saved.tools.variations!.target, 'background');
      assert.deepEqual(saved.tools.variations!.importedBatchPrompts, ['p1', 'p2']);
      assert.deepEqual(saved.tools.variations!.importedBatchTopics, ['t1', 't2']);
    });

    it('loads and returns a validly-shaped saved handoff', () => {
      installSessionStorage();
      const payload = {
        hints: 'x',
        prompts: ['a', 'b'],
        topics: ['t1', 't2'],
        target: 'generate' as const,
        savedAt: 1,
      };
      store.set(TOPICS_VARIATIONS_HANDOFF_KEY, JSON.stringify(payload));
      assert.deepEqual(loadTopicsVariationsHandoff(), payload);
    });

    it('returns null when nothing is stored', () => {
      installSessionStorage();
      assert.equal(loadTopicsVariationsHandoff(), null);
    });

    it('returns null when the stored payload has no prompts array', () => {
      installSessionStorage();
      store.set(TOPICS_VARIATIONS_HANDOFF_KEY, JSON.stringify({ hints: 'x' }));
      assert.equal(loadTopicsVariationsHandoff(), null);
    });

    it('returns null when the stored payload has an empty prompts array', () => {
      installSessionStorage();
      store.set(
        TOPICS_VARIATIONS_HANDOFF_KEY,
        JSON.stringify({ hints: 'x', prompts: [], topics: [], target: 'generate', savedAt: 1 })
      );
      assert.equal(loadTopicsVariationsHandoff(), null);
    });

    it('returns null on malformed JSON without throwing', () => {
      installSessionStorage();
      store.set(TOPICS_VARIATIONS_HANDOFF_KEY, '{not json');
      assert.equal(loadTopicsVariationsHandoff(), null);
    });
  });

  describe('variationsPathFromTopics', () => {
    it('returns the fixed variations-from-topics deep link', () => {
      assert.equal(variationsPathFromTopics(), '/variations?from=topics');
    });
  });
});
