import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import { upsertCharacter, createBlankCharacter } from './character-os';
import { savePlayCampaignState } from './play-campaign';
import {
  PLAY_HABIT_NUDGE_KEY,
  dismissPlayHabitNudge,
  resolvePlayHabitNudge,
} from './play-habit-nudge';
import type { PlayMetrics } from './play-metrics';

function installStorage() {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      sessionStorage: {
        getItem: (key: string) => storage.get(`s:${key}`) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(`s:${key}`, value);
        },
        removeItem: (key: string) => {
          storage.delete(`s:${key}`);
        },
      },
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  resetBrowserStorageCache();
  return storage;
}

function seedCampaignCharacter(name = 'Nudge Lead') {
  const record = createBlankCharacter(name);
  upsertCharacter(record);
  const saved = record;
  savePlayCampaignState({
    version: 1,
    characterId: saved.id,
    stepIndex: 3,
    updatedAt: Date.now(),
  });
  return saved;
}

describe('play habit nudge', () => {
  it('returns null before first cut or within 24h', () => {
    installStorage();
    assert.equal(resolvePlayHabitNudge({ version: 1 }), null);
    const recent: PlayMetrics = {
      version: 1,
      firstFilmCutAt: Date.now() - 1000 * 60 * 60 * 12,
    };
    assert.equal(resolvePlayHabitNudge(recent), null);
  });

  it('returns null after 24h when no Cast character is available', () => {
    installStorage();
    const cutAt = Date.now() - 1000 * 60 * 60 * 30;
    assert.equal(resolvePlayHabitNudge({ version: 1, firstFilmCutAt: cutAt }), null);
  });

  it('nudges after 24h and respects dismiss until next cut', () => {
    installStorage();
    const character = seedCampaignCharacter();
    const cutAt = Date.now() - 1000 * 60 * 60 * 30;
    const metrics: PlayMetrics = { version: 1, firstFilmCutAt: cutAt };
    const nudge = resolvePlayHabitNudge(metrics);
    assert.ok(nudge);
    assert.equal(nudge!.characterId, character.id);
    assert.ok(nudge!.hoursSinceCut >= 24);
    assert.match(nudge!.href, /\/day/);
    assert.match(nudge!.href, new RegExp(`character=${encodeURIComponent(character.id)}`));

    dismissPlayHabitNudge(cutAt + 1000);
    assert.equal(resolvePlayHabitNudge(metrics), null);

    const laterCut: PlayMetrics = {
      version: 1,
      firstFilmCutAt: cutAt,
      lastFilmCutAt: cutAt + 1000 * 60 * 60 * 48,
    };
    assert.equal(
      resolvePlayHabitNudge(laterCut, laterCut.lastFilmCutAt! + 1000 * 60 * 60 * 12),
      null
    );
    const again = resolvePlayHabitNudge(
      laterCut,
      laterCut.lastFilmCutAt! + 1000 * 60 * 60 * 25
    );
    assert.ok(again);
    assert.match(again!.href, /remix=1/);
  });

  it('persists dismiss under PLAY_HABIT_NUDGE_KEY', () => {
    const storage = installStorage();
    dismissPlayHabitNudge(1_700_000_000_000);
    const raw = storage.get(PLAY_HABIT_NUDGE_KEY);
    assert.ok(raw);
    assert.ok(raw!.includes('dismissedAt'));
  });
});
