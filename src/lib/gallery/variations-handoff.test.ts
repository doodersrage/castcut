import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery';

const buildTopicsVariationsHandoff = mock.fn(
  (items: unknown, mode: string, source: string) => ({ items, mode, source })
);
const saveTopicsVariationsHandoff = mock.fn((_payload: unknown) => {});
const variationsPathFromTopics = mock.fn(() => '/variations?from=topics');
mock.module('../variation/topics-variations-handoff', {
  namedExports: {
    buildTopicsVariationsHandoff,
    saveTopicsVariationsHandoff,
    variationsPathFromTopics,
  },
});

const applyGalleryStackToSession = mock.fn((_entry: unknown, _opts: unknown) => {});
mock.module('./stack-restore', {
  namedExports: { applyGalleryStackToSession },
});

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
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: sessionStorage,
  });
}

afterEach(() => {
  store.clear();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  buildTopicsVariationsHandoff.mock.resetCalls();
  saveTopicsVariationsHandoff.mock.resetCalls();
  applyGalleryStackToSession.mock.resetCalls();
});

describe('gallery-variations-handoff', async () => {
  const {
    GALLERY_VARIATIONS_HANDOFF_KEY,
    buildGalleryVariationsHandoff,
    saveGalleryVariationsHandoff,
    loadGalleryVariationsHandoff,
    galleryVariationsPath,
    buildGalleryTopicsHandoff,
    saveGalleryTopicsHandoff,
    galleryTopicsPath,
    prepareGalleryVariationsFromEntry,
    prepareGalleryTopicsFromEntry,
    variationsPathFromTopics: reExportedVariationsPathFromTopics,
  } = await import('./variations-handoff');

  function entry(overrides?: Partial<ComfyGalleryEntry>): ComfyGalleryEntry {
    return {
      id: 'e1',
      prompt: 'a '.repeat(250) + 'long prompt',
      model: 'flux',
      status: 'completed',
      ...overrides,
    } as ComfyGalleryEntry;
  }

  describe('buildGalleryVariationsHandoff', () => {
    it('truncates hints to 400 chars but keeps the full prompt', () => {
      const built = buildGalleryVariationsHandoff(entry());
      assert.equal(built.hints.length, 400);
      assert.equal(built.prompt, entry().prompt);
      assert.equal(built.model, 'flux');
      assert.ok(typeof built.savedAt === 'number');
    });
  });

  describe('saveGalleryVariationsHandoff / loadGalleryVariationsHandoff', () => {
    it('is a no-op on save and returns null on load when window is undefined', () => {
      saveGalleryVariationsHandoff(buildGalleryVariationsHandoff(entry()));
      assert.equal(loadGalleryVariationsHandoff(), null);
    });

    it('round-trips through sessionStorage', () => {
      installSessionStorage();
      const payload = buildGalleryVariationsHandoff(entry({ prompt: 'short' }));
      saveGalleryVariationsHandoff(payload);
      const loaded = loadGalleryVariationsHandoff();
      assert.equal(loaded?.prompt, 'short');
      assert.equal(loaded?.model, 'flux');
      assert.ok(store.has(GALLERY_VARIATIONS_HANDOFF_KEY));
    });

    it('expires and clears entries older than 30 minutes', () => {
      installSessionStorage();
      saveGalleryVariationsHandoff({
        hints: 'stale',
        prompt: 'stale',
        savedAt: Date.now() - 31 * 60 * 1000,
      });
      assert.equal(loadGalleryVariationsHandoff(), null);
      assert.equal(store.has(GALLERY_VARIATIONS_HANDOFF_KEY), false);
    });

    it('returns null and swallows malformed JSON', () => {
      installSessionStorage();
      store.set(GALLERY_VARIATIONS_HANDOFF_KEY, 'not json');
      assert.equal(loadGalleryVariationsHandoff(), null);
    });
  });

  describe('galleryVariationsPath', () => {
    it('returns the fixed variations route', () => {
      assert.equal(galleryVariationsPath(), '/variations?from=gallery');
    });
  });

  describe('buildGalleryTopicsHandoff', () => {
    it('builds a single template item truncated to 120 chars', () => {
      const items = buildGalleryTopicsHandoff(entry());
      assert.equal(items.length, 1);
      assert.equal(items[0]?.topic.length, 120);
      assert.equal(items[0]?.prompt, entry().prompt);
      assert.equal(items[0]?.provider, 'template');
    });
  });

  describe('saveGalleryTopicsHandoff', () => {
    it('builds and saves via topics-variations-handoff', () => {
      saveGalleryTopicsHandoff(entry({ prompt: 'topic prompt' }));
      assert.equal(buildTopicsVariationsHandoff.mock.calls.length, 1);
      const [items, mode, source] = buildTopicsVariationsHandoff.mock.calls[0]!.arguments;
      assert.deepEqual(items, [
        { topic: 'topic prompt', prompt: 'topic prompt', provider: 'template' },
      ]);
      assert.equal(mode, 'generate');
      assert.equal(source, 'topic prompt');
      assert.equal(saveTopicsVariationsHandoff.mock.calls.length, 1);
    });
  });

  describe('galleryTopicsPath', () => {
    it('returns the fixed topics route', () => {
      assert.equal(galleryTopicsPath(), '/topics?from=gallery');
    });
  });

  describe('prepareGalleryVariationsFromEntry', () => {
    it('applies the stack to session without a toast, then saves the variations handoff', () => {
      installSessionStorage();
      const e = entry({ prompt: 'prep prompt' });
      prepareGalleryVariationsFromEntry(e);
      assert.equal(applyGalleryStackToSession.mock.calls.length, 1);
      assert.deepEqual(applyGalleryStackToSession.mock.calls[0]!.arguments, [e, { toast: false }]);
      const loaded = loadGalleryVariationsHandoff();
      assert.equal(loaded?.prompt, 'prep prompt');
    });
  });

  describe('prepareGalleryTopicsFromEntry', () => {
    it('applies the stack to session without a toast, then saves the topics handoff', () => {
      const e = entry({ prompt: 'prep topic prompt' });
      prepareGalleryTopicsFromEntry(e);
      assert.equal(applyGalleryStackToSession.mock.calls.length, 1);
      assert.deepEqual(applyGalleryStackToSession.mock.calls[0]!.arguments, [e, { toast: false }]);
      assert.equal(saveTopicsVariationsHandoff.mock.calls.length, 1);
    });
  });

  describe('variationsPathFromTopics re-export', () => {
    it('re-exports the same function from topics-variations-handoff', () => {
      assert.equal(reExportedVariationsPathFromTopics, variationsPathFromTopics);
      assert.equal(reExportedVariationsPathFromTopics(), '/variations?from=topics');
    });
  });
});
