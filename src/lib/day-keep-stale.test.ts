import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayKeepOutfitStale } from './day-dress-plate';

const kept = {
  customGarmentImageFilename: 'garment-blue-tank.png',
  customGarmentImageUrl: '/api/comfyui/view?filename=garment-blue-tank.png',
  footwear: 'light blue cork wedge sandals',
};

describe('a Keep kept in another outfit is stale', () => {
  it('a new clothing photo makes the Keep stale; the same one does not', () => {
    assert.equal(dayKeepOutfitStale(kept, { customGarmentImageFilename: 'garment-green-velvet.png' }), true);
    assert.equal(
      dayKeepOutfitStale(kept, { customGarmentImageFilename: 'garment-blue-tank.png', footwear: 'light blue cork wedge sandals' }),
      false
    );
  });

  it('a picked kit other than the kept one, or new shoes, is stale', () => {
    assert.equal(dayKeepOutfitStale({ wardrobeId: 'kit-a' }, { kitId: 'kit-b' }), true);
    assert.equal(dayKeepOutfitStale({ wardrobeId: 'kit-a' }, { kitId: 'kit-a' }), false);
    assert.equal(dayKeepOutfitStale(kept, { customGarmentImageFilename: 'garment-blue-tank.png', footwear: 'black heels' }), true);
  });

  it('nothing picked: the Keep is the outfit', () => {
    assert.equal(dayKeepOutfitStale(kept, {}), false);
    assert.equal(dayKeepOutfitStale(undefined, {}), false);
  });

  it('a Keep with no record of its outfit is stale once something is picked', () => {
    assert.equal(dayKeepOutfitStale(undefined, { kitId: 'kit-a' }), true);
  });
});
