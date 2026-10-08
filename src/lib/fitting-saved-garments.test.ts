import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import {
  FITTING_SAVED_GARMENTS_LIMIT,
  FITTING_SAVED_GARMENTS_STORAGE_KEY,
  findSavedFittingGarmentByFilename,
  labelForSavedFittingGarment,
  loadSavedFittingGarments,
  removeSavedFittingGarment,
  replaceSavedFittingGarments,
  saveFittingGarment,
  updateSavedFittingGarmentDescription,
} from './fitting-saved-garments';

describe('fitting-saved-garments', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const store = new Map<string, string>();
    const localStorage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage,
        dispatchEvent: () => true,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    resetBrowserStorageCache();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow,
    });
    resetBrowserStorageCache();
  });

  it('labelForSavedFittingGarment truncates long vision text', () => {
    assert.equal(labelForSavedFittingGarment(null), 'Saved clothing');
    assert.equal(labelForSavedFittingGarment('navy blazer'), 'navy blazer');
    const long =
      'a long flowing description of a crimson silk evening gown with lace trim and matching heels';
    const label = labelForSavedFittingGarment(long);
    assert.ok(label.endsWith('…'));
    assert.ok(label.length <= 49);
  });

  it('saveFittingGarment persists via browser KV and dedupes by filename', () => {
    const first = saveFittingGarment({
      imageFilename: 'coat.png',
      imageUrl: '/api/comfyui/view?filename=coat.png',
      description: 'camel overcoat',
    });
    assert.equal(first.label, 'camel overcoat');
    assert.equal(loadSavedFittingGarments().length, 1);

    const second = saveFittingGarment({
      imageFilename: 'coat.png',
      description: 'camel wool overcoat',
    });
    assert.equal(second.id, first.id);
    assert.equal(loadSavedFittingGarments().length, 1);
    assert.equal(loadSavedFittingGarments()[0]?.description, 'camel wool overcoat');
    assert.equal(
      findSavedFittingGarmentByFilename('coat.png')?.imageUrl,
      '/api/comfyui/view?filename=coat.png'
    );
  });

  it('saveFittingGarment keeps newest first and keeps them all', () => {
    assert.equal(FITTING_SAVED_GARMENTS_LIMIT, Number.POSITIVE_INFINITY);
    for (let i = 0; i < 40; i += 1) {
      saveFittingGarment({ imageFilename: `g-${i}.png`, description: `garment ${i}` });
    }
    const all = loadSavedFittingGarments();
    assert.equal(all.length, 40);
    assert.equal(all[0]?.imageFilename, 'g-39.png');
  });

  it('removeSavedFittingGarment drops by id', () => {
    const saved = saveFittingGarment({ imageFilename: 'dress.png', description: 'red dress' });
    removeSavedFittingGarment(saved.id);
    assert.deepEqual(loadSavedFittingGarments(), []);
  });

  it('updateSavedFittingGarmentDescription fills a blank saved photo in place', () => {
    saveFittingGarment({ imageFilename: 'tee.png' });
    saveFittingGarment({ imageFilename: 'named.png', label: 'Gym top' });
    assert.equal(updateSavedFittingGarmentDescription('tee.png', ' pink ribbed crop tee '), true);
    assert.equal(updateSavedFittingGarmentDescription('named.png', 'grey sports bra'), true);
    const [named, tee] = loadSavedFittingGarments();
    assert.equal(tee?.description, 'pink ribbed crop tee');
    assert.equal(tee?.label, 'pink ribbed crop tee');
    // A hand-set label and the strip order stay put.
    assert.equal(named?.label, 'Gym top');
    assert.equal(named?.description, 'grey sports bra');
    assert.equal(updateSavedFittingGarmentDescription('missing.png', 'x'), false);
    assert.equal(updateSavedFittingGarmentDescription('tee.png', '  '), false);
    assert.equal(findSavedFittingGarmentByFilename('tee.png')?.description, 'pink ribbed crop tee');
  });

  it('replaceSavedFittingGarments takes a synced list, dropping junk and duplicates', () => {
    saveFittingGarment({ imageFilename: 'local.png' });
    const kept = replaceSavedFittingGarments([
      { id: 'a', label: 'Tee', imageFilename: 'tee.png', description: 'pink tee', savedAt: 2 },
      { id: 'b', label: 'Tee again', imageFilename: 'tee.png', savedAt: 1 },
      { label: 'no file' },
      'junk',
    ]);
    assert.deepEqual(
      kept.map(entry => entry.imageFilename),
      ['tee.png']
    );
    assert.deepEqual(
      loadSavedFittingGarments().map(entry => entry.description),
      ['pink tee']
    );
    // Not a list: leave what's there.
    replaceSavedFittingGarments({ nope: true });
    assert.equal(loadSavedFittingGarments().length, 1);
  });

  it('loadSavedFittingGarments returns [] for malformed storage', () => {
    window.localStorage.setItem(FITTING_SAVED_GARMENTS_STORAGE_KEY, '{not-json');
    resetBrowserStorageCache();
    assert.deepEqual(loadSavedFittingGarments(), []);
    window.localStorage.setItem(FITTING_SAVED_GARMENTS_STORAGE_KEY, JSON.stringify({ no: 'array' }));
    resetBrowserStorageCache();
    assert.deepEqual(loadSavedFittingGarments(), []);
  });

  it('survives a simulated boot migration off raw localStorage into the KV cache', () => {
    saveFittingGarment({
      imageFilename: 'packshot.png',
      description: 'ready packshot jacket',
    });
    assert.equal(loadSavedFittingGarments().length, 1);
    // Boot migrates arbitrary LS keys into IDB and deletes the LS copy — browser KV
    // cache must still serve the list (writeBrowserValue path).
    window.localStorage.removeItem(FITTING_SAVED_GARMENTS_STORAGE_KEY);
    assert.equal(loadSavedFittingGarments()[0]?.imageFilename, 'packshot.png');
  });
});
