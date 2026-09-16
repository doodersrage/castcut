/**
 * Unit tests for the Play step machine (graph, gates, derive, resume, stall).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPlaySoftAdvance,
  canEnterPlayStep,
  deriveDayPhase,
  derivePlayProgress,
  PLAY_CAMPAIGN_STEPS,
  PLAY_DAY_PHASES,
  resolvePlayStall,
  resolvePlayStepHref,
  resumePlayAction,
} from './play-step-machine';

describe('play-step-machine', () => {
  it('defines a linear graph with Story optional', () => {
    assert.equal(PLAY_CAMPAIGN_STEPS.length, 5);
    assert.equal(PLAY_CAMPAIGN_STEPS[3]?.next, 'roleplay');
    assert.equal(PLAY_CAMPAIGN_STEPS[4]?.optional, true);
    assert.equal(PLAY_DAY_PHASES.length, 4);
  });

  it('resolves step hrefs through the campaign graph', () => {
    assert.equal(resolvePlayStepHref('day'), '/day');
    assert.equal(resolvePlayStepHref('day', 'c1'), '/day?character=c1');
    assert.equal(resolvePlayStepHref('cut', 'c1'), '/day?character=c1');
    assert.equal(resolvePlayStepHref('animate', 'c1'), '/day?character=c1');
    assert.equal(resolvePlayStepHref('character'), '/characters');
    assert.equal(resolvePlayStepHref('fitting', 'c1'), '/fitting?character=c1');
    const withPack = resolvePlayStepHref('fitting', 'c1', {
      version: 1,
      source: 'moodboard',
      characterId: 'c1',
      wardrobeId: 'kit-linen',
      vibePrompt: 'soft morning light',
      savedAt: 1,
    });
    assert.match(withPack, /from=look/);
    assert.match(withPack, /wardrobe=kit-linen/);
  });

  it('locks Story until first film cut', () => {
    assert.equal(canEnterPlayStep('roleplay', {}).ok, false);
    assert.equal(
      canEnterPlayStep('roleplay', { metrics: { version: 1, firstFilmCutAt: Date.now() } }).ok,
      true
    );
    assert.equal(canEnterPlayStep('day', { campaign: { characterId: 'c1', stepIndex: 2 } }).ok, true);
  });

  it('derives progress from look pack ahead of stale stepIndex', () => {
    const progress = derivePlayProgress({
      campaign: { characterId: 'c1', stepIndex: 1 },
      lookPack: {
        version: 1,
        source: 'moodboard',
        characterId: 'c1',
        vibePrompt: 'vibe',
        savedAt: 1,
      },
    });
    assert.equal(progress.resumeStepId, 'fitting');
    assert.equal(progress.effectiveStepIndex, 2);
  });

  it('derives Day micro-phases from stills and clips', () => {
    assert.equal(
      deriveDayPhase({
        completedStills: 0,
        completedClips: 0,
        firstFilmDone: false,
      }),
      'queue'
    );
    assert.equal(
      deriveDayPhase({
        completedStills: 4,
        completedClips: 1,
        firstFilmDone: false,
      }),
      'animate'
    );
    assert.equal(
      deriveDayPhase({
        completedStills: 4,
        completedClips: 4,
        firstFilmDone: false,
      }),
      'cut'
    );
    assert.equal(
      deriveDayPhase({
        completedStills: 4,
        completedClips: 4,
        firstFilmDone: true,
        saves: 0,
        campaignCompleted: true,
      }),
      'save'
    );
  });

  it('resume action prefers Outfit when look pack exists on Look step', () => {
    const resume = resumePlayAction({
      campaign: { characterId: 'c1', stepIndex: 1 },
      lookPack: {
        version: 1,
        source: 'moodboard',
        characterId: 'c1',
        wardrobeId: 'kit-a',
        vibePrompt: 'vibe',
        savedAt: 1,
      },
      completedStills: 0,
      completedClips: 0,
    });
    assert.equal(resume.label, 'Continue to Outfit');
    assert.match(resume.href, /fitting/);
  });

  it('resume action surfaces Animate when stills beat clips', () => {
    const resume = resumePlayAction({
      campaign: { characterId: 'c1', stepIndex: 3 },
      completedStills: 4,
      completedClips: 1,
    });
    assert.match(resume.label, /Animate/i);
    assert.match(resume.href, /day/);
  });

  it('stalls on cut after Keep, else on derived step', () => {
    assert.equal(resolvePlayStall({}), null);
    const cutStall = resolvePlayStall({
      metrics: { version: 1, firstPlayCampaignAt: Date.now() - 60_000 },
      funnel: { keepTryOn: 2, firstFilmCut: 0 },
      completedStills: 0,
    });
    assert.equal(cutStall?.stepId, 'cut');

    const moodboardStall = resolvePlayStall({
      metrics: { version: 1, firstPlayCampaignAt: Date.now() - 60_000 },
      funnel: { firstPlayCampaign: 1, campaignMaxStep: 2 },
      completedStills: 0,
    });
    assert.equal(moodboardStall?.stepId, 'moodboard');
  });

  it('builds soft-advance specs for Outfit and Watch', () => {
    const outfit = buildPlaySoftAdvance('fitting', { characterId: 'c1' });
    assert.equal(outfit.label, 'Outfit');
    assert.match(outfit.href, /fitting/);
    const watch = buildPlaySoftAdvance('watch', { characterId: 'c1' });
    assert.equal(watch.label, 'Watch');
    assert.match(watch.href, /media=films/);
  });
});
