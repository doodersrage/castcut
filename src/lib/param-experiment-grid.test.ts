import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ComfyUiQueueRequestResult } from './comfyui/queue-request';

const registerComfyGalleryJob = mock.fn((_input: unknown) => ({}) as unknown);
mock.module('./gallery/comfyui-gallery-client', { namedExports: { registerComfyGalleryJob } });

const scheduleComfyGalleryPoll = mock.fn((_promptId: string, _opts?: unknown) => Promise.resolve(null));
mock.module('./gallery/comfyui-gallery-poller', { namedExports: { scheduleComfyGalleryPoll } });

type QueueResult = Partial<ComfyUiQueueRequestResult> & { releaseLiveSocket: () => void };
let postComfyUiPromptImpl: (body: unknown) => Promise<QueueResult> = async () => ({
  ok: true,
  promptId: 'p-1',
  clientId: 'c-1',
  comfyUrl: 'http://127.0.0.1:8188',
  releaseLiveSocket: () => {},
});
const postComfyUiPrompt = mock.fn((body: unknown) => postComfyUiPromptImpl(body));
mock.module('./comfyui/queue-request', { namedExports: { postComfyUiPrompt } });

const resolveRuntimeForQueue = mock.fn((_model: string, _tool?: string) => ({
  apiUrl: 'http://127.0.0.1:8188',
  queueQualityProfile: 'final',
}));
mock.module('./comfyui/runtime-for-model', { namedExports: { resolveRuntimeForQueue } });

const resolveQueueParams = mock.fn((input: Record<string, unknown>) => ({ resolved: true, ...input }));
mock.module('./queue-params-settings', { namedExports: { resolveQueueParams } });

let guardImpl: (input: unknown) => Promise<{ profile: string; runtime?: unknown; downgraded: boolean }> =
  async input => ({ profile: 'final', runtime: (input as { runtime?: unknown }).runtime, downgraded: false });
const guardQueueQualityForVram = mock.fn((input: unknown) => guardImpl(input));
mock.module('./vram-queue-guard', { namedExports: { guardQueueQualityForVram } });

let holdImpl: (input: unknown) => Promise<{ held: boolean; count: number }> = async () => ({
  held: false,
  count: 0,
});
const maybeHoldMaxGenerateJobs = mock.fn((input: unknown) => holdImpl(input));
mock.module('./held-max-queue', { namedExports: { maybeHoldMaxGenerateJobs } });

const injectLoraTriggers = mock.fn((prompt: string) => prompt);
mock.module('./lora-prompt-injection', { namedExports: { injectLoraTriggers } });

let prepareImpl: (input: { positive: string; explicitNegative?: string }) => Promise<{
  positive: string;
  negative?: string;
}> = async input => ({ positive: input.positive, negative: input.explicitNegative });
const prepareQueuePrompts = mock.fn((input: { positive: string; explicitNegative?: string }) =>
  prepareImpl(input)
);
mock.module('./queue-prompt-prep', { namedExports: { prepareQueuePrompts } });

function resetMocks() {
  for (const m of [
    registerComfyGalleryJob,
    scheduleComfyGalleryPoll,
    postComfyUiPrompt,
    resolveRuntimeForQueue,
    resolveQueueParams,
    guardQueueQualityForVram,
    maybeHoldMaxGenerateJobs,
    injectLoraTriggers,
    prepareQueuePrompts,
  ]) {
    m.mock.resetCalls();
  }
  postComfyUiPromptImpl = async () => ({
    ok: true,
    promptId: 'p-1',
    clientId: 'c-1',
    comfyUrl: 'http://127.0.0.1:8188',
    releaseLiveSocket: () => {},
  });
  guardImpl = async input => ({
    profile: 'final',
    runtime: (input as { runtime?: unknown }).runtime,
    downgraded: false,
  });
  holdImpl = async () => ({ held: false, count: 0 });
  prepareImpl = async input => ({ positive: input.positive, negative: input.explicitNegative });
}

afterEach(resetMocks);

describe('param-experiment-grid', async () => {
  const { queueParamExperimentGrid } = await import('./param-experiment-grid');

  it('is skipped with a reason for a Qwen Lightning model (CFG/steps locked)', async () => {
    const result = await queueParamExperimentGrid({ prompt: 'x', model: 'qwen-image-2512-lightning-4' });
    assert.deepEqual(result, {
      queued: 0,
      held: 0,
      cells: [],
      skippedReason:
        'Lightning locks CFG and steps — CFG×steps grids are skipped. Use seed experiments instead.',
    });
    assert.equal(postComfyUiPrompt.mock.calls.length, 0);
  });

  it('queues the full default 4x4 grid for a non-Lightning model', async () => {
    const result = await queueParamExperimentGrid({ prompt: 'a scene', model: 'sdxl' });
    assert.equal(result.queued, 16);
    assert.equal(result.held, 0);
    assert.equal(result.cells.length, 16);
    assert.equal(result.skippedReason, undefined);
    assert.equal(result.cells[0], 'cfg=6,steps=18');
    assert.equal(postComfyUiPrompt.mock.calls.length, 16);
  });

  it('caps cfgValues/stepValues at 4 entries and builds only that grid', async () => {
    const result = await queueParamExperimentGrid({
      prompt: 'x',
      model: 'sdxl',
      cfgValues: ['1', '2', '3', '4', '5'],
      stepValues: ['10', '20'],
    });
    assert.equal(result.cells.length, 8);
    assert.equal(result.cells[0], 'cfg=1,steps=10');
    assert.equal(result.cells[7], 'cfg=4,steps=20');
  });

  it('counts held cells without queuing them', async () => {
    holdImpl = async () => ({ held: true, count: 1 });
    const result = await queueParamExperimentGrid({
      prompt: 'x',
      model: 'sdxl',
      cfgValues: ['1'],
      stepValues: ['10'],
    });
    assert.deepEqual(result, { queued: 0, held: 1, cells: ['cfg=1,steps=10'] });
  });

  it('skips a cell whose queue request fails', async () => {
    postComfyUiPromptImpl = async () => ({ ok: false, releaseLiveSocket: () => {} });
    const result = await queueParamExperimentGrid({
      prompt: 'x',
      model: 'sdxl',
      cfgValues: ['1'],
      stepValues: ['10'],
    });
    assert.equal(result.queued, 0);
    assert.equal(registerComfyGalleryJob.mock.calls.length, 0);
  });

  it('passes negativePrompt through prepareQueuePrompts as explicitNegative', async () => {
    await queueParamExperimentGrid({
      prompt: 'x',
      model: 'sdxl',
      negativePrompt: 'blurry',
      cfgValues: ['1'],
      stepValues: ['10'],
    });
    assert.equal(prepareQueuePrompts.mock.calls[0]!.arguments[0]!.explicitNegative, 'blurry');
  });
});
