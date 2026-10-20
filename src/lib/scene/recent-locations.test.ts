import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  loadRecentLocations,
  normalizeLocationKey,
  pushRecentLocation,
  readSceneLocationFromMetadata,
} from './recent-locations';

const store = new Map<string, string>();

function installSessionStorage(): void {
  const sessionStorage = {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { sessionStorage } });
}

afterEach(() => {
  store.clear();
  delete (globalThis as { window?: unknown }).window;
});

describe('normalizeLocationKey', () => {
  it('lowercases, collapses whitespace, and trims', () => {
    assert.equal(normalizeLocationKey('  New   YORK   City  '), 'new york city');
  });
});

describe('loadRecentLocations (no window)', () => {
  it('returns [] without window', () => {
    assert.deepEqual(loadRecentLocations(), []);
  });
});

describe('pushRecentLocation (no window)', () => {
  it('returns [] without writing anything', () => {
    assert.deepEqual(pushRecentLocation('Paris'), []);
  });
});

describe('with a stubbed window', () => {
  it('loadRecentLocations returns [] when nothing is stored', () => {
    installSessionStorage();
    assert.deepEqual(loadRecentLocations(), []);
  });

  it('loadRecentLocations returns [] for malformed JSON or a non-array value', () => {
    installSessionStorage();
    store.set('qwen-prompt-recent-locations', '{not json');
    assert.deepEqual(loadRecentLocations(), []);
    store.set('qwen-prompt-recent-locations', JSON.stringify({ not: 'an array' }));
    assert.deepEqual(loadRecentLocations(), []);
  });

  it('loadRecentLocations filters non-strings, trims, and drops blanks', () => {
    installSessionStorage();
    store.set(
      'qwen-prompt-recent-locations',
      JSON.stringify(['  Paris  ', 42, '   ', 'Tokyo'])
    );
    assert.deepEqual(loadRecentLocations(), ['Paris', 'Tokyo']);
  });

  it('pushRecentLocation ignores a blank location', () => {
    installSessionStorage();
    assert.deepEqual(pushRecentLocation('   '), []);
  });

  it('pushRecentLocation prepends the trimmed location and persists it', () => {
    installSessionStorage();
    const result = pushRecentLocation('  Paris  ');
    assert.deepEqual(result, ['Paris']);
    assert.deepEqual(loadRecentLocations(), ['Paris']);
  });

  it('pushRecentLocation dedupes case/whitespace-insensitively, moving the entry to the front', () => {
    installSessionStorage();
    pushRecentLocation('Paris');
    pushRecentLocation('Tokyo');
    const result = pushRecentLocation('  PARIS  ');
    assert.deepEqual(result, ['PARIS', 'Tokyo']);
  });

  it('caps the list at 24 entries', () => {
    installSessionStorage();
    for (let i = 0; i < 30; i += 1) {
      pushRecentLocation(`City ${i}`);
    }
    const result = loadRecentLocations();
    assert.equal(result.length, 24);
    assert.equal(result[0], 'City 29');
  });
});

describe('readSceneLocationFromMetadata', () => {
  it('returns null for missing/undefined metadata', () => {
    assert.equal(readSceneLocationFromMetadata(undefined), null);
    assert.equal(readSceneLocationFromMetadata({}), null);
  });

  it('returns null for a non-string or blank sceneLocation', () => {
    assert.equal(readSceneLocationFromMetadata({ sceneLocation: 42 }), null);
    assert.equal(readSceneLocationFromMetadata({ sceneLocation: '   ' }), null);
  });

  it('returns the trimmed sceneLocation string', () => {
    assert.equal(readSceneLocationFromMetadata({ sceneLocation: '  Paris  ' }), 'Paris');
  });
});
