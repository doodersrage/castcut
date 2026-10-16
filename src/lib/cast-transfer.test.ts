import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCastFile,
  castFileName,
  castOutfitPhotoRefs,
  parseCastFile,
  placeImportedCast,
  withOutfitPhotosMoved,
  withReferenceSheetsMoved,
} from './cast-transfer';

const nora = {
  id: 'char-nora',
  name: 'Nora',
  version: 1,
  updatedAt: 1,
  descriptor: 'a woman in her 30s',
  ipAdapter: { imageFilename: 'nora-cutout.png', imageUrl: '/api/gallery/media/cast-plate-nora' },
  looks: [
    {
      id: 'look-1',
      name: 'Default',
      createdAt: 1,
      descriptor: 'a woman in her 30s',
      ipAdapter: { imageFilename: 'nora-cutout.png' },
      keeperEntryIds: ['g-1'],
    },
  ],
} as never;
const story = {
  id: 'cast-char-nora',
  createdAt: 1,
  updatedAt: 2,
  title: 'Nora',
  snapshot: { activeSessionId: 'cast-char-nora', bio: { name: 'Nora', look: 'x', personality: 'y' } },
} as never;
const picture = { name: 'nora.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' };

describe('Cast files', () => {
  it('carry the Cast without this install\'s file names, and read back', () => {
    const file = buildCastFile({
      character: nora,
      picture,
      stories: [story],
      day: { slots: [{ id: 'morning', label: 'Morning', sceneHints: 'coffee' }], dayMood: 'everyday' } as never,
      now: 5,
    });
    assert.equal(file.character.ipAdapter, undefined);
    assert.equal(file.character.looks?.[0]?.ipAdapter, undefined);
    assert.equal(file.character.looks?.[0]?.keeperEntryIds, undefined);
    const read = parseCastFile(JSON.parse(JSON.stringify(file)));
    assert.ok(read);
    assert.equal(read.character.name, 'Nora');
    assert.equal(read.picture?.dataUrl, picture.dataUrl);
    assert.equal(read.stories.length, 1);
    assert.equal(read.day?.slots?.length, 1);
  });

  it('carry a picture for each other look, and drop ones for looks the record lacks', () => {
    const twoLooks = {
      ...(nora as object),
      activeLookId: 'look-1',
      looks: [
        ...(nora as { looks: object[] }).looks,
        { id: 'look-2', name: 'Beach', createdAt: 2, reference: { isolatedUrl: '/beach.png' } },
      ],
    } as never;
    const file = buildCastFile({
      character: twoLooks,
      picture,
      lookPictures: [
        { lookId: 'look-2', name: 'nora-beach.png', dataUrl: picture.dataUrl },
        { lookId: 'look-9', name: 'gone.png', dataUrl: picture.dataUrl },
        { lookId: 'look-2', name: 'bad.png', dataUrl: 'https://x/y.png' },
      ],
      stories: [],
    });
    const read = parseCastFile(JSON.parse(JSON.stringify(file)));
    assert.deepEqual(read?.lookPictures, [
      { lookId: 'look-2', name: 'nora-beach.png', dataUrl: picture.dataUrl },
    ]);
    assert.equal(read?.character.looks?.[1]?.reference, undefined);
  });

  it('carry the outfit photos (kept outfits and Wardrobe) and point them at the copies here', () => {
    const dress = { customGarmentImageFilename: 'dress.png', customGarmentImageUrl: '/view?dress.png' };
    const shoes = { footwear: 'heels', footwearImageFilename: 'heels.png', footwearImageUrl: '/view?heels.png' };
    const dressed = {
      ...(nora as object),
      looks: [{ ...(nora as { looks: object[] }).looks[0], keptOutfit: { ...dress, ...shoes } }],
      wardrobe: [
        { key: 'dress.png', label: 'Dress', outfit: { ...dress, ...shoes }, firstAt: 1, lastAt: 1, count: 1, promptIds: [] },
        { key: 'kit-1', label: 'Kit', outfit: { wardrobeId: 'kit-1' }, firstAt: 1, lastAt: 1, count: 1, promptIds: [] },
      ],
    } as never;
    assert.deepEqual(
      castOutfitPhotoRefs(dressed).map(ref => ref.key),
      ['dress.png', 'heels.png']
    );
    const file = buildCastFile({
      character: dressed,
      outfitPictures: [{ key: 'dress.png', name: 'dress.png', dataUrl: picture.dataUrl }],
      stories: [],
    });
    const read = parseCastFile(JSON.parse(JSON.stringify(file)));
    assert.equal(read?.outfitPictures?.[0]?.key, 'dress.png');
    const moved = withOutfitPhotosMoved(
      read!.character,
      new Map([['dress.png', { filename: 'dress-9.png', url: '/view?dress-9.png' }]])
    );
    assert.equal(moved.looks?.[0]?.keptOutfit?.customGarmentImageFilename, 'dress-9.png');
    assert.equal(moved.looks?.[0]?.keptOutfit?.customGarmentImageUrl, '/view?dress-9.png');
    assert.equal(moved.looks?.[0]?.keptOutfit?.footwearImageFilename, 'heels.png');
    assert.equal(moved.wardrobe?.[0]?.key, 'dress-9.png');
    assert.equal(moved.wardrobe?.[0]?.outfit.customGarmentImageFilename, 'dress-9.png');
    assert.equal(moved.wardrobe?.[1]?.key, 'kit-1');
    const withStills = withOutfitPhotosMoved(
      read!.character,
      new Map(),
      new Map([['kit-1', '/view?still-1.png']])
    );
    assert.equal(withStills.wardrobe?.[1]?.pictureUrl, '/view?still-1.png');
    assert.equal(withStills.wardrobe?.[0]?.pictureUrl, undefined);
  });

  it('point reference sheets at the copies here and drop renders that did not come along', () => {
    const sheeted = {
      ...(nora as object),
      looks: [
        {
          ...(nora as { looks: object[] }).looks[0],
          referenceSheet: [
            { id: 'side', label: 'Side', url: '/old/side', at: 1 },
            { id: 'back', label: 'Back', url: '/old/back', at: 1 },
          ],
        },
      ],
    } as never;
    const moved = withReferenceSheetsMoved(sheeted, new Map([['look-1|side', '/view?side-2.png']]));
    assert.deepEqual(
      moved.looks?.[0]?.referenceSheet?.map(view => [view.id, view.url]),
      [['side', '/view?side-2.png']]
    );
    assert.equal(
      withReferenceSheetsMoved(sheeted, new Map()).looks?.[0]?.referenceSheet,
      undefined
    );
  });

  it('refuse other files', () => {
    assert.equal(parseCastFile({ kind: 'look-pack' }), null);
    assert.equal(parseCastFile({ kind: 'castcut-cast', version: 99, character: nora }), null);
    assert.equal(parseCastFile(null), null);
  });

  it('never replace a Cast that is here: new id and name, story re-keyed', () => {
    const file = buildCastFile({ character: nora, stories: [story] });
    const placed = placeImportedCast(file, {
      idTaken: id => id === 'char-nora',
      nameTaken: name => name === 'Nora',
      newId: () => 'char-new',
      sessionIdFor: id => `cast-${id}`,
      now: 9,
    });
    assert.equal(placed.character.id, 'char-new');
    assert.equal(placed.character.name, 'Nora (imported)');
    assert.equal(placed.renamed, true);
    assert.equal(placed.stories[0]?.id, 'cast-char-new');
    assert.equal(placed.stories[0]?.snapshot.activeSessionId, 'cast-char-new');
  });

  it('keep the id on an install that does not have it', () => {
    const placed = placeImportedCast(buildCastFile({ character: nora, stories: [] }), {
      idTaken: () => false,
      nameTaken: () => false,
      newId: () => 'char-new',
      sessionIdFor: id => `cast-${id}`,
    });
    assert.equal(placed.character.id, 'char-nora');
    assert.equal(placed.character.name, 'Nora');
  });

  it('are named after the Cast', () => {
    assert.equal(castFileName('Nora Ruiz!'), 'nora-ruiz.castcut-cast.json');
  });
});
