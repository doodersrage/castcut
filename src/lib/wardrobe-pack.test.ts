import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildWardrobePackZip, parseWardrobePack, wardrobePackDuplicate } from './wardrobe-pack';

const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, seed + 1]);

describe('wardrobe packs', () => {
  it('round-trips clothing and shoes with their words and pictures', async () => {
    const blob = buildWardrobePackZip({
      clothing: [{ label: 'Burgundy dress', text: 'A burgundy mini dress with lacing', image: png(1) }],
      shoes: [{ label: 'Wedges', text: 'brown woven wedge sandals', image: png(7) }],
    });
    const pack = await parseWardrobePack(await blob.arrayBuffer());
    assert.equal(pack.clothing.length, 1);
    assert.equal(pack.clothing[0]!.description, 'A burgundy mini dress with lacing');
    assert.deepEqual([...pack.clothing[0]!.image], [...png(1)]);
    assert.equal(pack.shoes[0]!.words, 'brown woven wedge sandals');
    assert.match(pack.shoes[0]!.name, /^shoes\/01\.png$/);
  });

  it('refuses files that are not packs, and spots what is already saved', async () => {
    await assert.rejects(parseWardrobePack(new ArrayBuffer(8)), /Not a wardrobe pack/);
    const empty = buildWardrobePackZip({ clothing: [], shoes: [] });
    await assert.rejects(parseWardrobePack(await empty.arrayBuffer()), /no clothing or shoes/);
    const saved = [{ label: 'Wedges', text: 'Brown woven  wedge sandals' }];
    assert.equal(wardrobePackDuplicate('brown woven wedge sandals', 'x', saved), true);
    assert.equal(wardrobePackDuplicate('white sneakers', 'x', saved), false);
  });
});
