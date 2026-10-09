import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import {
  DRESS_PLATE_OUTFIT_LINE,
  storyDressPlateApplies,
  storyDressPlatePrompt,
  stripOutfitLeadLines,
} from './day-dress-plate';
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

  it('a plate marked checked before versions counts as version 1, so newer rules look again', () => {
    replaceDressPlates([
      { key: 'old', filename: 'old.png', at: 1, shoesChecked: true as unknown as number },
      { key: 'new', filename: 'new.png', at: 2, shoesChecked: 2 },
    ]);
    assert.equal(findDressPlate('old')?.shoesChecked, 1);
    assert.equal(findDressPlate('new')?.shoesChecked, 2);
  });

  it('a saved plate keeps its engine and is found again (each scene re-rendered it)', () => {
    const now = Date.now();
    saveDressPlate({ key: 'k', filename: 'p.png', at: now, engine: 'qwen-image-edit-2511-lightning-8' });
    assert.equal(loadDressPlates()[0]?.engine, 'qwen-image-edit-2511-lightning-8');
    assert.equal(findDressPlate('k')?.filename, 'p.png');
    // Saved before the store kept `engine`: unmarked, but after the Klein rollback.
    replaceDressPlates([{ key: 'u', filename: 'u.png', at: now }]);
    assert.equal(findDressPlate('u')?.filename, 'u.png');
  });

  it('Klein plates are still made anew: marked ones, and unmarked ones from the Klein window', () => {
    replaceDressPlates([
      { key: 'marked', filename: 'k.png', at: Date.now(), engine: 'flux-2-klein-9b-distilled' },
      // 2026-10-08 15:00 EDT: Klein was the plate engine.
      { key: 'window', filename: 'w.png', at: Date.UTC(2026, 9, 8, 19, 0) },
      // 2026-10-07: before Klein.
      { key: 'before', filename: 'b.png', at: Date.UTC(2026, 9, 7, 12, 0) },
    ]);
    assert.equal(findDressPlate('marked'), null);
    assert.equal(findDressPlate('window'), null);
    assert.equal(findDressPlate('before')?.filename, 'b.png');
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

describe('Story prompts from a dressed plate', () => {
  it('keeps the plate outfit and points the pose map at the second image', () => {
    const out = storyDressPlatePrompt(
      'new environment, replace the reference clothing with the beat outfit, a barista finds a door.\nImage 2 is a clothing-only packshot — apply that exact outfit. Image 3 is an OpenPose map. Pose the people to match Image 3.'
    );
    assert.match(out, /keep the exact outfit and shoes she wears in the reference photo/);
    assert.doesNotMatch(out, /packshot|Image 3|replace the reference clothing/);
    assert.match(out, /Image 2 is an OpenPose map\. Pose the people to match Image 2\./);
  });

  it('a retry drops the stored outfit and footwear lines', () => {
    const stored = [
      DRESS_PLATE_OUTFIT_LINE,
      'FOOTWEAR (mandatory): on her feet she wears white sneakers — exactly these, on both feet.',
      'a barista finds a door, cozy light',
    ].join('\n');
    assert.equal(stripOutfitLeadLines(stored), 'a barista finds a door, cozy light');
    // Also when a finalizer joined them onto one line.
    assert.equal(
      stripOutfitLeadLines(`Edit Image 1: ${DRESS_PLATE_OUTFIT_LINE} a barista finds a door`),
      'Edit Image 1: a barista finds a door'
    );
    assert.equal(stripOutfitLeadLines('plain prompt'), 'plain prompt');
  });
});

