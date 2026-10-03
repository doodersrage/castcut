import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterGalleryEntriesByLook,
  galleryEntryLookKey,
  galleryLookChips,
  GALLERY_NO_LOOK,
} from './gallery-look-filter';

const LOOKS = [
  { id: 'look-beach', label: 'Beach' },
  { id: 'look-studio', label: 'Look 1' },
];
const KNOWN = new Set(LOOKS.map(look => look.id));
const ENTRIES = [
  { id: 'a', lookId: 'look-beach' },
  { id: 'b', lookId: 'look-studio' },
  { id: 'c', lookId: 'look-beach' },
  { id: 'd' },
  { id: 'e', lookId: 'look-removed' },
];

describe('gallery-look-filter', () => {
  it('a still with no look, or a removed one, is in No look', () => {
    assert.equal(galleryEntryLookKey({ lookId: 'look-beach' }, KNOWN), 'look-beach');
    assert.equal(galleryEntryLookKey({}, KNOWN), GALLERY_NO_LOOK);
    assert.equal(galleryEntryLookKey({ lookId: 'look-removed' }, KNOWN), GALLERY_NO_LOOK);
  });

  it('narrows to one look, or to No look; no pick keeps all', () => {
    assert.deepEqual(
      filterGalleryEntriesByLook(ENTRIES, 'look-beach', KNOWN).map(entry => entry.id),
      ['a', 'c']
    );
    assert.deepEqual(
      filterGalleryEntriesByLook(ENTRIES, GALLERY_NO_LOOK, KNOWN).map(entry => entry.id),
      ['d', 'e']
    );
    assert.equal(filterGalleryEntriesByLook(ENTRIES, undefined, KNOWN).length, 5);
  });

  it('chips follow the look order with counts, then No look', () => {
    assert.deepEqual(galleryLookChips(LOOKS, ENTRIES), [
      { id: 'look-beach', label: 'Beach', count: 2 },
      { id: 'look-studio', label: 'Look 1', count: 1 },
      { id: GALLERY_NO_LOOK, label: 'No look', count: 2 },
    ]);
  });

  it('a look with no stills has no chip unless it is the pick', () => {
    const only = [{ id: 'a', lookId: 'look-beach' }];
    assert.deepEqual(
      galleryLookChips(LOOKS, only).map(chip => chip.id),
      ['look-beach']
    );
    assert.deepEqual(
      galleryLookChips(LOOKS, only, 'look-studio').map(chip => [chip.id, chip.count]),
      [
        ['look-beach', 1],
        ['look-studio', 0],
      ]
    );
  });
});
