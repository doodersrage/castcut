import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import { removeCastPlate, switchCastPlate } from './cast-plate-switch';
import { castPlateTiles } from './cast-plate-thumb';
import { activeLook, getCharacter, looksOf, upsertCharacter } from './character-os';
import { dayDressPlateRequestKey } from './day-dress-plate';
import { resolveFittingPlateFromCharacter } from './fitting-room';
import { assignOutfitPlateToCastAndFitting } from './look-outfit-plate';
import {
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
});
