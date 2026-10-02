import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import {
  SAVED_FOOTWEAR_LIMIT,
  findSavedFootwearByFilename,
  loadSavedFootwear,
  removeSavedFootwear,
  replaceSavedFootwear,
  saveFootwear,
  updateSavedFootwearWords,
} from './footwear-saved';

describe('footwear-saved', () => {
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

  it('saves a shoe photo with its words, newest first, one entry per file', () => {
    saveFootwear({ imageFilename: 'boots.png', imageUrl: '/view?boots', words: 'Brown suede boots.' });
    saveFootwear({ imageFilename: 'heels.png', words: 'red patent heels' });
    saveFootwear({ imageFilename: 'boots.png' });
    const all = loadSavedFootwear();
    assert.deepEqual(
      all.map(entry => entry.imageFilename),
      ['boots.png', 'heels.png']
    );
    // Re-saving without words or a URL keeps what was known.
    assert.equal(all[0]?.words, 'Brown suede boots');
    assert.equal(all[0]?.label, 'Brown suede boots');
    assert.equal(all[0]?.imageUrl, '/view?boots');
    assert.equal(findSavedFootwearByFilename(' heels.png ')?.words, 'red patent heels');
    assert.throws(() => saveFootwear({ imageFilename: '  ' }), /upload a shoe photo/);
  });

  it('labels a photo with no words, and follows an edit to the words', () => {
    saveFootwear({ imageFilename: 'mystery.png' });
    assert.equal(loadSavedFootwear()[0]?.label, 'Saved shoes');
    assert.equal(updateSavedFootwearWords('mystery.png', 'white canvas plimsolls'), true);
    assert.equal(loadSavedFootwear()[0]?.label, 'white canvas plimsolls');
    assert.equal(updateSavedFootwearWords('unknown.png', 'anything'), false);
    assert.equal(updateSavedFootwearWords('mystery.png', '  '), false);
  });

  it('caps the list, removes by id, and takes a synced list without junk', () => {
    for (let index = 0; index < SAVED_FOOTWEAR_LIMIT + 3; index += 1) {
      saveFootwear({ imageFilename: `shoe-${index}.png`, words: `shoe ${index}` });
    }
    assert.equal(loadSavedFootwear().length, SAVED_FOOTWEAR_LIMIT);
    const first = loadSavedFootwear()[0]!;
    assert.equal(removeSavedFootwear(first.id).some(entry => entry.id === first.id), false);
    const kept = replaceSavedFootwear([
      { imageFilename: 'a.png', words: 'black loafers' },
      { imageFilename: 'a.png', words: 'duplicate' },
      { words: 'no file' },
      null,
    ]);
    assert.deepEqual(
      kept.map(entry => entry.words),
      ['black loafers']
    );
    // Not a list: the stored copy stays.
    replaceSavedFootwear({ nope: true });
    assert.equal(loadSavedFootwear().length, 1);
  });
});
