import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { welcomeSampleFilmShots, buildDemoDayStills } from './welcome-sample-film';
import { LOOK_PRESETS, lookPackFromPreset, tilesFromLookPreset } from './look-presets';
import { summarizePlayFunnel, type LocalObservabilityCounters } from './local-observability';

describe('welcome sample + look presets + funnel drop-off', () => {
  it('builds four sample film stills', () => {
    const shots = welcomeSampleFilmShots();
    assert.equal(shots.length, 4);
    assert.ok(shots.every(shot => shot.kind === 'still' && shot.url.startsWith('data:image/svg')));
    assert.ok(decodeURIComponent(shots[0]!.url).includes('Sample reel'));
  });

  it('builds demo day stills for offline Cut practice', () => {
    const stills = buildDemoDayStills();
    assert.equal(stills.length, 4);
    assert.ok(stills.every(still => still.status === 'completed' && still.imageUrl));
    assert.ok(stills.every(still => still.promptId?.startsWith('demo-')));
  });

  it('seeds moodboard tiles from look presets', () => {
    assert.ok(LOOK_PRESETS.length >= 12);
    const cozy = LOOK_PRESETS.find(entry => entry.id === 'cozy');
    assert.ok(cozy);
    const tiles = tilesFromLookPreset(cozy!);
    assert.equal(tiles.length, 4);
    const pack = lookPackFromPreset(cozy!, 'c1');
    assert.equal(pack.characterId, 'c1');
    assert.match(pack.moodNotes ?? '', /cozy/i);

    const coastal = LOOK_PRESETS.find(entry => entry.id === 'coastal');
    assert.ok(coastal);
    assert.match(lookPackFromPreset(coastal!, undefined).vibePrompt ?? '', /coastal/i);
  });

  it('summarizes welcome → starter → cut drop-off', () => {
    const counters: LocalObservabilityCounters = {
      firstQueueSuccess: 0,
      exactReplay: 0,
      playbookCtaClick: 0,
      queueFailures: 0,
      firstQueueSetupShown: 0,
      firstQueueSetupDismissed: 0,
      firstQueueSetupCompleted: 0,
      firstPlayCampaign: 2,
      firstFilmCut: 1,
      keepTryOn: 0,
      campaignStep: 0,
      campaignMaxStep: 3,
      saveToCast: 0,
      filmCutDay: 1,
      filmCutRoleplay: 0,
      welcomeShown: 10,
      starterFilm: 5,
      starterDayQueue: 4,
      demoDayStills: 1,
      firstQueueSetupStepFails: {},
    };
    const summary = summarizePlayFunnel(counters);
    assert.equal(summary.welcomeToStarterRate, 0.5);
    assert.equal(summary.starterToCutRate, 0.2);
    assert.ok(summary.headline);
  });
});
