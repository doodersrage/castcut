import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPlayPhaseStep,
  countFilmCutsWithinDays,
  formatPlayPhaseDuration,
  daysFromCampaignStartToFirstFilmCut,
  filmsPerWeek,
  firstFilmCutWithinDays,
  PLAY_PHASE_MAX_SAMPLE_MS,
  playPhaseAverages,
  slotKeepRate,
  slowestPlayPhase,
  resolveNextPlayAction,
  resolvePlayFunnelStall,
  resolvePlayFunnelStepHref,
  type PlayMetrics,
} from './play-metrics';

describe('play phase timing', () => {
  const MIN = 60_000;

  it('opens a phase, closes it on the next step, and sums repeat visits', () => {
    const opened = applyPlayPhaseStep({ version: 1 }, 'moodboard', 1_000);
    assert.deepEqual(opened.phaseOpen, { stepId: 'moodboard', at: 1_000 });
    assert.equal(opened.phaseTimings, undefined);

    const moved = applyPlayPhaseStep(opened, 'fitting', 1_000 + 5 * MIN);
    assert.deepEqual(moved.phaseTimings?.moodboard, { totalMs: 5 * MIN, runs: 1 });
    assert.deepEqual(moved.phaseOpen, { stepId: 'fitting', at: 1_000 + 5 * MIN });

    const back = applyPlayPhaseStep(moved, 'moodboard', 1_000 + 7 * MIN);
    const againToDay = applyPlayPhaseStep(back, 'day', 1_000 + 10 * MIN);
    assert.deepEqual(againToDay.phaseTimings?.moodboard, { totalMs: 8 * MIN, runs: 2 });
    assert.deepEqual(againToDay.phaseTimings?.fitting, { totalMs: 2 * MIN, runs: 1 });
  });

  it('keeps the clock running when the same phase is re-entered', () => {
    const opened = applyPlayPhaseStep({ version: 1 }, 'day', 500);
    const same = applyPlayPhaseStep(opened, 'day', 900);
    assert.equal(same, opened);
  });

  it('closes the open phase on an untimed step without opening a new one', () => {
    const opened = applyPlayPhaseStep({ version: 1 }, 'day', 0);
    const done = applyPlayPhaseStep(opened, 'complete', 3 * MIN);
    assert.equal(done.phaseOpen, undefined);
    assert.deepEqual(done.phaseTimings?.day, { totalMs: 3 * MIN, runs: 1 });
    // Cast is not a timed phase either.
    assert.equal(applyPlayPhaseStep({ version: 1 }, 'character', 10).phaseOpen, undefined);
  });

  it('drops walked-away samples instead of inflating the average', () => {
    const opened = applyPlayPhaseStep({ version: 1 }, 'fitting', 0);
    const overnight = applyPlayPhaseStep(opened, 'day', PLAY_PHASE_MAX_SAMPLE_MS + 1);
    assert.equal(overnight.phaseTimings, undefined);
    assert.deepEqual(overnight.phaseOpen, { stepId: 'day', at: PLAY_PHASE_MAX_SAMPLE_MS + 1 });
    // A clock skew backwards is dropped too.
    const skewed = applyPlayPhaseStep(applyPlayPhaseStep({ version: 1 }, 'day', 5_000), 'fitting', 1_000);
    assert.equal(skewed.phaseTimings, undefined);
  });

  it('formats phase durations compactly', () => {
    assert.equal(formatPlayPhaseDuration(0), '0s');
    assert.equal(formatPlayPhaseDuration(-5), '0s');
    assert.equal(formatPlayPhaseDuration(45_000), '45s');
    assert.equal(formatPlayPhaseDuration(59_400), '59s');
    assert.equal(formatPlayPhaseDuration(6 * MIN), '6m');
    assert.equal(formatPlayPhaseDuration(59 * MIN), '59m');
    assert.equal(formatPlayPhaseDuration(60 * MIN), '1h');
    assert.equal(formatPlayPhaseDuration(72 * MIN), '1h 12m');
  });

  it('averages phases and names the slowest', () => {
    assert.deepEqual(playPhaseAverages({ version: 1 }), []);
    assert.equal(slowestPlayPhase({ version: 1 }), null);
    const metrics: PlayMetrics = {
      version: 1,
      phaseTimings: {
        moodboard: { totalMs: 10 * MIN, runs: 2 },
        fitting: { totalMs: 9 * MIN, runs: 1 },
        day: { totalMs: 8 * MIN, runs: 4 },
      },
    };
    assert.deepEqual(
      playPhaseAverages(metrics).map(entry => entry.label),
      ['Look', 'Outfit', 'Day']
    );
    const slowest = slowestPlayPhase(metrics);
    assert.equal(slowest?.phase, 'fitting');
    assert.equal(slowest?.label, 'Outfit');
    assert.equal(slowest?.avgMs, 9 * MIN);
    assert.equal(slowest?.runs, 1);
  });
});

