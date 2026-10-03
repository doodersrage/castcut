import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  outfitHandoffPatch,
  outfitPicksSignature,
  realKitId,
  slotsForOutfitPhoto,
} from './outfit-handoff';

describe('Outfit hands its picks to Day and Story', () => {
  it('copies the clothing photo and shoes, clearing what Outfit has not set', () => {
    const patch = outfitHandoffPatch({
      customGarmentImageFilename: 'dress.png',
      customGarmentDescription: 'a red dress',
      footwear: 'black heels',
    });
    assert.equal(patch.customGarmentImageFilename, 'dress.png');
    assert.equal(patch.footwear, 'black heels');
    assert.ok('footwearImageFilename' in patch);
    assert.equal(patch.footwearImageFilename, undefined);
  });

  it('only a change counts', () => {
    assert.equal(
      outfitPicksSignature({ footwear: 'black heels', customGarmentDescription: ' ' }),
      outfitPicksSignature({ footwear: 'black heels' })
    );
  });

  it('a photo replaces kits Day picked itself, never the player’s, and the placeholder is no kit', () => {
    const slots = slotsForOutfitPhoto(
      [
        { id: 'morning', label: 'Morning', wardrobeId: 'kit-a', wardrobeAuto: true },
        { id: 'afternoon', label: 'Afternoon', wardrobeId: 'kit-b' },
        { id: 'evening', label: 'Evening', wardrobeId: 'custom-garment' },
      ] as never,
      true
    );
    assert.equal(slots[0]?.wardrobeId, undefined);
    assert.equal(slots[1]?.wardrobeId, 'kit-b');
    assert.equal(slots[2]?.wardrobeId, undefined);
    assert.equal(realKitId('custom-garment'), '');
    assert.equal(realKitId(' kit-a '), 'kit-a');
  });
});
