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
  rosterFilmLead,
} from './play-campaign';

describe('play campaign helpers', () => {
  it('rosterFilmLead prefers the active Cast, else the most recently updated', () => {
    const roster = [
      { id: 'old', updatedAt: 10 },
      { id: 'new', updatedAt: 30 },
      { id: 'mid', updatedAt: 20 },
    ];
    assert.equal(rosterFilmLead(roster, 'mid')?.id, 'mid');
    assert.equal(rosterFilmLead(roster, 'gone')?.id, 'new');
    assert.equal(rosterFilmLead(roster, undefined)?.id, 'new');
    assert.equal(rosterFilmLead([], 'mid'), undefined);
  });

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

describe('playEffectiveProgressLabel', () => {
  it('names the step the artifacts have reached, not the stale saved index', async () => {
    const { playEffectiveProgressLabel, playCampaignProgressLabel } = await import(
      './play-campaign'
    );
    const campaign = { version: 1 as const, characterId: 'c1', stepIndex: 2, updatedAt: 1 };
    // Outfit is optional (Day dresses the Cast): named, not numbered.
    assert.equal(playCampaignProgressLabel(campaign), 'Film · Outfit (optional)');
    // A kept try-on means Outfit is done — the strip shows Day, and so must the header.
    assert.equal(
      playEffectiveProgressLabel({ campaign, funnel: { keepTryOn: 1 } }),
      'Film · 2 of 3 · Day'
    );
    assert.equal(playEffectiveProgressLabel({ campaign: null, funnel: { keepTryOn: 1 } }), 'Film · start');
  });
});

describe('derivePlayJourney', () => {
  it('counts Cast, Day and Cut film; names Look, Outfit and Story as optional', async () => {
    const { derivePlayJourney } = await import('./play-step-machine');
    const campaign = { characterId: 'c1', stepIndex: 3 };
    const journey = derivePlayJourney({ campaign, completedStills: 1, slotCount: 4 });
    assert.deepEqual(
      journey.steps.map(step => [step.id, step.number, step.optional]),
      [
        ['character', 1, false],
        ['moodboard', null, true],
        ['fitting', null, true],
        ['day', 2, false],
        ['cut', 3, false],
        ['roleplay', null, true],
      ]
    );
    assert.equal(journey.current, 'day');
    assert.equal(journey.label, 'Film · 2 of 3 · Day');
    assert.equal(journey.steps.find(step => step.id === 'character')?.state, 'done');
  });
  it('a full Day of stills moves the film to Cut film (3 of 3)', async () => {
    const { derivePlayJourney } = await import('./play-step-machine');
    const journey = derivePlayJourney({
      campaign: { characterId: 'c1', stepIndex: 3 },
      completedStills: 4,
      completedClips: 4,
      slotCount: 4,
    });
    assert.equal(journey.current, 'cut');
    assert.equal(journey.label, 'Film · 3 of 3 · Cut film');
    assert.equal(journey.steps.find(step => step.id === 'day')?.state, 'done');
  });
  it('no film yet starts at Cast; a completed film is done', async () => {
    const { derivePlayJourney } = await import('./play-step-machine');
    assert.equal(derivePlayJourney({ campaign: null }).label, 'Film · start');
    assert.equal(derivePlayJourney({ campaign: null }).current, 'character');
    const done = derivePlayJourney({
      campaign: { characterId: 'c1', stepIndex: 3, completedAt: 5 },
      funnel: { firstFilmCut: 1 },
    });
    assert.equal(done.label, 'Film · done');
    assert.equal(done.current, null);
  });
});

describe('derivePlayJourney with a picked Cast and no saved film', () => {
  it('starts their film at Day (Cast done); a full Day of stills makes it the cut; old cuts do not count', async () => {
    const { derivePlayJourney } = await import('./play-step-machine');
    const fresh = derivePlayJourney({ campaign: null, activeCharacterId: 'nora', completedStills: 0 });
    assert.equal(fresh.current, 'day');
    assert.equal(fresh.label, 'Film · 2 of 3 · Day');
    assert.equal(fresh.steps.find(step => step.id === 'character')?.state, 'done');
    const stills = derivePlayJourney({
      campaign: null,
      activeCharacterId: 'nora',
      completedStills: 4,
      slotCount: 4,
      funnel: { firstFilmCut: 3 },
      metrics: { version: 1, firstFilmCutAt: 1 },
    });
    assert.equal(stills.current, 'cut');
    assert.equal(stills.steps.find(step => step.id === 'cut')?.state, 'current');
  });
});
