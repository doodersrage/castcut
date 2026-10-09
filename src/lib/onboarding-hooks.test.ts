import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const markOnboardingStepDone = mock.fn((_step: string) => true);
mock.module('./onboarding-store', { namedExports: { markOnboardingStepDone } });

afterEach(() => {
  markOnboardingStepDone.mock.resetCalls();
});

describe('onboarding-hooks', async () => {
  const {
    markOnboardingLlmHealthOk,
    markOnboardingComfyHealthOk,
    markOnboardingSystemWorkflowsEnabled,
    markOnboardingWorkflowImported,
    markOnboardingFirstGenerate,
    markOnboardingFirstQueue,
    markOnboardingFirstQueueSuccess,
    markOnboardingGalleryReview,
    markOnboardingWatchFirstFilm,
    markOnboardingDiscoverPalette,
    markOnboardingPinTool,
    markOnboardingSetDensity,
    markOnboardingSetWorkspace,
  } = await import('./onboarding-hooks');

  it('markOnboardingLlmHealthOk marks the llm-health step', () => {
    markOnboardingLlmHealthOk();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['llm-health']);
  });

  it('markOnboardingComfyHealthOk marks the comfy-health step', () => {
    markOnboardingComfyHealthOk();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['comfy-health']);
  });

  it('markOnboardingSystemWorkflowsEnabled marks the system-workflows step', () => {
    markOnboardingSystemWorkflowsEnabled();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['system-workflows']);
  });

  it('markOnboardingWorkflowImported (deprecated) delegates to the system-workflows step', () => {
    markOnboardingWorkflowImported();
    assert.equal(markOnboardingStepDone.mock.calls.length, 1);
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['system-workflows']);
  });

  it('markOnboardingFirstGenerate marks the first-generate step', () => {
    markOnboardingFirstGenerate();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['first-generate']);
  });

  it('markOnboardingFirstQueue marks the first-queue step', () => {
    markOnboardingFirstQueue();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['first-queue']);
  });

  it('markOnboardingFirstQueueSuccess marks the first-queue-success step and returns its result', () => {
    markOnboardingStepDone.mock.mockImplementationOnce(() => false);
    const result = markOnboardingFirstQueueSuccess();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['first-queue-success']);
    assert.equal(result, false);
  });

  it('markOnboardingGalleryReview marks the review-gallery step', () => {
    markOnboardingGalleryReview();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['review-gallery']);
  });

  it('markOnboardingWatchFirstFilm marks the watch-first-film step and returns its result', () => {
    markOnboardingStepDone.mock.mockImplementationOnce(() => false);
    const result = markOnboardingWatchFirstFilm();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['watch-first-film']);
    assert.equal(result, false);
  });

  it('markOnboardingDiscoverPalette marks the discover-palette step', () => {
    markOnboardingDiscoverPalette();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['discover-palette']);
  });

  it('markOnboardingPinTool marks the pin-tool step', () => {
    markOnboardingPinTool();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['pin-tool']);
  });

  it('markOnboardingSetDensity marks the set-density step', () => {
    markOnboardingSetDensity();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['set-density']);
  });

  it('markOnboardingSetWorkspace marks the set-workspace step', () => {
    markOnboardingSetWorkspace();
    assert.deepEqual(markOnboardingStepDone.mock.calls[0]!.arguments, ['set-workspace']);
  });
});
