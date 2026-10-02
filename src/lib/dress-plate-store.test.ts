import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import { storyDressPlateApplies, DRESS_PLATE_OUTFIT_LINE } from './day-dress-plate';
import {
  clearDressPlates,
  findDressPlate,
  loadDressPlates,
  removeDressPlate,
  replaceDressPlates,
  saveDressPlate,
} from './dress-plate-store';

describe('shared dressed-plate store', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage: {
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
        },
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

  it('one plate per selection, found by any tool, removable', () => {
    saveDressPlate({ key: 'a', filename: 'one.png', at: 1 });
    saveDressPlate({ key: 'b', filename: 'two.png', imageUrl: '/view?two', at: 2 });
    saveDressPlate({ key: 'a', filename: 'three.png', at: 3 });
    assert.deepEqual(
      loadDressPlates().map(entry => entry.filename),
      ['three.png', 'two.png']
    );
    assert.equal(findDressPlate('b')?.imageUrl, '/view?two');
    removeDressPlate('a');
    assert.equal(findDressPlate('a'), null);
    clearDressPlates();
    assert.deepEqual(loadDressPlates(), []);
  });

  it('takes a synced list without junk and ignores a non-list', () => {
    const kept = replaceDressPlates([
      { key: 'a', filename: 'one.png', at: 1 },
      { key: 'a', filename: 'dup.png', at: 2 },
      { key: '', filename: 'nokey.png' },
      { key: 'c' },
      null,
    ]);
    assert.deepEqual(
      kept.map(entry => entry.filename),
      ['one.png']
    );
    replaceDressPlates({ nope: true });
    assert.equal(loadDressPlates().length, 1);
  });
});

describe('Story dress plate', () => {
  const story = {
    model: 'qwen-image-edit-2511-lightning-8',
    adult: false,
    photoMode: true,
    hasPlate: true,
    clothingPicked: true,
    footwearPicked: false,
  };

  it('applies to clothed photo stories with clothing or shoes picked', () => {
    assert.equal(storyDressPlateApplies(story), true);
    assert.equal(
      storyDressPlateApplies({ ...story, clothingPicked: false, footwearPicked: true }),
      true
    );
    assert.equal(storyDressPlateApplies({ ...story, clothingPicked: false }), false);
    assert.equal(storyDressPlateApplies({ ...story, adult: true }), false);
    assert.equal(storyDressPlateApplies({ ...story, photoMode: false }), false);
    assert.equal(storyDressPlateApplies({ ...story, hasPlate: false }), false);
    assert.equal(storyDressPlateApplies({ ...story, omitGarment: true }), false);
    assert.match(DRESS_PLATE_OUTFIT_LINE, /the outfit and the shoes she has on in Image 1/);
  });
});