describe('play-metrics', () => {
  it('counts recent cuts and averages films per week', () => {
    const day = 1000 * 60 * 60 * 24;
    const now = 100 * day;
    const metrics: PlayMetrics = {
      version: 1,
      filmCutHistory: [now - 40 * day, now - 20 * day, now - 10 * day, now - 1 * day, now],
    };
    assert.equal(countFilmCutsWithinDays(7, metrics, now), 2);
    assert.equal(countFilmCutsWithinDays(28, metrics, now), 4);
    assert.equal(filmsPerWeek(metrics, now), 1);
    assert.equal(filmsPerWeek({ version: 1 }, now), null);
    assert.equal(filmsPerWeek({ version: 1, filmCutHistory: [now - 90 * day] }, now), null);
  });

  it('computes the slot keep rate from quality-gate outcomes', () => {
    assert.equal(slotKeepRate({ version: 1 }), null);
    assert.equal(
      slotKeepRate({ version: 1, slotReviews: { keep: 3, reroll: 1, flag: 0 } }),
      0.75
    );
  });

  it('computes days from campaign start to first film cut', () => {
    const day = 1000 * 60 * 60 * 24;
    const metrics: PlayMetrics = {
      version: 1,
      firstPlayCampaignAt: 1_000_000,
      firstFilmCutAt: 1_000_000 + day * 2,
    };
    assert.equal(daysFromCampaignStartToFirstFilmCut(metrics), 2);
    assert.equal(firstFilmCutWithinDays(3, metrics), true);
    assert.equal(firstFilmCutWithinDays(1, metrics), false);
  });

  it('returns null when funnel timestamps are incomplete', () => {
    assert.equal(daysFromCampaignStartToFirstFilmCut({ version: 1 }), null);
    assert.equal(
      firstFilmCutWithinDays(7, { version: 1, firstPlayCampaignAt: Date.now() }),
      null
    );
  });

  it('resolves next Play action from funnel stalls', () => {
    assert.equal(resolveNextPlayAction({}).href, '/play');
    assert.equal(
      resolveNextPlayAction({ funnel: { firstPlayCampaign: 2, firstFilmCut: 0 } }).href,
      '/day'
    );
    assert.equal(
      resolveNextPlayAction({ funnel: { keepTryOn: 3, firstFilmCut: 0 } }).label,
      'Continue to Day'
    );
    assert.equal(
      resolveNextPlayAction({ funnel: { firstFilmCut: 1, saveToCast: 0 } }).href,
      '/characters'
    );
    const resume = resolveNextPlayAction({
      campaign: { characterId: 'c1', stepIndex: 2 },
    });
    assert.equal(resume.href, '/fitting?character=c1');
    assert.match(resume.label, /Outfit/i);
  });

  it('pushes Cast watch then another Day cut after campaign complete', () => {
    const save = resolveNextPlayAction({
      funnel: { firstFilmCut: 1, saveToCast: 0 },
      campaign: { characterId: 'c1', stepIndex: 4, completedAt: Date.now() },
    });
    assert.equal(save.label, 'Save film to Cast');
    assert.equal(save.href, '/day?character=c1');

    const watch = resolveNextPlayAction({
      funnel: { firstFilmCut: 1, saveToCast: 1 },
      campaign: { characterId: 'c1', stepIndex: 4, completedAt: Date.now() },
      watchedFirstFilm: false,
    });
    assert.equal(watch.label, 'Watch film on Cast');
    assert.equal(watch.href, '/characters/c1?media=films');

    const again = resolveNextPlayAction({
      funnel: { firstFilmCut: 1, saveToCast: 1 },
      campaign: { characterId: 'c1', stepIndex: 4, completedAt: Date.now() },
      watchedFirstFilm: true,
    });
    assert.equal(again.label, 'Cut another Day film');
    assert.equal(again.href, '/day?character=c1&from=look&remix=1&autoqueue=1');
  });

  it('detects funnel stall before first film cut', () => {
    assert.equal(resolvePlayFunnelStall({}), null);
    assert.equal(
      resolvePlayFunnelStall({
        metrics: { version: 1, firstFilmCutAt: Date.now() },
      }),
      null
    );
    const cutStall = resolvePlayFunnelStall({
      metrics: { version: 1, firstPlayCampaignAt: Date.now() - 60_000 },
      funnel: { keepTryOn: 2, firstFilmCut: 0 },
    });
    assert.equal(cutStall?.stepId, 'cut');
    assert.match(cutStall?.reason ?? '', /Cut film/i);

    const moodboardStall = resolvePlayFunnelStall({
      metrics: { version: 1, firstPlayCampaignAt: Date.now() - 60_000 },
      funnel: { firstPlayCampaign: 1, campaignMaxStep: 2 },
    });
    assert.equal(moodboardStall?.stepId, 'moodboard');

    const extractedLookStall = resolvePlayFunnelStall({
      metrics: { version: 1, firstPlayCampaignAt: Date.now() - 60_000 },
      funnel: { firstPlayCampaign: 1, campaignMaxStep: 2 },
      campaign: { characterId: 'c1', stepIndex: 1 },
      lookPack: {
        version: 1,
        source: 'moodboard',
        characterId: 'c1',
        vibePrompt: 'soft light',
        savedAt: 1,
      },
    });
    assert.equal(extractedLookStall?.stepId, 'fitting');
  });

  it('resolves funnel step hrefs with optional character id and look pack', () => {
    assert.equal(resolvePlayFunnelStepHref('day'), '/day');
    assert.equal(resolvePlayFunnelStepHref('day', 'c1'), '/day?character=c1');
    assert.equal(resolvePlayFunnelStepHref('cut', 'c1'), '/day?character=c1');
    assert.equal(resolvePlayFunnelStepHref('fitting', 'c1'), '/fitting?character=c1');
    assert.equal(resolvePlayFunnelStepHref('character'), '/characters');
    assert.equal(resolvePlayFunnelStepHref('moodboard', 'c1'), '/moodboard?character=c1');
    const withPack = resolvePlayFunnelStepHref('fitting', 'c1', {
      version: 1,
      source: 'moodboard',
      characterId: 'c1',
      wardrobeId: 'kit-linen',
      vibePrompt: 'soft morning light',
      savedAt: 1,
    });
    assert.match(withPack, /from=look/);
    assert.match(withPack, /wardrobe=kit-linen/);
    assert.match(withPack, /character=c1/);
  });

  it('resume CTAs carry look pack when staged', () => {
    const resume = resolveNextPlayAction({
      campaign: { characterId: 'c1', stepIndex: 2 },
      lookPack: {
        version: 1,
        source: 'moodboard',
        characterId: 'c1',
        wardrobeId: 'kit-a',
        vibePrompt: 'vibe',
        savedAt: 1,
      },
    });
    assert.match(resume.href, /from=look/);
    assert.match(resume.href, /wardrobe=kit-a/);
  });

  it('resume CTA advances to Outfit when look pack exists but campaign is still on Look', () => {
    const resume = resolveNextPlayAction({
      campaign: { characterId: 'c1', stepIndex: 1 },
      lookPack: {
        version: 1,
        source: 'moodboard',
        characterId: 'c1',
        wardrobeId: 'kit-a',
        vibePrompt: 'vibe',
        savedAt: 1,
      },
    });
    assert.equal(resume.label, 'Continue to Outfit');
    assert.match(resume.href, /fitting/);
  });

  it('aligns stall CTA href with stall step (not bare next-action fallback)', () => {
    const fittingStall = resolvePlayFunnelStall({
      metrics: { version: 1, firstPlayCampaignAt: Date.now() - 120_000 },
      funnel: { firstPlayCampaign: 1, campaignMaxStep: 3 },
      campaign: { characterId: 'c1', stepIndex: 2 },
    });
    assert.equal(fittingStall?.stepId, 'fitting');
    assert.equal(
      resolvePlayFunnelStepHref(fittingStall!.stepId, 'c1'),
      '/fitting?character=c1'
    );

    const cutStall = resolvePlayFunnelStall({
      metrics: { version: 1, firstPlayCampaignAt: Date.now() - 60_000 },
      funnel: { keepTryOn: 1, firstFilmCut: 0, campaignMaxStep: 4 },
      campaign: { characterId: 'c1', stepIndex: 3 },
    });
    assert.equal(cutStall?.stepId, 'cut');
    assert.equal(resolvePlayFunnelStepHref(cutStall!.stepId, 'c1'), '/day?character=c1');
  });
});
