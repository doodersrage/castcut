import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeCastWardrobe, withWornOutfit, wornOutfitKey } from './cast-wardrobe';

const MIN = 60 * 1000;

describe('cast wardrobe', () => {
  it('keys an outfit by its kit, else its clothing photo', () => {
    assert.equal(wornOutfitKey({ wardrobeId: 'kit-denim' }), 'kit-denim');
    assert.equal(wornOutfitKey({ customGarmentImageFilename: 'dress.png' }), 'dress.png');
    assert.equal(wornOutfitKey({ footwear: 'sneakers' }), '');
  });

  it('records a new outfit, skips the same one within half an hour, then counts it again', () => {
    const first = withWornOutfit(undefined, {
      outfit: { wardrobeId: 'kit-denim' },
      label: 'Denim day',
      promptId: 'p1',
      now: 0,
    });
    assert.equal(first?.length, 1);
    assert.equal(
      withWornOutfit(first!, { outfit: { wardrobeId: 'kit-denim' }, label: 'Denim day', promptId: 'p2', now: 10 * MIN }),
      null
    );
    const later = withWornOutfit(first!, {
      outfit: { wardrobeId: 'kit-denim' },
      label: 'Denim day',
      promptId: 'p3',
      now: 40 * MIN,
    })!;
    assert.equal(later[0]!.count, 2);
    assert.deepEqual(later[0]!.promptIds, ['p3', 'p1']);
  });

  it('puts the latest outfit first and keeps one entry per outfit', () => {
    let list = withWornOutfit(undefined, { outfit: { wardrobeId: 'a' }, label: 'A', now: 0 })!;
    list = withWornOutfit(list, { outfit: { customGarmentImageFilename: 'b.png' }, label: 'B', now: MIN })!;
    list = withWornOutfit(list, { outfit: { wardrobeId: 'a' }, label: 'A', now: 60 * MIN })!;
    assert.deepEqual(
      list.map(item => item.key),
      ['a', 'b.png']
    );
    assert.equal(normalizeCastWardrobe([...list, { ...list[0]!, lastAt: 1 }])?.length, 2);
  });
});
