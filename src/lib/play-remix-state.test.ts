import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import { DEFAULT_DAY_SLOTS } from './day-planner';
import { applyRemixDayFilmState, remixNewOutfitHref } from './play-starter';
import { remixDayFilmHref } from './play-step-machine';
import {
  DEFAULT_DAY_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
  saveToolSettings,
} from './settings-cache';

function installFakeWindow() {
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

function seedDay() {
  saveToolSettings('day', {
    ...DEFAULT_DAY_TOOL_CACHE,
    dayMood: 'sport',
    slots: DEFAULT_DAY_SLOTS.map(slot => ({
      ...slot,
      wardrobeId: `kit-${slot.id}`,
      location: `${slot.id} place`,
      sceneHints: `${slot.id} beat`,
    })),
    stills: [{ slotId: 'morning', status: 'completed', imageUrl: '/old.png' }],
    stillsCharacterId: 'c1',
    customGarmentImageUrl: '/garment.png',
  });
}

describe('play remix state', () => {
  beforeEach(() => {
    installFakeWindow();
    seedDay();
  });

  after(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('adds a validated theme param to the remix href', () => {
    assert.equal(remixDayFilmHref('c1'), '/day?character=c1&from=look&remix=1&autoqueue=1');
    assert.equal(
      remixDayFilmHref('c1', { theme: 'rainy-day' }),
      '/day?character=c1&from=look&remix=1&theme=rainy-day&autoqueue=1'
    );
    assert.equal(
      remixDayFilmHref('c1', { theme: 'bogus', autoQueue: false }),
      '/day?character=c1&from=look&remix=1'
    );
  });

  it('theme remix swaps Setting + Beat, keeps kits, resets to everyday, and clears stills', () => {
    applyRemixDayFilmState({ kind: 'theme', themeId: 'workday' });
    const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    assert.deepEqual(day.stills, []);
    assert.equal(day.stillsCharacterId, undefined);
    assert.equal(day.dayMood, 'everyday');
    assert.match(day.notes ?? '', /Workday day/);
    for (const slot of day.slots ?? []) {
      assert.equal(slot.wardrobeId, `kit-${slot.id}`);
      assert.notEqual(slot.location, `${slot.id} place`);
    }
  });

  it('new-outfit remix keeps every Setting + Beat but clears kits and BYO clothing', () => {
    saveSharedSettings({ ...loadSettingsCache().shared, lockedWardrobeId: 'locked-kit' });
    applyRemixDayFilmState({ kind: 'new-outfit' });
    const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    assert.deepEqual(day.stills, []);
    assert.equal(day.customGarmentImageUrl, undefined);
    assert.equal(day.dayMood, 'sport');
    for (const slot of day.slots ?? []) {
      assert.equal(slot.wardrobeId, undefined);
      assert.equal(slot.location, `${slot.id} place`);
      assert.equal(slot.sceneHints, `${slot.id} beat`);
    }
    assert.equal(loadSettingsCache().shared.lockedWardrobeId, undefined);
  });

  it('default remix reseeds beats but keeps existing kits', () => {
    applyRemixDayFilmState();
    const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    assert.deepEqual(day.stills, []);
    for (const slot of day.slots ?? []) {
      assert.equal(slot.wardrobeId, `kit-${slot.id}`);
      assert.ok(slot.location?.trim());
    }
  });

  it('routes new-outfit remix to the Outfit step for the Cast', () => {
    assert.equal(remixNewOutfitHref('c1'), '/fitting?character=c1');
  });
});
