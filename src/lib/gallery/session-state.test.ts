import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import {
  galleryBrowseScope,
  galleryUrlHasBrowseState,
  galleryNavHref,
  loadGallerySessionState,
  patchGallerySessionPage,
  resolveAppNavLinkHref,
  saveGallerySessionState,
  clearGallerySessionState,
} from './session-state';

const SESSION_KEY = 'comfy-gallery-session-v1';
const store = new Map<string, string>();

function installLocalStorage(): void {
  const localStorage = {
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
    value: {
      localStorage,
      location: { pathname: '/gallery', search: '', href: 'http://localhost/gallery' },
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorage,
  });
}

afterEach(() => {
  store.clear();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('gallery-session-state', () => {
  it('normalizes gallery browse scopes', () => {
    assert.equal(galleryBrowseScope('/gallery'), '/gallery');
    assert.equal(galleryBrowseScope('/gallery/import'), '/gallery');
    assert.equal(galleryBrowseScope('/m/gallery'), '/m/gallery');
    assert.equal(galleryBrowseScope('/settings'), '/settings');
  });

  it('detects browse params in the URL', () => {
    assert.equal(galleryUrlHasBrowseState(new URLSearchParams()), false);
    assert.equal(galleryUrlHasBrowseState(new URLSearchParams('lightbox=1')), false);
    assert.equal(galleryUrlHasBrowseState(new URLSearchParams('sort=rating-desc')), true);
    assert.equal(galleryUrlHasBrowseState(new URLSearchParams('group=Look+A')), true);
    assert.equal(galleryUrlHasBrowseState(new URLSearchParams('page=3')), true);
  });

  it('round-trips session browse state per scope', () => {
    installLocalStorage();
    saveGallerySessionState('/gallery', {
      filter: { status: 'completed', customGroup: 'Look A' },
      sort: 'rating-desc',
      projectFilterId: 'proj-1',
      page: 3,
    });

    const loaded = loadGallerySessionState('/gallery');
    assert.deepEqual(loaded, {
      filter: { status: 'completed', customGroup: 'Look A' },
      sort: 'rating-desc',
      projectFilterId: 'proj-1',
      page: 3,
    });

    assert.equal(loadGallerySessionState('/m/gallery'), null);

    saveGallerySessionState('/m/gallery', {
      filter: { favoritesOnly: true },
      page: 2,
    });
    assert.equal(loadGallerySessionState('/m/gallery')?.page, 2);
    assert.equal(loadGallerySessionState('/gallery')?.page, 3);
  });

  it('persists to localStorage', () => {
    installLocalStorage();
    saveGallerySessionState('/gallery', { filter: { query: 'portrait' }, page: 1 });
    const raw = globalThis.localStorage.getItem(SESSION_KEY);
    assert.ok(raw?.includes('portrait'));
  });

  it('patches page without dropping other browse fields', () => {
    installLocalStorage();
    saveGallerySessionState('/gallery', {
      filter: { status: 'completed' },
      sort: 'rating-desc',
      page: 1,
    });
    patchGallerySessionPage('/gallery', 4);
    const loaded = loadGallerySessionState('/gallery');
    assert.equal(loaded?.page, 4);
    assert.equal(loaded?.sort, 'rating-desc');
    assert.equal(loaded?.filter?.status, 'completed');
  });

  it('builds nav href with cached page', () => {
    installLocalStorage();
    saveGallerySessionState('/gallery', { page: 5 });
    assert.equal(galleryNavHref('/gallery'), '/gallery?page=5');
    assert.equal(resolveAppNavLinkHref('/gallery'), '/gallery?page=5');
    assert.equal(resolveAppNavLinkHref('/gallery?review=1'), '/gallery?review=1');
    assert.equal(resolveAppNavLinkHref('/queue'), '/queue');
  });

  it('clears scoped or all session state', () => {
    installLocalStorage();
    saveGallerySessionState('/gallery', { page: 1 });
    saveGallerySessionState('/m/gallery', { page: 2 });
    clearGallerySessionState('/gallery');
    assert.equal(loadGallerySessionState('/gallery'), null);
    assert.equal(loadGallerySessionState('/m/gallery')?.page, 2);
    clearGallerySessionState();
    assert.equal(loadGallerySessionState('/m/gallery'), null);
  });
});
