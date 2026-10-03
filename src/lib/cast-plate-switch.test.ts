import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import { addBlankCastLook, removeCastPlate, switchCastPlate } from './cast-plate-switch';
import {
  castLookDisplayName,
  castLookPortraitTile,
  castLookOutfitLabel,
  castPlateTiles,
  keptPhotoOutfitLabel,
  nextCastLookName,
} from './cast-plate-thumb';
import {
  activeLook,
  applyCharacterRecordFresh,
  getCharacter,
  looksOf,
  setLookKeptOutfit,
  upsertCharacter,
} from './character-os';
import { dayDressPlateRequestKey } from './day-dress-plate';
import { resolveFittingPlateFromCharacter } from './fitting-room';
import { assignOutfitPlateToCastAndFitting } from './look-outfit-plate';
import { keptLookOutfitFromTryOn } from './outfit-handoff';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_FITTING_TOOL_CACHE,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSettingsCache,
  saveToolSettings,
} from './settings-cache';

function installMemoryWindow() {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      sessionStorage: {
        getItem: (key: string) => storage.get(`s:${key}`) ?? null,
        setItem: (key: string, value: string) => storage.set(`s:${key}`, value),
        removeItem: (key: string) => storage.delete(`s:${key}`),
      },
      dispatchEvent: () => true,
    },
  });
  resetBrowserStorageCache();
}

/** A Cast with plate A, then plate B added (B active), and the Cast active in the session. */
function seedTwoPlates(id: string): { lookA: string; lookB: string } {
  upsertCharacter({ id, name: id, version: 1, updatedAt: 1 });
  const cache = loadSettingsCache();
  saveSettingsCache({ ...cache, shared: { ...cache.shared, activeCharacterId: id } });
  assignOutfitPlateToCastAndFitting({
    characterId: id,
    imageUrl: '/plates/a.png',
    filename: 'plate-a.png',
    isolated: true,
    syncFace: true,
  });
  const lookA = activeLook(getCharacter(id)!).id;
  assignOutfitPlateToCastAndFitting({
    characterId: id,
    imageUrl: '/plates/b.png',
    filename: 'plate-b.png',
    isolated: true,
    newLook: { id: `${id}-look-b`, name: 'Beach' },
  });
  return { lookA, lookB: `${id}-look-b` };
}

