import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from '../storage/browser-storage';
import {
  activeLook,
  createBlankCharacter,
  getCharacter,
  looksOf,
  MAX_LOOK_PLATE_HISTORY,
  offeredLookPlates,
  restoreLookPlate,
  setLookPlateDeprecated,
  setLookPreferredKeeper,
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

// M2 C6: a plate you know is wrong stops being offered; a keeper can be picked for Day.
describe('reference status', () => {
  it("marks an earlier plate don't-offer-again, and back", () => {
    withMockLocalStorage(() => {
      const record = createBlankCharacter('Nora');
      upsertCharacter(record);
      setPlate(record.id, 'one');
      setPlate(record.id, 'two');
      const after = setPlate(record.id, 'three');
      const look = activeLook(after);
      const [newest, older] = look.plateHistory!;
      assert.ok(newest && older);
      setLookPlateDeprecated(record.id, look.id, newest.replacedAt, true);
      const marked = activeLook(getCharacter(record.id)!);
      assert.equal(marked.plateHistory![0]!.deprecated, true);
      assert.deepEqual(
        offeredLookPlates(marked).map(entry => entry.replacedAt),
        [older.replacedAt]
      );
      setLookPlateDeprecated(record.id, look.id, newest.replacedAt, false);
      assert.equal('deprecated' in activeLook(getCharacter(record.id)!).plateHistory![0]!, false);
    });
  });

  it('picks a keeper for Day and Story (only a keeper), and lets it go', () => {
    withMockLocalStorage(() => {
      const record = createBlankCharacter('Nora');
      upsertCharacter(record);
      const look = activeLook(getCharacter(record.id)!);
      upsertCharacter({
        ...getCharacter(record.id)!,
        looks: looksOf(getCharacter(record.id)!).map(entry =>
          entry.id === look.id ? { ...entry, keeperEntryIds: ['k1', 'k2'] } : entry
        ),
      });
      setLookPreferredKeeper(record.id, look.id, 'k1');
      assert.equal(activeLook(getCharacter(record.id)!).preferredKeeperId, 'k1');
      setLookPreferredKeeper(record.id, look.id, 'not-a-keeper');
      assert.equal(activeLook(getCharacter(record.id)!).preferredKeeperId, 'k1');
      setLookPreferredKeeper(record.id, look.id, null);
      assert.equal(activeLook(getCharacter(record.id)!).preferredKeeperId, undefined);
    });
  });

  it("an appearance-only save keeps the look's own fields (and the plate's, while it stays)", () => {
    withMockLocalStorage(() => {
      const record = createBlankCharacter('Nora');
      upsertCharacter(record);
      const before = setPlate(record.id, 'one');
      const look = activeLook(before);
      upsertCharacter({
        ...before,
        looks: looksOf(before).map(entry =>
          entry.id === look.id
            ? {
                ...entry,
                keeperEntryIds: ['k1'],
                preferredKeeperId: 'k1',
                lookNotes: 'warm dusk light',
                referenceSheet: [{ id: 'side' as const, label: 'Side', url: '/side.png', at: 1 }],
              }
            : entry
        ),
      });
      // No `looks`: an appearance-only save of the same plate.
      const { looks: _looks, ...appearance } = getCharacter(record.id)!;
      upsertCharacter({ ...appearance, descriptor: 'short dark hair' } as CharacterRecord);
      const kept = activeLook(getCharacter(record.id)!);
      assert.equal(kept.preferredKeeperId, 'k1');
      assert.equal(kept.lookNotes, 'warm dusk light');
      assert.equal(kept.referenceSheet?.length, 1);
      // Another plate: the sheet was of the old one, so it goes; the look's own fields stay.
      const { looks: _again, ...current } = getCharacter(record.id)!;
      upsertCharacter({ ...current, reference: plate('two') } as CharacterRecord);
      const replaced = activeLook(getCharacter(record.id)!);
      assert.equal(replaced.referenceSheet, undefined);
      assert.equal(replaced.lookNotes, 'warm dusk light');
    });
  });
});
