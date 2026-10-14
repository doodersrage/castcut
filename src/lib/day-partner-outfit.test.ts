import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { partnerOutfitWords } from './day-partner-outfit';

const cast = (keptOutfit: Record<string, string>) =>
  ({
    id: 'p',
    name: 'Tomas',
    activeLookId: 'l1',
    looks: [{ id: 'l1', name: 'Default', keptOutfit }],
  }) as never;

describe('partner outfit on two-person stills', () => {
  it('says a kept kit by name, with the shoes', () => {
    assert.equal(
      partnerOutfitWords(cast({ wardrobeId: 'k1', footwear: 'brown loafers' }), () => 'Navy linen suit'),
      'Navy linen suit, with brown loafers'
    );
  });
  it('says a kept clothing photo by its description', () => {
    const words = partnerOutfitWords(
      cast({ customGarmentImageFilename: 'x.png', customGarmentDescription: 'a white linen shirt and khaki chinos' }),
      () => ''
    );
    assert.match(words ?? '', /white linen shirt/);
  });
  it('is null with nothing kept', () => {
    assert.equal(partnerOutfitWords(cast({}), () => ''), null);
    assert.equal(partnerOutfitWords(null, () => ''), null);
  });
});
