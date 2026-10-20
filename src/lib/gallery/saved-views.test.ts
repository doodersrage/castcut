import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { GallerySavedView } from './saved-views';

let stored: unknown = null;
const readBrowserValue = mock.fn(<T>(): T | null => stored as T | null);
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  stored = value;
});
mock.module('../browser-storage', { namedExports: { readBrowserValue, writeBrowserValue } });

describe('gallery-saved-views', async () => {
  const {
    loadGallerySavedViews,
    saveGallerySavedViews,
    upsertGallerySavedView,
    deleteGallerySavedView,
  } = await import('./saved-views');

  // loadGallerySavedViews() itself has an `typeof window === 'undefined'` SSR
  // guard, so a `window` global must be present for it to reach
  // readBrowserValue at all — Node's test environment has no `window` by
  // default. saveGallerySavedViews/upsert/delete are NOT guarded and would
  // write through even without window, but we stub it for every test so the
  // round trip through loadGallerySavedViews is exercised consistently.
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  function view(id: string, extra?: Partial<GallerySavedView>): GallerySavedView {
    return { id, name: id, filter: {}, sort: undefined, createdAt: 0, ...extra };
  }

  describe('loadGallerySavedViews', () => {
    it('returns an empty array when nothing is stored', () => {
      stored = null;
      assert.deepEqual(loadGallerySavedViews(), []);
    });

    it('returns [] when window is undefined (SSR guard), even if something is stored', () => {
      delete (globalThis as { window?: unknown }).window;
      stored = [view('a')];
      assert.deepEqual(loadGallerySavedViews(), []);
    });

    it('returns the stored views verbatim', () => {
      stored = [view('a'), view('b')];
      assert.deepEqual(loadGallerySavedViews(), [view('a'), view('b')]);
    });
  });

  describe('saveGallerySavedViews', () => {
    it('persists views that loadGallerySavedViews can read back', () => {
      stored = null;
      saveGallerySavedViews([view('a')]);
      assert.deepEqual(loadGallerySavedViews(), [view('a')]);
    });

    it('caps persisted views at 20 entries', () => {
      stored = null;
      const views = Array.from({ length: 25 }, (_, i) => view(`v${i}`));
      saveGallerySavedViews(views);
      const saved = loadGallerySavedViews();
      assert.equal(saved.length, 20);
      assert.deepEqual(
        saved.map(v => v.id),
        views.slice(0, 20).map(v => v.id)
      );
    });
  });

  describe('upsertGallerySavedView', () => {
    it('prepends a new view and stamps createdAt when missing', () => {
      stored = null;
      const before = Date.now();
      // Omit createdAt entirely here (rather than using the view() helper,
      // which always sets one) so `view.createdAt ?? Date.now()` actually
      // hits its Date.now() branch — createdAt: 0 would otherwise survive
      // the ?? check since 0 is not nullish.
      const result = upsertGallerySavedView({ id: 'new', name: 'new', filter: {} });
      assert.equal(result.id, 'new');
      assert.ok(typeof result.createdAt === 'number' && result.createdAt >= before);
      assert.deepEqual(
        loadGallerySavedViews().map(v => v.id),
        ['new']
      );
    });

    it('preserves an explicitly provided createdAt', () => {
      stored = null;
      const result = upsertGallerySavedView(view('new', { createdAt: 12345 }));
      assert.equal(result.createdAt, 12345);
    });

    it('replaces an existing view with the same id, moving it to the front', () => {
      stored = [view('a', { createdAt: 1 }), view('b', { createdAt: 2 })];
      const result = upsertGallerySavedView(view('a', { name: 'renamed', createdAt: 1 }));
      const saved = loadGallerySavedViews();
      assert.equal(saved.length, 2);
      assert.equal(saved[0]?.id, 'a');
      assert.equal(saved[0]?.name, 'renamed');
      assert.equal(saved[1]?.id, 'b');
      assert.equal(result.name, 'renamed');
    });
  });

  describe('deleteGallerySavedView', () => {
    it('removes the view with the matching id and leaves the rest', () => {
      stored = [view('a'), view('b'), view('c')];
      deleteGallerySavedView('b');
      assert.deepEqual(
        loadGallerySavedViews().map(v => v.id),
        ['a', 'c']
      );
    });

    it('is a no-op when the id is not present', () => {
      stored = [view('a')];
      deleteGallerySavedView('missing');
      assert.deepEqual(
        loadGallerySavedViews().map(v => v.id),
        ['a']
      );
    });
  });
});
