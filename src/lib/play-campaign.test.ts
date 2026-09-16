import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import {
  bumpPlayCampaignStep,
  completePlayCampaign,
  loadPlayCampaignState,
  PLAY_CAMPAIGN_KEY,
  resolveCampaignLookPackId,
  resolvePlayLoopEntryCharacterId,
  resolvePlayLoopNavHref,
} from './play-campaign';

describe('play campaign helpers', () => {
  it('resolveCampaignLookPackId prefers query over saved', () => {
    assert.equal(
      resolveCampaignLookPackId({ queryLookPackId: ' query ', savedLookPackId: 'saved' }),
      'query'
    );
  });

  it('resolveCampaignLookPackId falls back to saved id', () => {
    assert.equal(
      resolveCampaignLookPackId({ queryLookPackId: '', savedLookPackId: ' lp-resume ' }),
      'lp-resume'
    );
    assert.equal(resolveCampaignLookPackId({ savedLookPackId: 'lp-only' }), 'lp-only');
  });

  it('resolveCampaignLookPackId returns undefined when empty', () => {
    assert.equal(resolveCampaignLookPackId({}), undefined);
    assert.equal(
      resolveCampaignLookPackId({ queryLookPackId: '  ', savedLookPackId: '' }),
      undefined
    );
  });

  it('resolvePlayLoopEntryCharacterId prefers query over active Cast', () => {
    assert.equal(
      resolvePlayLoopEntryCharacterId({ queryCharacterId: 'char-q', activeCharacterId: 'char-a' }),
      'char-q'
    );
    assert.equal(
      resolvePlayLoopEntryCharacterId({ queryCharacterId: '', activeCharacterId: 'char-a' }),
      'char-a'
    );
    assert.equal(
      resolvePlayLoopEntryCharacterId({ queryCharacterId: null, activeCharacterId: null }),
      null
    );
  });

  it('resolvePlayLoopNavHref appends active Cast to Film-loop paths', () => {
    assert.equal(resolvePlayLoopNavHref('/story', 'char-a'), '/story?character=char-a');
    assert.equal(
      resolvePlayLoopNavHref('/fitting?from=look', 'char-b'),
      '/fitting?from=look&character=char-b'
    );
    assert.equal(
      resolvePlayLoopNavHref('/story?character=keep', 'char-a'),
      '/story?character=keep'
    );
    assert.equal(resolvePlayLoopNavHref('/dashboard', 'char-a'), '/dashboard');
    assert.equal(resolvePlayLoopNavHref('/m/day', 'char-c'), '/m/day?character=char-c');
  });

  it('bumpPlayCampaignStep advances monotonically and skips other characters', () => {
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

    const first = bumpPlayCampaignStep({ characterId: 'char-a', stepId: 'fitting' });
    assert.equal(first?.stepIndex, 2);
    const back = bumpPlayCampaignStep({ characterId: 'char-a', stepId: 'moodboard' });
    assert.equal(back?.stepIndex, 2);
    const day = bumpPlayCampaignStep({ characterId: 'char-a', stepId: 'day' });
    assert.equal(day?.stepIndex, 3);
    const skipped = bumpPlayCampaignStep({ characterId: 'char-b', stepId: 'roleplay' });
    assert.equal(skipped, null);
    assert.equal(loadPlayCampaignState()?.characterId, 'char-a');
    assert.ok(storage.has(PLAY_CAMPAIGN_KEY) || loadPlayCampaignState()?.stepIndex === 3);
  });

  it('loadPlayCampaignState merges lookPackId from session mirror', () => {
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
    storage.set(
      PLAY_CAMPAIGN_KEY,
      JSON.stringify({
        version: 1,
        characterId: 'char-a',
        stepIndex: 2,
        updatedAt: 1,
      })
    );
    storage.set(
      `s:${PLAY_CAMPAIGN_KEY}`,
      JSON.stringify({
        version: 1,
        characterId: 'char-a',
        lookPackId: 'lp-resume',
        stepIndex: 2,
        updatedAt: 2,
      })
    );
    assert.equal(loadPlayCampaignState()?.lookPackId, 'lp-resume');
  });

  it('completePlayCampaign lands on Day by default (Roleplay optional)', () => {
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

    bumpPlayCampaignStep({ characterId: 'char-z', stepId: 'day' });
    const done = completePlayCampaign({ characterId: 'char-z', stepId: 'day' });
    assert.equal(done?.stepIndex, 3);
    assert.ok(typeof done?.completedAt === 'number' && done.completedAt > 0);
    assert.equal(loadPlayCampaignState()?.completedAt, done?.completedAt);
    assert.equal(completePlayCampaign({ characterId: 'other' }), null);

    const fromRoleplay = completePlayCampaign({ characterId: 'char-z', stepId: 'roleplay' });
    assert.equal(fromRoleplay?.stepIndex, 4);
  });
});
