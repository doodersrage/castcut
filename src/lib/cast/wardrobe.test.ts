import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeCastWardrobe, withWornOutfit, wornOutfitKey } from './wardrobe';

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

describe('wardrobeFromGallery', async () => {
  const { wardrobeFromGallery } = await import('./wardrobe');
  const still = (prompt: string, second: string, at: number, promptId: string) => ({
    characterId: 'c',
    tool: 'image-prompt',
    prompt,
    promptId,
    completedAt: at,
    queueParams: { inputImageFilenames: ['plate.png', second, 'guide.png'] },
  });
  it('finds outfits in earlier Day stills: a garment photo kept, a dressed plate as words', () => {
    const list = wardrobeFromGallery(
      [
        still('OUTFIT (mandatory): she wears a one-piece swimsuit — exactly', 'fitting-garment-packshot-1.png', 1, 'a'),
        still('OUTFIT (mandatory): she wears a burgundy mini dress — exactly', 'day-dress-plate-2.png', 2, 'b'),
        still('OUTFIT (mandatory): she wears tennis sportswear and court shoes — exactly', '', 3, 'c'),
        still('no outfit line here', '', 4, 'd'),
        { ...still('OUTFIT (mandatory): she wears a red coat — x', '', 5, 'e'), characterId: 'other' },
      ],
      'c'
    )!;
    assert.deepEqual(
      list.map(item => [item.key, item.outfit.customGarmentImageFilename ?? null]),
      [
        ['words:a burgundy mini dress', null],
        ['fitting-garment-packshot-1.png', 'fitting-garment-packshot-1.png'],
      ]
    );
  });
  it('changes nothing when there is nothing new', () => {
    assert.equal(wardrobeFromGallery([], 'c'), null);
  });
});

describe('runway clip direction', async () => {
  const { runwayClipPrompt } = await import('./wardrobe');
  it('turns her around, and him for a man lead', () => {
    assert.match(runwayClipPrompt(), /^She turns slowly in place/);
    assert.match(runwayClipPrompt(true), /^He turns slowly in place.*his whole body/);
  });
});
