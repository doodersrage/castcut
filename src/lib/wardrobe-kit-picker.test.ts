import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWardrobeKitStrip,
  filterWardrobeKitsByQuery,
} from './wardrobe-kit-picker';

describe('wardrobe-kit-picker', () => {
  const kits = Array.from({ length: 20 }, (_, index) => ({
    id: `kit-${index}`,
    label: index === 7 ? 'Cobalt monk robes' : `Kit ${index}`,
    group: index % 2 === 0 ? 'Full outfits' : 'Tops',
  }));

  it('filterWardrobeKitsByQuery matches label tokens', () => {
    const hits = filterWardrobeKitsByQuery(kits, 'cobalt monk');
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.id, 'kit-7');
  });

  it('filterWardrobeKitsByQuery returns all kits for blank query', () => {
    assert.equal(filterWardrobeKitsByQuery(kits, '  ').length, kits.length);
  });

  it('buildWardrobeKitStrip keeps selection and neighbors', () => {
    const strip = buildWardrobeKitStrip(kits, 'kit-10', ['kit-2'], {
      neighborRadius: 2,
      max: 12,
    });
    assert.ok(strip.some(kit => kit.id === 'kit-10'));
    assert.ok(strip.some(kit => kit.id === 'kit-8'));
    assert.ok(strip.some(kit => kit.id === 'kit-12'));
    assert.ok(strip.some(kit => kit.id === 'kit-2'));
    assert.ok(strip.length <= 12);
    const ranks = strip.map(kit => Number(kit.id.replace('kit-', '')));
    assert.deepEqual(
      ranks,
      [...ranks].sort((left, right) => left - right)
    );
  });
});
