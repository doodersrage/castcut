import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { HistorySavedView } from './saved-views';

let stored: unknown = null;
const readBrowserValue = mock.fn(<T>(): T | null => stored as T | null);
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  stored = value;
});
mock.module('../storage/browser-storage', { namedExports: { readBrowserValue, writeBrowserValue } });

describe('history-saved-views', async () => {
  const {
    loadHistorySavedViews,
    saveHistorySavedViews,
    upsertHistorySavedView,
    deleteHistorySavedView,
  } = await import('./saved-views');

  // loadHistorySavedViews() has its own `typeof window === 'undefined'` SSR
  // guard, so `window` must be stubbed for it to reach readBrowserValue at
  // all — Node's test environment has no `window` by default.
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  function view(id: string, extra?: Partial<HistorySavedView>): HistorySavedView {
    return { id, name: id, filter: {}, createdAt: 0, ...extra };
  }

  describe('loadHistorySavedViews', () => {
    it('returns an empty array when nothing is stored', () => {
      stored = null;
      assert.deepEqual(loadHistorySavedViews(), []);
    });

    it('returns [] when window is undefined (SSR guard), even if something is stored', () => {
      delete (globalThis as { window?: unknown }).window;
      stored = [view('a')];
      assert.deepEqual(loadHistorySavedViews(), []);
    });

    it('returns the stored views verbatim', () => {
      stored = [view('a'), view('b')];
      assert.deepEqual(loadHistorySavedViews(), [view('a'), view('b')]);
    });
  });

  describe('saveHistorySavedViews', () => {
    it('persists views that loadHistorySavedViews can read back', () => {
      stored = null;
      saveHistorySavedViews([view('a')]);
      assert.deepEqual(loadHistorySavedViews(), [view('a')]);
    });

    it('caps persisted views at 20 entries', () => {
      stored = null;
      const views = Array.from({ length: 25 }, (_, i) => view(`v${i}`));
      saveHistorySavedViews(views);
      const saved = loadHistorySavedViews();
      assert.equal(saved.length, 20);
      assert.deepEqual(
        saved.map(v => v.id),
        views.slice(0, 20).map(v => v.id)
      );
    });
  });

  describe('upsertHistorySavedView', () => {
    it('prepends a new view and stamps createdAt when missing', () => {
      stored = null;
      const before = Date.now();
      const result = upsertHistorySavedView({ id: 'new', name: 'new', filter: {} });
      assert.equal(result.id, 'new');
      assert.ok(typeof result.createdAt === 'number' && result.createdAt >= before);
      assert.deepEqual(
        loadHistorySavedViews().map(v => v.id),
        ['new']
      );
    });

    it('preserves an explicitly provided createdAt', () => {
      stored = null;
      const result = upsertHistorySavedView(view('new', { createdAt: 12345 }));
      assert.equal(result.createdAt, 12345);
    });

    it('replaces an existing view with the same id, moving it to the front', () => {
      stored = [view('a', { createdAt: 1 }), view('b', { createdAt: 2 })];
      const result = upsertHistorySavedView(view('a', { name: 'renamed', createdAt: 1 }));
      const saved = loadHistorySavedViews();
      assert.equal(saved.length, 2);
      assert.equal(saved[0]?.id, 'a');
      assert.equal(saved[0]?.name, 'renamed');
      assert.equal(saved[1]?.id, 'b');
      assert.equal(result.name, 'renamed');
    });
  });

  describe('deleteHistorySavedView', () => {
    it('removes the view with the matching id and leaves the rest', () => {
      stored = [view('a'), view('b'), view('c')];
      deleteHistorySavedView('b');
      assert.deepEqual(
        loadHistorySavedViews().map(v => v.id),
        ['a', 'c']
      );
    });

    it('is a no-op when the id is not present', () => {
      stored = [view('a')];
      deleteHistorySavedView('missing');
      assert.deepEqual(
        loadHistorySavedViews().map(v => v.id),
        ['a']
      );
    });
  });
});