describe('several look plates per Cast', () => {
  it('adding a plate keeps the old one and makes the new one the plate everywhere', () => {
    installMemoryWindow();
    const { lookA, lookB } = seedTwoPlates('char-add');
    const cast = getCharacter('char-add')!;
    assert.equal(cast.activeLookId, lookB);
    assert.equal(resolveFittingPlateFromCharacter(cast)?.filename, 'plate-b.png');
    // Its own face too — never the other plate's.
    assert.equal(cast.ipAdapter?.imageFilename, 'plate-b.png');
    const a = looksOf(cast).find(look => look.id === lookA);
    assert.equal(a?.reference?.originalFilename, 'plate-a.png');
    assert.equal(a?.ipAdapter?.imageFilename, 'plate-a.png');
    assert.equal(
      loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE).referenceImageFilename,
      'plate-b.png'
    );
  });

  it('switching plates moves the Cast plate, Outfit, and a Story that showed the old plate', () => {
    installMemoryWindow();
    const { lookA } = seedTwoPlates('char-switch');
    saveToolSettings('roleplay', {
      ...loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE),
      referenceImageUrl: '/plates/b.png',
      referenceImageFilename: 'plate-b.png',
    });
    const next = switchCastPlate('char-switch', lookA);
    assert.equal(next?.activeLookId, lookA);
    assert.equal(resolveFittingPlateFromCharacter(next)?.filename, 'plate-a.png');
    assert.equal(next?.ipAdapter?.imageFilename, 'plate-a.png');
    const fitting = loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE);
    assert.equal(fitting.referenceImageFilename, 'plate-a.png');
    assert.equal(fitting.suppressAutoPlateSeed, false);
    assert.equal(
      loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE).referenceImageFilename,
      'plate-a.png'
    );
  });

  it('a photo picked in Story stays when the plate switches', () => {
    installMemoryWindow();
    const { lookA } = seedTwoPlates('char-story');
    saveToolSettings('roleplay', {
      ...loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE),
      referenceImageUrl: '/story/own.png',
      referenceImageFilename: 'story-own.png',
    });
    switchCastPlate('char-story', lookA);
    assert.equal(
      loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE).referenceImageFilename,
      'story-own.png'
    );
  });

  it('a plate of a Cast that is not active leaves the sessions alone', () => {
    installMemoryWindow();
    const { lookA } = seedTwoPlates('char-other');
    const cache = loadSettingsCache();
    saveSettingsCache({ ...cache, shared: { ...cache.shared, activeCharacterId: 'char-else' } });
    switchCastPlate('char-other', lookA);
    assert.equal(getCharacter('char-other')?.activeLookId, lookA);
    assert.equal(
      loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE).referenceImageFilename,
      'plate-b.png'
    );
  });

  it('each plate has its own dressed plates (the key follows the plate file)', () => {
    installMemoryWindow();
    const { lookA } = seedTwoPlates('char-dress');
    const request = (plate: ReturnType<typeof resolveFittingPlateFromCharacter>) =>
      dayDressPlateRequestKey({
        model: 'qwen-image-edit-rapid',
        plate: { filename: plate?.filename, imageUrl: plate?.imageUrl },
        clothingKey: 'kit:denim-01',
        clothingLabel: 'Denim',
        footwear: '',
      });
    const keyB = request(resolveFittingPlateFromCharacter(getCharacter('char-dress')));
    const keyA = request(resolveFittingPlateFromCharacter(switchCastPlate('char-dress', lookA)));
    assert.notEqual(keyA, keyB);
    assert.match(keyA, /plate-a\.png/);
  });

  it('removing the active plate falls back to another; the last one cannot go', () => {
    installMemoryWindow();
    const { lookA, lookB } = seedTwoPlates('char-remove');
    const next = removeCastPlate('char-remove', lookB);
    assert.equal(next?.activeLookId, lookA);
    assert.equal(looksOf(next!).length, 1);
    assert.equal(
      loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE).referenceImageFilename,
      'plate-a.png'
    );
    assert.equal(looksOf(removeCastPlate('char-remove', lookA)!).length, 1);
  });

  it('plate tiles show each look’s own picture, never the shared face-lock file', () => {
    installMemoryWindow();
    const { lookA, lookB } = seedTwoPlates('char-tiles');
    const cast = getCharacter('char-tiles')!;
    upsertCharacter({
      ...cast,
      looks: [
        ...looksOf(cast),
        {
          id: 'look-identity',
          name: 'Locked face',
          createdAt: 0,
          ipAdapter: { imageFilename: 'face.png', imageUrl: '/api/gallery/media/identity?v=1' },
        },
        { id: 'look-empty', name: 'Empty', createdAt: -1 },
      ],
    });
    const tiles = castPlateTiles(getCharacter('char-tiles')!);
    assert.deepEqual(
      tiles.map(tile => [tile.id, tile.label, tile.thumb, tile.hasPlate]),
      [
        [lookB, 'Beach', '/plates/b.png', true],
        [lookA, 'Default', '/plates/a.png', true],
        ['look-identity', 'Locked face', undefined, true],
        ['look-empty', 'Empty', undefined, false],
      ]
    );
  });

  it('Looks tiles: every look, plate-less ones offer Add plate, names and outfit locks', () => {
    installMemoryWindow();
    upsertCharacter({
      id: 'char-looks',
      name: 'Juno',
      version: 1,
      updatedAt: 1,
      activeLookId: 'look-studio',
      looks: [
        {
          id: 'look-studio',
          name: 'Studio',
          createdAt: 4,
          ipAdapter: { imageFilename: 'studio.png', imageUrl: '/icon.svg' },
          lockedWardrobeId: 'outfit-relaxed-fit-lavender-slip-dress',
        },
        {
          id: 'look-old',
          name: 'New look',
          createdAt: 3,
          ipAdapter: { imageFilename: 'old.png', imageUrl: '/icon.svg' },
        },
        // No plate of its own: shows an Add plate box, never another look's picture.
        { id: 'look-bare', name: 'New look', createdAt: 2 },
        { id: 'look-first', name: 'Default', createdAt: 1 },
      ],
    });
    const cast = getCharacter('char-looks')!;
    const tiles = castPlateTiles(cast, {
      outfitLabel: id => (id === 'outfit-relaxed-fit-lavender-slip-dress' ? 'Lavender slip' : id),
    });
    assert.deepEqual(
      tiles.map(tile => [tile.id, tile.label, tile.thumb, tile.hasPlate, tile.outfit]),
      [
        ['look-studio', 'Studio', '/icon.svg', true, 'Lavender slip'],
        // Old "New look" names read as "Look N" by place, oldest first; the record keeps its name.
        ['look-old', 'Look 3', '/icon.svg', true, undefined],
        ['look-bare', 'Look 2', undefined, false, undefined],
        ['look-first', 'Default', undefined, false, undefined],
      ]
    );
    assert.equal(looksOf(cast).find(look => look.id === 'look-old')?.name, 'New look');
    // Without a loaded catalog label the kit id reads as words.
    assert.equal(castPlateTiles(cast)[0]!.outfit, 'relaxed-fit lavender slip dress');

    const bare = castLookPortraitTile(tiles[2]!);
    assert.equal(bare.placeholder, 'Add plate');
    assert.equal(bare.thumb, undefined);
    assert.equal(castLookPortraitTile(tiles[2]!, { placeholder: 'No plate' }).placeholder, 'No plate');
    const studio = castLookPortraitTile(tiles[0]!);
    assert.equal(studio.placeholder, undefined);
    assert.equal(studio.caption, 'Lavender slip');
    assert.equal(studio.title, 'Studio · Lavender slip');

    // Next free number past the ones on show.
    assert.equal(nextCastLookName(cast), 'Look 5');
  });

  it('look names: blank and "New look" are numbered, real names stay', () => {
    assert.equal(castLookDisplayName('Beach', 2), 'Beach');
    assert.equal(castLookDisplayName('  New look ', 4), 'Look 4');
    assert.equal(castLookDisplayName('new LOOK', 1), 'Look 1');
    assert.equal(castLookDisplayName('', 3), 'Look 3');
    assert.equal(castLookDisplayName(undefined, 7), 'Look 7');
    assert.equal(castLookDisplayName('New look 2', 1), 'New look 2');
  });

  it('a new look from a plate-less look copies its outfit lock, no picture, and is active', () => {
    installMemoryWindow();
    upsertCharacter({
      id: 'char-blank',
      name: 'Ines',
      version: 1,
      updatedAt: 1,
      activeLookId: 'look-a',
      looks: [{ id: 'look-a', name: 'Coat', createdAt: 1, lockedWardrobeId: 'outfit-coat' }],
    });
    const next = addBlankCastLook('char-blank', 'Look 2')!;
    const fresh = activeLook(next);
    assert.notEqual(fresh.id, 'look-a');
    assert.equal(fresh.name, 'Look 2');
    assert.equal(fresh.lockedWardrobeId, 'outfit-coat');
    assert.equal(fresh.reference, undefined);
    assert.equal(fresh.ipAdapter, undefined);
    assert.equal(looksOf(next).length, 2);
    const tiles = castPlateTiles(next);
    assert.equal(tiles[0]!.id, fresh.id);
    assert.equal(tiles[0]!.hasPlate, false);
  });

  it('Keep saves the outfit to the look; switching back restores it; un-keeping clears it', () => {
    installMemoryWindow();
    const { lookA, lookB } = seedTwoPlates('char-keep');
    // Look B (active) keeps a try-on from a clothing photo, with shoes.
    const photoPicks = {
      customGarmentImageFilename: 'red-dress.png',
      customGarmentDescription: 'a red satin slip dress with thin straps and a low back',
      footwear: 'black heels',
    };
    setLookKeptOutfit('char-keep', lookB, {
      outfit: keptLookOutfitFromTryOn(
        { wardrobeId: 'custom-garment', galleryEntryId: 'g-photo', dressPlateKey: 'dress-key-b' },
        photoPicks
      ),
    });
    // Look A keeps a kit.
    setLookKeptOutfit('char-keep', lookA, {
      outfit: keptLookOutfitFromTryOn({ wardrobeId: 'denim-01', galleryEntryId: 'g-kit' }, {}),
    });
    let cast = getCharacter('char-keep')!;
    const b = looksOf(cast).find(look => look.id === lookB)!;
    assert.equal(b.keptOutfit?.customGarmentImageFilename, 'red-dress.png');
    assert.equal(b.keptOutfit?.entryId, 'g-photo');
    assert.equal(b.keptOutfit?.dressPlateKey, 'dress-key-b');
    assert.equal(b.lockedWardrobeId, undefined);
    assert.equal(looksOf(cast).find(look => look.id === lookA)?.lockedWardrobeId, 'denim-01');

    // The tiles say what each look wears.
    const tiles = castPlateTiles(cast, { outfitLabel: id => (id === 'denim-01' ? 'Denim' : id) });
    assert.equal(tiles.find(tile => tile.id === lookA)?.outfit, 'Denim');
    assert.equal(tiles.find(tile => tile.id === lookB)?.outfit, 'a red satin slip dress with thin…');

    // Switch to the kit look: the photo goes from Outfit, Day and Story; the kit is the lock.
    saveToolSettings('day', {
      ...loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE),
      ...photoPicks,
    });
    cast = switchCastPlate('char-keep', lookA)!;
    assert.equal(applyCharacterRecordFresh(cast).lockedWardrobeId, 'denim-01');
    for (const tool of ['day', 'roleplay', 'fitting'] as const) {
      const settings = loadToolSettings(tool, DEFAULT_DAY_TOOL_CACHE as never) as {
        customGarmentImageFilename?: string;
        footwear?: string;
      };
      assert.equal(settings.customGarmentImageFilename, undefined, tool);
    }
    assert.equal(loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE).wardrobeId, 'denim-01');

    // And back: the photo and shoes come back everywhere.
    cast = switchCastPlate('char-keep', lookB)!;
    assert.equal(applyCharacterRecordFresh(cast).lockedWardrobeId, undefined);
    const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    assert.equal(day.customGarmentImageFilename, 'red-dress.png');
    assert.equal(day.footwear, 'black heels');
    assert.equal(
      loadToolSettings('fitting', DEFAULT_FITTING_TOOL_CACHE).customGarmentImageFilename,
      'red-dress.png'
    );
    const story = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
    assert.equal(story.customGarmentImageFilename, 'red-dress.png');
    assert.equal(story.wardrobeId, undefined);

    // Un-keeping another try-on leaves it; un-keeping this one clears it (and the kit's lock).
    setLookKeptOutfit('char-keep', lookB, { removeEntryId: 'g-other' });
    assert.ok(activeLook(getCharacter('char-keep')!).keptOutfit);
    setLookKeptOutfit('char-keep', lookB, { removeEntryId: 'g-photo' });
    assert.equal(activeLook(getCharacter('char-keep')!).keptOutfit, undefined);
    setLookKeptOutfit('char-keep', lookA, { removeEntryId: 'g-kit' });
    const a = looksOf(getCharacter('char-keep')!).find(look => look.id === lookA)!;
    assert.equal(a.keptOutfit, undefined);
    assert.equal(a.lockedWardrobeId, undefined);
  });

  it('a kept outfit survives a Cast save that does not carry the looks', () => {
    installMemoryWindow();
    const { lookB } = seedTwoPlates('char-merge');
    setLookKeptOutfit('char-merge', lookB, {
      outfit: { entryId: 'g-1', customGarmentImageFilename: 'dress.png' },
    });
    const cast = getCharacter('char-merge')!;
    // A save from the session (no looks array) rebuilds the active look from the record.
    upsertCharacter({ ...cast, looks: undefined, notes: 'edited' });
    assert.equal(activeLook(getCharacter('char-merge')!).keptOutfit?.entryId, 'g-1');
  });

  it('a kept clothing photo captions its look: the description, clipped at a word', () => {
    assert.equal(keptPhotoOutfitLabel(undefined), '');
    assert.equal(keptPhotoOutfitLabel({ customGarmentDescription: 'no photo' }), '');
    assert.equal(keptPhotoOutfitLabel({ customGarmentImageUrl: '/x.png' }), 'Clothing photo');
    assert.equal(
      keptPhotoOutfitLabel({ customGarmentImageFilename: 'x.png', customGarmentDescription: ' a  red dress ' }),
      'a red dress'
    );
    const long = keptPhotoOutfitLabel({
      customGarmentImageFilename: 'x.png',
      customGarmentDescription: 'a floor-length emerald velvet gown with long sleeves and a slit',
    });
    assert.ok(long.length <= 40 && long.endsWith('…'), long);
    // A kit lock wins over the photo caption.
    assert.equal(
      castLookOutfitLabel('outfit-denim-jacket', { customGarmentImageFilename: 'x.png' }),
      'denim jacket'
    );
  });
});
