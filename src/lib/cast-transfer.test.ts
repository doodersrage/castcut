import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCastFile, castFileName, parseCastFile, placeImportedCast } from './cast-transfer';

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
