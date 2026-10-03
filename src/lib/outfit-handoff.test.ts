import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  keptLookOutfitFromTryOn,
  lookOutfitSwitchPatch,
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

  it('a kept try-on is the look’s outfit: a kit with the shoes, or the photo with the shoes', () => {
    const picks = {
      customGarmentImageFilename: 'dress.png',
      customGarmentDescription: 'a red dress',
      footwear: 'black heels',
      footwearImageFilename: 'heels.png',
    };
    assert.deepEqual(
      keptLookOutfitFromTryOn(
        { wardrobeId: 'kit-a', galleryEntryId: 'g-1', dressPlateKey: 'k-1' },
        picks
      ),
      {
        entryId: 'g-1',
        dressPlateKey: 'k-1',
        wardrobeId: 'kit-a',
        footwear: 'black heels',
        footwearImageFilename: 'heels.png',
      }
    );
    assert.deepEqual(
      keptLookOutfitFromTryOn({ wardrobeId: 'custom-garment', galleryEntryId: 'g-2' }, picks),
      { entryId: 'g-2', ...picks }
    );
  });

  it('switching looks: the new look’s outfit goes in; without one, only the old look’s comes out', () => {
    const photoLook = {
      entryId: 'g-2',
      customGarmentImageFilename: 'dress.png',
      customGarmentDescription: 'a red dress',
      footwear: 'black heels',
    };
    const kitLook = { entryId: 'g-1', wardrobeId: 'kit-a', footwear: 'white sneakers' };
    // To the photo look.
    const toPhoto = lookOutfitSwitchPatch({}, kitLook, photoLook);
    assert.equal(toPhoto?.customGarmentImageFilename, 'dress.png');
    assert.equal(toPhoto?.footwear, 'black heels');
    // To the kit look: the photo goes, its shoes come.
    const toKit = lookOutfitSwitchPatch({ ...photoLook }, photoLook, kitLook);
    assert.ok(toKit && 'customGarmentImageFilename' in toKit);
    assert.equal(toKit?.customGarmentImageFilename, undefined);
    assert.equal(toKit?.footwear, 'white sneakers');
    // Already wearing it: nothing to write.
    assert.equal(lookOutfitSwitchPatch({ ...photoLook }, null, photoLook), null);
    // To a look with no kept outfit: the previous look's photo and shoes go...
    const cleared = lookOutfitSwitchPatch({ ...photoLook }, photoLook, undefined);
    assert.equal(cleared?.customGarmentImageFilename, undefined);
    assert.equal(cleared?.footwear, undefined);
    // ...but a photo or shoes picked since stay.
    const kept = lookOutfitSwitchPatch(
      { customGarmentImageFilename: 'other.png', footwear: 'black heels' },
      photoLook,
      undefined
    );
    assert.equal(kept?.customGarmentImageFilename, 'other.png');
    assert.equal(kept?.footwear, undefined);
    assert.equal(
      lookOutfitSwitchPatch({ customGarmentImageFilename: 'other.png' }, photoLook, undefined),
      null
    );
    assert.equal(lookOutfitSwitchPatch({}, null, undefined), null);
  });
});
