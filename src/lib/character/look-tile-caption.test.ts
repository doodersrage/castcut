import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lookTileOutfitCaption } from './plate-thumb';

describe('lookTileOutfitCaption', () => {
  it('shows the garment at the end of a long catalog name', () => {
    assert.equal(lookTileOutfitCaption('boxy chocolate nun habit'), 'nun habit');
    assert.equal(lookTileOutfitCaption('oversized sunflower yellow jumpsuit'), 'yellow jumpsuit');
  });

  it('keeps a short name whole and drops a clipped ellipsis', () => {
    assert.equal(lookTileOutfitCaption('red dress'), 'red dress');
    assert.equal(lookTileOutfitCaption('a long linen summer dress with…'), 'summer dress');
    assert.equal(lookTileOutfitCaption(undefined), undefined);
  });
});
