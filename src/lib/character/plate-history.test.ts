import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from '../storage/browser-storage';
import {
  activeLook,
  createBlankCharacter,
  getCharacter,
  looksOf,
  MAX_LOOK_PLATE_HISTORY,
  restoreLookPlate,
  upsertCharacter,
  type CharacterRecord,
} from './os';

function withMockLocalStorage(run: () => void): void {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      dispatchEvent: () => true,
    },
  });
  resetBrowserStorageCache();
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    resetBrowserStorageCache();
  }
}

const plate = (name: string) => ({
  originalUrl: `/api/gallery/media/${name}`,
  originalFilename: `${name}.png`,
  isolatedUrl: `/api/gallery/media/${name}`,
  isolatedFilename: `${name}.png`,
});

/** Replace the active look's plate the way the plate paths do (look + root). */
function setPlate(id: string, name: string, face = `${name}-face.png`): CharacterRecord {
  const record = getCharacter(id)!;
  const look = activeLook(record);
  upsertCharacter({
    ...record,
    reference: plate(name),
    ipAdapter: { imageFilename: face },
    looks: looksOf(record).map(entry =>
      entry.id === look.id
        ? { ...entry, reference: plate(name), ipAdapter: { imageFilename: face } }
        : entry
    ),
  });
  return getCharacter(id)!;
}

describe('look plate history', () => {
  it('keeps the replaced plate (and its face) and restores it, swapping the current one in', () => {
    withMockLocalStorage(() => {
      const blank = createBlankCharacter('Lena');
      upsertCharacter(blank);
      setPlate(blank.id, 'first');
      const after = setPlate(blank.id, 'second');
      const history = activeLook(after).plateHistory ?? [];
      assert.equal(history.length, 1);
      assert.equal(history[0]!.reference?.originalFilename, 'first.png');
      assert.equal(history[0]!.ipAdapter?.imageFilename, 'first-face.png');

      const restored = restoreLookPlate(blank.id, activeLook(after).id, history[0]!.replacedAt)!;
      const look = activeLook(restored);
      assert.equal(look.reference?.originalFilename, 'first.png');
      assert.equal(look.ipAdapter?.imageFilename, 'first-face.png');
      assert.equal(restored.reference?.originalFilename, 'first.png');
      assert.deepEqual(
        look.plateHistory?.map(entry => entry.reference?.originalFilename),
        ['second.png']
      );
    });
  });

  it('records a removed plate, keeps the newest six, and survives a save without looks', () => {
    withMockLocalStorage(() => {
      const blank = createBlankCharacter('Ines');
      upsertCharacter(blank);
      for (let i = 0; i < MAX_LOOK_PLATE_HISTORY + 3; i += 1) setPlate(blank.id, `p${i}`);
      const full = activeLook(getCharacter(blank.id)!).plateHistory ?? [];
      assert.equal(full.length, MAX_LOOK_PLATE_HISTORY);
      assert.equal(full[0]!.reference?.originalFilename, `p${MAX_LOOK_PLATE_HISTORY + 1}.png`);

      // Remove plate: the look keeps no picture, the removed one goes into history.
      const record = getCharacter(blank.id)!;
      const look = activeLook(record);
      upsertCharacter({
        ...record,
        reference: undefined,
        ipAdapter: undefined,
        looks: looksOf(record).map(entry =>
          entry.id === look.id ? { ...entry, reference: undefined, ipAdapter: undefined } : entry
        ),
      });
      const removed = activeLook(getCharacter(blank.id)!).plateHistory ?? [];
      assert.equal(removed[0]!.reference?.originalFilename, `p${MAX_LOOK_PLATE_HISTORY + 2}.png`);

      // An older save path sends no looks array (the active look is rebuilt): history stays.
      const { looks: _looks, ...flat } = getCharacter(blank.id)!;
      void _looks;
      upsertCharacter({ ...flat, descriptor: 'tall woman' });
      assert.equal(
        activeLook(getCharacter(blank.id)!).plateHistory?.length,
        MAX_LOOK_PLATE_HISTORY
      );
    });
  });
});
