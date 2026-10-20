import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from './catalog-ui';

describe('wardrobe-catalog-ui', () => {
  const options = [
    { value: '', label: 'Pick a kit…' },
    { value: 'top-1', label: 'Linen blouse', group: 'Tops' },
    { value: 'out-1', label: 'Linen set', group: 'Full outfits' },
    { value: 'coat-1', label: 'Trench coat', group: 'Outerwear' },
  ];

  it('normalizeWardrobeCategoryFilter accepts known categories', () => {
    assert.equal(normalizeWardrobeCategoryFilter('top'), 'top');
    assert.equal(normalizeWardrobeCategoryFilter('all'), 'all');
    assert.equal(normalizeWardrobeCategoryFilter('nope'), 'all');
  });

  it('filterWardrobeSelectOptions keeps empty value and matching group', () => {
    const tops = filterWardrobeSelectOptions(options, 'top');
    assert.equal(tops.length, 2);
    assert.equal(tops[1]?.value, 'top-1');
    const all = filterWardrobeSelectOptions(options, 'all');
    assert.equal(all.length, 4);
  });

  it('wardrobeCategoryFilterOptions includes all wardrobe categories', () => {
    const entries = wardrobeCategoryFilterOptions();
    assert.equal(entries[0]?.value, 'all');
    assert.ok(entries.some(entry => entry.value === 'outerwear' && /outerwear/i.test(entry.label)));
  });
});
