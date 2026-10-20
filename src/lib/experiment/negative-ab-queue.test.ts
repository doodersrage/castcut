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

let usesNegativeImpl = (_model: string) => false;
const modelUsesNegativePrompt = mock.fn((model: string) => usesNegativeImpl(model));
mock.module('../prompt/pair', { namedExports: { modelUsesNegativePrompt } });

let resolveNegImpl: (input: unknown) => Promise<string | undefined> = async () => 'auto-negative';
const resolveQueueNegativePrompt = mock.fn((input: unknown) => resolveNegImpl(input));
mock.module('../queue/negative', { namedExports: { resolveQueueNegativePrompt } });

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
    modelUsesNegativePrompt,
    resolveQueueNegativePrompt,
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
  usesNegativeImpl = () => false;
  resolveNegImpl = async () => 'auto-negative';
  prepareImpl = async input => ({ positive: input.positive, negative: input.explicitNegative });
}

afterEach(resetMocks);

describe('negative-ab-queue', async () => {
  const { queueNegativeAbTest } = await import('./negative-ab-queue');

  it('queues with-negative and without-negative variants when the model ignores negatives by default', async () => {
    const result = await queueNegativeAbTest({ prompt: 'a scene', model: 'sdxl' });
    assert.equal(result.queued, 2);
    assert.equal(result.held, 0);
    assert.ok(result.seed.length > 0);
    assert.equal(postComfyUiPrompt.mock.calls.length, 2);
    const prompts = postComfyUiPrompt.mock.calls.map(
      call => (call.arguments[0] as { prompt: string }).prompt
    );
    assert.ok(prompts[0]!.includes('[with-negative]'));
    assert.ok(prompts[1]!.includes('[without-negative]'));
  });

  it('auto-resolves negativeA and adds an alt-negative variant when negativeB differs', async () => {
    usesNegativeImpl = () => true;
    const result = await queueNegativeAbTest({
      prompt: 'a scene',
      model: 'flux-2-klein',
      negativeB: 'a different negative',
    });
    assert.equal(result.queued, 3);
    assert.equal(resolveQueueNegativePrompt.mock.calls.length, 1);
    const prompts = postComfyUiPrompt.mock.calls.map(
      call => (call.arguments[0] as { prompt: string }).prompt
    );
    assert.ok(prompts[2]!.includes('[alt-negative]'));
  });

  it('skips the alt-negative variant when negativeB equals the resolved negativeA', async () => {
    usesNegativeImpl = () => true;
    resolveNegImpl = async () => 'same-negative';
    const result = await queueNegativeAbTest({
      prompt: 'a scene',
      model: 'flux-2-klein',
      negativeB: 'same-negative',
    });
    assert.equal(result.queued, 2);
  });

  it('uses the given sharedSeed instead of generating one', async () => {
    const result = await queueNegativeAbTest({ prompt: 'x', model: 'sdxl', sharedSeed: 'fixed-seed' });
    assert.equal(result.seed, 'fixed-seed');
  });

  it('counts a held variant without queuing it', async () => {
    holdImpl = async () => ({ held: true, count: 1 });
    const result = await queueNegativeAbTest({ prompt: 'x', model: 'sdxl' });
    assert.equal(result.queued, 0);
    assert.equal(result.held, 2);
  });

  it('skips a variant whose queue request fails', async () => {
    postComfyUiPromptImpl = async () => ({ ok: false, releaseLiveSocket: () => {} });
    const result = await queueNegativeAbTest({ prompt: 'x', model: 'sdxl' });
    assert.equal(result.queued, 0);
    assert.equal(registerComfyGalleryJob.mock.calls.length, 0);
  });

  it('passes explicit negativeA through without calling resolveQueueNegativePrompt', async () => {
    usesNegativeImpl = () => true;
    const result = await queueNegativeAbTest({
      prompt: 'x',
      model: 'flux-2-klein',
      negativeA: 'explicit-negative',
    });
    // For a negative-prompt model, negativeB always defaults to '' when not
    // given, which differs from negativeA ('explicit-negative') -- so the
    // alt-negative variant is still queued alongside with/without-negative.
    assert.equal(result.queued, 3);
    assert.equal(resolveQueueNegativePrompt.mock.calls.length, 0);
  });
});
