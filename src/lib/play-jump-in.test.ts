import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import { hasCompletedFirstFilm } from './play-metrics';
import { playCampaignProgressLabel, type PlayCampaignState } from './play-campaign';
import { buildStarterLookPack, startStarterPlayFilm } from './play-starter';
import {
  DEFAULT_DAY_TOOL_CACHE,
  loadToolSettings,
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
  return storage;
}

describe('play jump-in helpers', () => {
  it('hasCompletedFirstFilm requires a cut timestamp', () => {
    assert.equal(hasCompletedFirstFilm({ version: 1 }), false);
    assert.equal(hasCompletedFirstFilm({ version: 1, firstFilmCutAt: 0 }), false);
    assert.equal(hasCompletedFirstFilm({ version: 1, firstFilmCutAt: Date.now() }), true);
  });

  it('playCampaignProgressLabel summarizes resume', () => {
    assert.equal(playCampaignProgressLabel(null), 'Film · start');
    const mid: PlayCampaignState = {
      version: 1,
      characterId: 'c1',
      stepIndex: 2,
      updatedAt: Date.now(),
    };
    assert.match(playCampaignProgressLabel(mid), /Outfit/);
    const done: PlayCampaignState = { ...mid, completedAt: Date.now() };
    assert.equal(playCampaignProgressLabel(done), 'Film · complete');
  });

  it('buildStarterLookPack stages vibe notes', () => {
    const pack = buildStarterLookPack('c1');
    assert.equal(pack.characterId, 'c1');
    assert.equal(pack.version, 1);
    assert.ok(pack.moodNotes);
    assert.ok(pack.vibePrompt);
  });

  it('startStarterPlayFilm clears prior Day stills and clips', () => {
    installFakeWindow();
    saveToolSettings('day', {
      ...DEFAULT_DAY_TOOL_CACHE,
      stills: [
        {
          slotId: 'morning',
          promptId: 'old',
          status: 'completed',
          imageUrl: 'https://example.com/m.jpg',
          clipStatus: 'completed',
          clipUrl: 'https://example.com/m.mp4',
        },
      ],
    });
    const result = startStarterPlayFilm({ name: 'Nova', autoQueue: true });
    assert.match(result.href, /starter=1/);
    assert.match(result.href, /autoqueue=1/);
    const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
    assert.deepEqual(day.stills, []);
    const locations = (day.slots ?? []).map(slot => slot.location?.trim() || '');
    assert.equal(locations.filter(Boolean).length, 4);
    assert.equal(new Set(locations).size, 4);
  });
});
