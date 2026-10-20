import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery';
import { filterComfyGalleryEntries } from './comfyui-gallery';
import {
  GALLERY_CUSTOM_GROUP_MAX_LENGTH,
  GALLERY_UNGROUPED_FILTER,
  deleteGalleryCustomGroupEntries,
  galleryEntryMatchesCustomGroup,
  normalizeGalleryCustomGroupName,
  renameGalleryCustomGroupEntries,
  resolveGalleryCustomGroupName,
  uniqueGalleryCustomGroups,
} from './custom-groups';

function entry(
  partial: Partial<ComfyGalleryEntry> & Pick<ComfyGalleryEntry, 'id'>
): ComfyGalleryEntry {
  return {
    promptId: partial.promptId ?? partial.id,
    prompt: 'a test scene',
    comfyUrl: 'http://127.0.0.1:8188',
    queuedAt: 1,
    status: 'completed',
    images: [{ filename: 'a.png', subfolder: '', type: 'output' }],
    ...partial,
  };
}

describe('gallery custom groups', () => {
  it('normalizes whitespace and caps length', () => {
    assert.equal(normalizeGalleryCustomGroupName('  Red   Dress  '), 'Red Dress');
    assert.equal(normalizeGalleryCustomGroupName('   '), '');
    assert.equal(
      normalizeGalleryCustomGroupName('x'.repeat(GALLERY_CUSTOM_GROUP_MAX_LENGTH + 12)).length,
      GALLERY_CUSTOM_GROUP_MAX_LENGTH
    );
  });

  it('reuses existing group casing on case-insensitive match', () => {
    assert.equal(resolveGalleryCustomGroupName('red dress', ['Red Dress', 'Look B']), 'Red Dress');
    assert.equal(resolveGalleryCustomGroupName('Look C', ['Red Dress']), 'Look C');
    assert.equal(resolveGalleryCustomGroupName('  ', ['Red Dress']), undefined);
    assert.equal(resolveGalleryCustomGroupName(GALLERY_UNGROUPED_FILTER, ['Red Dress']), undefined);
  });

  it('lists unique group names sorted', () => {
    assert.deepEqual(
      uniqueGalleryCustomGroups([
        entry({ id: 'a', customGroup: 'Look B' }),
        entry({ id: 'b' }),
        entry({ id: 'c', customGroup: '  Look B  ' }),
        entry({ id: 'd', customGroup: 'Look A' }),
      ]),
      ['Look A', 'Look B']
    );
  });

  it('matches named groups and ungrouped filter', () => {
    const grouped = entry({ id: 'a', customGroup: 'Red Dress' });
    const loose = entry({ id: 'b' });
    assert.equal(galleryEntryMatchesCustomGroup(grouped, undefined), true);
    assert.equal(galleryEntryMatchesCustomGroup(grouped, 'red dress'), true);
    assert.equal(galleryEntryMatchesCustomGroup(grouped, 'Look B'), false);
    assert.equal(galleryEntryMatchesCustomGroup(grouped, GALLERY_UNGROUPED_FILTER), false);
    assert.equal(galleryEntryMatchesCustomGroup(loose, GALLERY_UNGROUPED_FILTER), true);
  });

  it('filters gallery entries by custom group', () => {
    const entries = [
      entry({ id: 'a', customGroup: 'Look A' }),
      entry({ id: 'b', customGroup: 'Look B' }),
      entry({ id: 'c' }),
    ];
    assert.deepEqual(
      filterComfyGalleryEntries(entries, { customGroup: 'look a' }).map(item => item.id),
      ['a']
    );
    assert.deepEqual(
      filterComfyGalleryEntries(entries, { customGroup: GALLERY_UNGROUPED_FILTER }).map(
        item => item.id
      ),
      ['c']
    );
  });

  it('renames and deletes custom groups across entries', () => {
    const start = [
      entry({ id: 'a', customGroup: 'Look A' }),
      entry({ id: 'b', customGroup: 'Look A' }),
      entry({ id: 'c', customGroup: 'Look B' }),
    ];
    const renamed = renameGalleryCustomGroupEntries(start, 'look a', 'Red Dress');
    assert.equal(renamed.changed, 2);
    assert.deepEqual(
      renamed.entries.map(item => item.customGroup),
      ['Red Dress', 'Red Dress', 'Look B']
    );
    const deleted = deleteGalleryCustomGroupEntries(renamed.entries, 'Red Dress');
    assert.equal(deleted.changed, 2);
    assert.equal(deleted.entries[0]?.customGroup, undefined);
    assert.equal(deleted.entries[2]?.customGroup, 'Look B');
  });
});
