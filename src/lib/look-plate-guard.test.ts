import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lookPlateFaceUrl } from './likeness-measure-client';
import { lookPlateDrifted, referenceLook } from './look-plate-guard';
import { storyHintsWithLook } from './story-cast-lines';

describe('look plate guard', () => {
  it('judges against the Default look, else the oldest', () => {
    const cast = {
      id: 'c',
      name: 'Nora',
      looks: [
        { id: 'b', name: 'Beach', createdAt: 5 },
        { id: 'a', name: 'Default', createdAt: 9 },
      ],
    } as never;
    assert.equal(referenceLook(cast)?.id, 'a');
  });
  it('flags a low reading only while that plate is still on the look', () => {
    const look = { id: 'b', name: 'Beach', reference: { isolatedFilename: 'new.png' } } as never;
    const plate = lookPlateFaceUrl(look)!;
    const read = (face: number, at = plate) =>
      ({ ...(look as object), plateCheck: { plate: at, face, against: 'the Default look', at: 1 } }) as never;
    assert.equal(lookPlateDrifted(look), false);
    assert.equal(lookPlateDrifted(read(0.2)), true);
    assert.equal(lookPlateDrifted(read(0.8)), false);
    assert.equal(lookPlateDrifted(read(0.2, 'older-plate')), false);
  });
});

describe('Story hints follow the active look', () => {
  const cast = (active: string) =>
    ({
      id: 'c',
      name: 'Nora',
      activeLookId: active,
      looks: [
        { id: 'a', name: 'Default', lookNotes: 'lighting: neon spill' },
        { id: 'b', name: 'Beach', lookNotes: 'lighting: golden hour' },
      ],
    }) as never;
  it('swaps a look\'s notes for the active look\'s and keeps the player\'s own', () => {
    assert.equal(storyHintsWithLook('lighting: neon spill', cast('b')), 'lighting: golden hour');
    assert.equal(storyHintsWithLook('', cast('a')), 'lighting: neon spill');
    assert.equal(
      storyHintsWithLook('a rainy city', cast('b')),
      'a rainy city\nlighting: golden hour'
    );
    assert.equal(storyHintsWithLook('a rainy city', null), 'a rainy city');
  });
});
