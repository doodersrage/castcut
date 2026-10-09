import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const markOnboardingStepDone = mock.fn((_step: string) => true);
mock.module('./onboarding-store', { namedExports: { markOnboardingStepDone } });

afterEach(() => {
  markOnboardingStepDone.mock.resetCalls();
});

describe('play-onboarding', async () => {
  const { markOnboardingFirstPlayCampaign, markOnboardingFirstFilmCut } = await import(
    './play-onboarding'
  );

  it('markOnboardingFirstPlayCampaign marks the first-play-campaign step and returns its result', () => {
    markOnboardingStepDone.mock.mockImplementationOnce(() => true);
    const result = markOnboardingFirstPlayCampaign();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['first-play-campaign']);
    assert.equal(result, true);
  });

  it('markOnboardingFirstFilmCut marks the first-film-cut step and returns its result', () => {
    markOnboardingStepDone.mock.mockImplementationOnce(() => true);
    const result = markOnboardingFirstFilmCut();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['first-film-cut']);
    assert.equal(result, true);
  });
});
