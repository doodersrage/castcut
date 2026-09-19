import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CharacterRecord } from './character-os';
import {
  collectCastPlateMediaTokens,
  galleryEntryMatchesCastPlate,
  galleryMediaMatchTokens,
  partitionGalleryForArchivePurge,
} from './gallery-protected-ids';

function character(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: 'char-1',
    name: 'Rin',
    version: 1,
    updatedAt: 1,
    activeLookId: 'look-1',
    looks: [
      {
        id: 'look-1',
        name: 'Main',
        createdAt: 1,
        keeperEntryIds: ['keeper-1'],
        reference: {
          originalUrl: '/api/gallery/media/plate-src?variant=original',
          originalFilename: 'ComfyUI_plate_00001_.png',
          isolatedUrl: '/api/gallery/media/identity?id=cut',
          isolatedFilename: 'plate-cut.png',
          isolated: true,
          isolateSubject: true,
        },
      },
    ],
    ...overrides,
  };
}

function entry(
  id: string,
  overrides: Partial<{
    favorite: boolean;
    reviewRating: 1 | 2 | 3 | 4 | 5;
    filename: string;
  }> = {}
) {
  return {
    id,
    queuedAt: 1,
    favorite: overrides.favorite,
    reviewRating: overrides.reviewRating,
    images: overrides.filename
      ? [{ filename: overrides.filename, subfolder: '', type: 'output' }]
      : [],
  };
}

describe('galleryMediaMatchTokens', () => {
  it('extracts gallery media entry ids', () => {
    const tokens = galleryMediaMatchTokens('/api/gallery/media/abc123?variant=original');
    assert.ok(tokens.includes('id:abc123'));
  });

  it('extracts filename query params', () => {
    const tokens = galleryMediaMatchTokens(
      '/api/comfyui/view?filename=ComfyUI_00001_.png&type=output'
    );
    assert.ok(tokens.includes('comfyui_00001_.png'));
  });

  it('skips identity media as an entry id', () => {
    const tokens = galleryMediaMatchTokens('/api/gallery/media/identity?id=cut');
    assert.ok(!tokens.some(token => token.startsWith('id:identity')));
  });
});

describe('partitionGalleryForArchivePurge', () => {
  it('keeps favorites, ratings, look keepers, and cast look plates', () => {
    const characters = [character()];
    const plateTokens = collectCastPlateMediaTokens(characters);
    assert.ok(plateTokens.has('id:plate-src'));
    assert.ok(plateTokens.has('comfyui_plate_00001_.png'));
    assert.ok(plateTokens.has('id:keeper-1'));

    const entries = [
      entry('junk-1'),
      entry('fav-1', { favorite: true }),
      entry('rated-1', { reviewRating: 5 }),
      entry('keeper-1'),
      entry('plate-src', { filename: 'other.png' }),
      entry('by-filename', { filename: 'ComfyUI_plate_00001_.png' }),
      entry('junk-2'),
    ];

    assert.equal(galleryEntryMatchesCastPlate(entries[4]!, plateTokens), true);
    assert.equal(galleryEntryMatchesCastPlate(entries[5]!, plateTokens), true);

    const { protected: kept, purgeable } = partitionGalleryForArchivePurge(entries, characters);
    assert.deepEqual(
      kept.map(e => e.id).sort(),
      ['by-filename', 'fav-1', 'keeper-1', 'plate-src', 'rated-1']
    );
    assert.deepEqual(
      purgeable.map(e => e.id).sort(),
      ['junk-1', 'junk-2']
    );
  });

  it('purges everything when Cast has no plates and nothing is rated', () => {
    const bare: CharacterRecord = {
      id: 'char-2',
      name: 'Bare',
      version: 1,
      updatedAt: 1,
      activeLookId: 'look-1',
      looks: [{ id: 'look-1', name: 'Main', createdAt: 1 }],
    };
    const entries = [entry('a'), entry('b')];
    const { protected: kept, purgeable } = partitionGalleryForArchivePurge(entries, [bare]);
    assert.equal(kept.length, 0);
    assert.deepEqual(
      purgeable.map(e => e.id).sort(),
      ['a', 'b']
    );
  });
});
