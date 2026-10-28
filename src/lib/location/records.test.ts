import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from '../storage/browser-storage';
import { mergeRecordList, recordListSpec } from '../storage/record-list-sync';
import {
  LOCATIONS_LIMIT,
  deleteLocation,
  loadLocations,
  locationForPlace,
  normalizeLocation,
  normalizeLocations,
  placeKey,
  replaceLocations,
  saveLocation,
} from './records';

function installWindow() {
  const storage = new Map<string, string>();
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
      get length() {
        return storage.size;
      },
      key: (index: number) => [...storage.keys()][index] ?? null,
    },
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  return () => {
    (globalThis as { window?: unknown }).window = original;
  };
}

const cafe = {
  id: 'loc-cafe',
  name: 'Corner café',
  setting: 'INT' as const,
  look: 'green tiled counter, brass espresso machine, chalkboard menu, round marble tables',
  aliases: ['cafe', 'The Café'],
};

describe('location records (M8 T1)', () => {
  let restore: () => void = () => {};
  beforeEach(() => {
    restore = installWindow();
    resetBrowserStorageCache();
  });
  afterEach(() => restore());

  it('keeps a record: tidy words, place names as keys, inside unless outdoors', () => {
    const location = normalizeLocation({
      ...cafe,
      name: '  Corner   café ',
      setting: 'somewhere',
      aliases: ['cafe', 'The Café', '', 'CAFE', 42],
      createdAt: 5,
    });
    assert.deepEqual(location, {
      id: 'loc-cafe',
      name: 'Corner café',
      setting: 'INT',
      look: cafe.look,
      aliases: ['cafe'],
      createdAt: 5,
    });
    assert.equal(normalizeLocation({ id: 'x', name: ' ' }), null, 'no name');
    assert.equal(normalizeLocation({ name: 'Bar' }), null, 'no id');
    assert.equal(normalizeLocation({ ...cafe, setting: 'EXT' })?.setting, 'EXT');
    assert.equal(placeKey('  The CAFÉ, downtown! '), 'cafe downtown');
  });

  it('a list keeps each id once, within the limit', () => {
    const many = Array.from({ length: LOCATIONS_LIMIT + 5 }, (_, index) => ({
      id: `loc-${index}`,
      name: `Place ${index}`,
    }));
    assert.equal(normalizeLocations(many).length, LOCATIONS_LIMIT);
    assert.deepEqual(
      normalizeLocations([cafe, { ...cafe, name: 'Another' }, null]).map(entry => entry.name),
      ['Corner café']
    );
    assert.deepEqual(normalizeLocations('nope'), []);
  });

  it('saves, edits in place (keeping when it was made), and finds one by a script place', () => {
    const saved = saveLocation(cafe, 100);
    assert.equal(saved?.createdAt, 100);
    saveLocation({ id: 'loc-bar', name: 'Hotel bar', look: 'dark wood' }, 200);
    const edited = saveLocation({ ...cafe, look: 'blue tiles' }, 300);
    assert.equal(edited?.createdAt, 100);
    assert.deepEqual(
      loadLocations().map(entry => [entry.id, entry.look]),
      [
        ['loc-cafe', 'blue tiles'],
        ['loc-bar', 'dark wood'],
      ]
    );
    assert.equal(saveLocation({ id: 'loc-x', name: '' }), null);
    const all = loadLocations();
    assert.equal(locationForPlace('THE CAFE', all)?.id, 'loc-cafe', 'an alias');
    assert.equal(locationForPlace('corner café', all)?.id, 'loc-cafe', 'its name');
    assert.equal(locationForPlace('hotel bar', all)?.id, 'loc-bar');
    assert.equal(locationForPlace('library', all), undefined);
    assert.equal(locationForPlace('', all), undefined);
  });

  it('refuses to delete a location a Scene is set in, and says which', () => {
    saveLocation(cafe);
    const scenes = [
      { name: '6A CAFE', slot: { locationId: 'loc-cafe' } },
      { name: '7A CAFE', slot: { locationId: 'loc-cafe' } },
      { name: '1A KITCHEN', slot: {} },
    ];
    assert.deepEqual(deleteLocation('loc-cafe', scenes), {
      deleted: false,
      usedBy: ['6A CAFE', '7A CAFE'],
    });
    assert.equal(loadLocations().length, 1);
    assert.deepEqual(deleteLocation('loc-cafe', scenes.slice(2)), { deleted: true, usedBy: [] });
    assert.deepEqual(loadLocations(), []);
    assert.deepEqual(deleteLocation('loc-cafe', []), { deleted: false, usedBy: [] });
  });

  it('reads a synced copy, dropping what is not a location', () => {
    replaceLocations([cafe, { id: 'bad' }, 'x']);
    assert.deepEqual(
      loadLocations().map(entry => entry.id),
      ['loc-cafe']
    );
    replaceLocations('not a list');
    assert.equal(loadLocations().length, 1);
  });

  it('merges across devices per record: the newer edit wins, a deleted one stays gone', () => {
    const spec = recordListSpec('locations');
    const phone = [
      { ...cafe, look: 'phone edit', updatedAt: 9 },
      { id: 'loc-bar', name: 'Hotel bar', updatedAt: 2 },
    ];
    const desk = [
      { ...cafe, look: 'desk edit', updatedAt: 5 },
      { id: 'loc-park', name: 'The park', updatedAt: 3 },
    ];
    const merged = mergeRecordList(spec, phone, desk, { 'loc-park': 8 }) as Array<{
      id: string;
      look?: string;
    }>;
    assert.deepEqual(merged.map(entry => entry.id).sort(), ['loc-bar', 'loc-cafe']);
    assert.equal(merged.find(entry => entry.id === 'loc-cafe')?.look, 'phone edit');
  });
});
