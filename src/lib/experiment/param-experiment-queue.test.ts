import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ComfyUiQueueRequestResult } from '../comfyui/queue-request';

const registerComfyGalleryJob = mock.fn((_input: unknown) => ({}) as unknown);
mock.module('../gallery/comfyui-gallery-client', { namedExports: { registerComfyGalleryJob } });

const scheduleComfyGalleryPoll = mock.fn((_promptId: string, _opts?: unknown) => Promise.resolve(null));
mock.module('../gallery/comfyui-gallery-poller', { namedExports: { scheduleComfyGalleryPoll } });

type QueueResult = Partial<ComfyUiQueueRequestResult> & { releaseLiveSocket: () => void };
let postComfyUiPromptImpl: (body: unknown) => Promise<QueueResult> = async () => ({
  ok: true,
  promptId: 'p-1',
  clientId: 'c-1',
  comfyUrl: 'http://127.0.0.1:8188',
  releaseLiveSocket: () => {},
});
const postComfyUiPrompt = mock.fn((body: unknown) => postComfyUiPromptImpl(body));
mock.module('../comfyui/queue-request', { namedExports: { postComfyUiPrompt } });

const resolveRuntimeForQueue = mock.fn((_model: string, _tool?: string) => ({
  apiUrl: 'http://127.0.0.1:8188',
  queueQualityProfile: 'final',
}));
mock.module('../comfyui/runtime-for-model', { namedExports: { resolveRuntimeForQueue } });

const resolveQueueParams = mock.fn((input: Record<string, unknown>) => ({ resolved: true, ...input }));
mock.module('../queue/params-settings', { namedExports: { resolveQueueParams } });

let guardImpl: (input: unknown) => Promise<{ profile: string; runtime?: unknown; downgraded: boolean }> =
  async input => ({ profile: 'final', runtime: (input as { runtime?: unknown }).runtime, downgraded: false });
const guardQueueQualityForVram = mock.fn((input: unknown) => guardImpl(input));
mock.module('../queue/vram-queue-guard', { namedExports: { guardQueueQualityForVram } });

let holdImpl: (input: unknown) => Promise<{ held: boolean; count: number }> = async () => ({
  held: false,
  count: 0,
});
const maybeHoldMaxGenerateJobs = mock.fn((input: unknown) => holdImpl(input));
mock.module('../queue/held-max-queue', { namedExports: { maybeHoldMaxGenerateJobs } });

const injectLoraTriggers = mock.fn((prompt: string) => prompt);
mock.module('../lora/prompt-injection', { namedExports: { injectLoraTriggers } });

let prepareImpl: (input: { positive: string; explicitNegative?: string }) => Promise<{
  positive: string;
  negative?: string;
}> = async input => ({ positive: input.positive, negative: input.explicitNegative });
const prepareQueuePrompts = mock.fn((input: { positive: string; explicitNegative?: string }) =>
  prepareImpl(input)
);
mock.module('../queue/prompt-prep', { namedExports: { prepareQueuePrompts } });

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

describe('param-experiment-queue', async () => {
  const { queueParamExperiment } = await import('./param-experiment-queue');

  it('defaults to the cfg axis with 4 values for a plain model', async () => {
    const result = await queueParamExperiment({ prompt: 'x', model: 'sdxl' });
    assert.equal(result.queued, 4);
    assert.equal(result.held, 0);
    assert.deepEqual(result.labels, ['cfg=5', 'cfg=6', 'cfg=7', 'cfg=8']);
    assert.equal(result.redirectedAxis, undefined);
  });

  it('clamps count to the [2, 8] range', async () => {
    const tooFew = await queueParamExperiment({ prompt: 'x', model: 'sdxl', axis: 'cfg', count: 0 });
    assert.equal(tooFew.labels.length, 2);
    const tooMany = await queueParamExperiment({ prompt: 'x', model: 'sdxl', axis: 'cfg', count: 20 });
    assert.equal(tooMany.labels.length, 8);
  });

  it('redirects a Lightning model off the cfg axis onto seed, and labels it as redirected', async () => {
    const result = await queueParamExperiment({
      prompt: 'x',
      model: 'qwen-image-2512-lightning-4',
      axis: 'cfg',
      count: 2,
    });
    assert.equal(result.redirectedAxis, 'cfg');
    assert.equal(result.labels.length, 2);
    assert.ok(result.labels[0]!.startsWith('cfg→seed='));
  });

  it('redirects a Lightning model off the steps axis onto seed', async () => {
    const result = await queueParamExperiment({
      prompt: 'x',
      model: 'qwen-image-2512-lightning-4',
      axis: 'steps',
      count: 2,
    });
    assert.equal(result.redirectedAxis, 'steps');
    assert.ok(result.labels[0]!.startsWith('steps→seed='));
  });

  it('does not redirect a Lightning model on the seed or width axis', async () => {
    const result = await queueParamExperiment({
      prompt: 'x',
      model: 'qwen-image-2512-lightning-4',
      axis: 'width',
      count: 2,
    });
    assert.equal(result.redirectedAxis, undefined);
    for (const label of result.labels) {
      assert.match(label, /^size=\d+x\d+$/);
    }
  });

  it('sweeps the width axis with official Qwen size ladder values for a Qwen model', async () => {
    const result = await queueParamExperiment({
      prompt: 'x',
      model: 'qwen-image-edit',
      axis: 'width',
      count: 3,
    });
    assert.equal(result.labels.length, 3);
    for (const label of result.labels) {
      assert.match(label, /^size=\d+x\d+$/);
    }
  });

  it('sweeps the width axis with plain px values for a non-Qwen model', async () => {
    const result = await queueParamExperiment({
      prompt: 'x',
      model: 'sdxl',
      axis: 'width',
      count: 2,
    });
    assert.deepEqual(result.labels, ['width=768', 'width=896']);
  });

  it('uses explicit values when given, capped to count', async () => {
    const result = await queueParamExperiment({
      prompt: 'x',
      model: 'sdxl',
      axis: 'cfg',
      count: 2,
      values: ['11', '12', '13'],
    });
    assert.deepEqual(result.labels, ['cfg=11', 'cfg=12']);
  });

  it('counts a held value without queuing it', async () => {
    holdImpl = async () => ({ held: true, count: 1 });
    const result = await queueParamExperiment({ prompt: 'x', model: 'sdxl', axis: 'cfg', count: 2 });
    assert.equal(result.queued, 0);
    assert.equal(result.held, 2);
  });

  it('skips a value whose queue request fails', async () => {
    postComfyUiPromptImpl = async () => ({ ok: false, releaseLiveSocket: () => {} });
    const result = await queueParamExperiment({ prompt: 'x', model: 'sdxl', axis: 'cfg', count: 2 });
    assert.equal(result.queued, 0);
    assert.equal(registerComfyGalleryJob.mock.calls.length, 0);
  });

  it('sweeps the steps axis with the expected default ladder', async () => {
    const result = await queueParamExperiment({ prompt: 'x', model: 'sdxl', axis: 'steps', count: 3 });
    assert.deepEqual(result.labels, ['steps=16', 'steps=20', 'steps=24']);
  });
});
