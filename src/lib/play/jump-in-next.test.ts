import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { welcomeSampleFilmShots, buildDemoDayStills } from '../film/welcome-sample-film';
import { summarizePlayFunnel, type LocalObservabilityCounters } from '../server/local-observability';

describe('welcome sample + funnel drop-off', () => {
  it('builds a mute sample Day reel clip', () => {
    const shots = welcomeSampleFilmShots();
    assert.equal(shots.length, 1);
    assert.equal(shots[0]?.kind, 'clip');
    assert.match(shots[0]?.url ?? '', /day-sample-reel\.mp4/);
  });

  it('builds demo day stills for offline Cut practice', () => {
    const stills = buildDemoDayStills();
    assert.equal(stills.length, 4);
    assert.ok(stills.every(still => still.status === 'completed' && still.imageUrl));
    assert.ok(stills.every(still => still.promptId?.startsWith('demo-')));
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
