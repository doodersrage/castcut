import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const resolveRuntimeForQueue = mock.fn((_model: string, _tool?: string) => ({
  apiUrl: 'http://127.0.0.1:8188',
  queueQualityProfile: 'final',
}));
mock.module('./comfyui/runtime-for-model', { namedExports: { resolveRuntimeForQueue } });

const registerComfyGalleryJob = mock.fn((_input: unknown) => ({}) as unknown);
mock.module('./gallery/comfyui-gallery-client', { namedExports: { registerComfyGalleryJob } });

const scheduleComfyGalleryPoll = mock.fn((_promptId: string, _opts?: unknown) => Promise.resolve(null));
mock.module('./gallery/comfyui-gallery-poller', { namedExports: { scheduleComfyGalleryPoll } });

type QueueResult = {
  ok: boolean;
  promptId?: string;
  clientId?: string;
  comfyUrl?: string;
  releaseLiveSocket: () => void;
};
let postComfyUiPromptImpl: (body: unknown) => Promise<QueueResult> = async () => ({
  ok: true,
  promptId: 'p-1',
  clientId: 'c-1',
  comfyUrl: 'http://127.0.0.1:8188',
  releaseLiveSocket: () => {},
});
const postComfyUiPrompt = mock.fn((body: unknown) => postComfyUiPromptImpl(body));
mock.module('./comfyui/queue-request', { namedExports: { postComfyUiPrompt } });

const loadActiveProjectId = mock.fn(() => 'project-1');
mock.module('./prompt-projects', { namedExports: { loadActiveProjectId } });

const injectLoraTriggers = mock.fn((prompt: string) => prompt);
mock.module('./lora-prompt-injection', { namedExports: { injectLoraTriggers } });

const resolveQueueParams = mock.fn((input: Record<string, unknown>) => ({ resolved: true, ...input }));
mock.module('./queue-params-settings', { namedExports: { resolveQueueParams } });

let guardImpl: (input: unknown) => Promise<{ profile: string; runtime?: unknown }> = async input => ({
  profile: 'final',
  runtime: (input as { runtime?: unknown }).runtime,
});
const guardQueueQualityForVram = mock.fn((input: unknown) => guardImpl(input));
mock.module('./vram-queue-guard', { namedExports: { guardQueueQualityForVram } });

let holdImpl: (input: unknown) => Promise<{ held: boolean; count?: number }> = async () => ({
  held: false,
});
const maybeHoldMaxGenerateJobs = mock.fn((input: unknown) => holdImpl(input));
mock.module('./held-max-queue', { namedExports: { maybeHoldMaxGenerateJobs } });

let prepareImpl: (input: { positive: string; explicitNegative?: string }) => Promise<{
  positive: string;
  negative?: string;
}> = async input => ({ positive: input.positive, negative: input.explicitNegative });
const prepareQueuePrompts = mock.fn(
  (input: { positive: string; explicitNegative?: string }) => prepareImpl(input)
);
mock.module('./queue-prompt-prep', { namedExports: { prepareQueuePrompts } });

function resetMocks() {
  for (const m of [
    resolveRuntimeForQueue,
    registerComfyGalleryJob,
    scheduleComfyGalleryPoll,
    postComfyUiPrompt,
    loadActiveProjectId,
    injectLoraTriggers,
    resolveQueueParams,
    guardQueueQualityForVram,
    maybeHoldMaxGenerateJobs,
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
  guardImpl = async input => ({ profile: 'final', runtime: (input as { runtime?: unknown }).runtime });
  holdImpl = async () => ({ held: false });
  prepareImpl = async input => ({ positive: input.positive, negative: input.explicitNegative });
}

afterEach(resetMocks);

describe('seed-experiment-queue', async () => {
  const { queueSeedExperiment } = await import('./seed-experiment-queue');

  it('defaults count to 4 and queues that many distinct-seed jobs', async () => {
    const result = await queueSeedExperiment({ prompt: 'a cat', model: 'sdxl' });
    assert.equal(result.queued, 4);
    assert.equal(result.held, 0);
    assert.equal(result.seeds.length, 4);
    assert.equal(registerComfyGalleryJob.mock.calls.length, 4);
    assert.equal(new Set(result.seeds).size, 4);
  });

  it('clamps count to the [2, 12] range', async () => {
    const tooFew = await queueSeedExperiment({ prompt: 'x', model: 'sdxl', count: 0 });
    assert.equal(tooFew.seeds.length, 2);
    const tooMany = await queueSeedExperiment({ prompt: 'x', model: 'sdxl', count: 50 });
    assert.equal(tooMany.seeds.length, 12);
  });

  it('uses the shared seed only for the first job, generating random seeds after', async () => {
    const result = await queueSeedExperiment({
      prompt: 'x',
      model: 'sdxl',
      count: 3,
      sharedSeed: 'seed-fixed',
    });
    assert.equal(result.seeds[0], 'seed-fixed');
    assert.notEqual(result.seeds[1], 'seed-fixed');
    assert.notEqual(result.seeds[2], 'seed-fixed');
  });

  it('counts held jobs without queuing them', async () => {
    holdImpl = async () => ({ held: true });
    const result = await queueSeedExperiment({ prompt: 'x', model: 'sdxl', count: 3 });
    assert.equal(result.queued, 0);
    assert.equal(result.held, 3);
    assert.equal(postComfyUiPrompt.mock.calls.length, 0);
  });

  it('skips a job whose queue request fails, releasing the live socket', async () => {
    let released = 0;
    postComfyUiPromptImpl = async () => ({
      ok: false,
      releaseLiveSocket: () => {
        released += 1;
      },
    });
    const result = await queueSeedExperiment({ prompt: 'x', model: 'sdxl', count: 2 });
    assert.equal(result.queued, 0);
    assert.equal(released, 2);
    assert.equal(registerComfyGalleryJob.mock.calls.length, 0);
  });

  it('skips a job whose queue request lacks a promptId', async () => {
    postComfyUiPromptImpl = async () => ({ ok: true, releaseLiveSocket: () => {} });
    const result = await queueSeedExperiment({ prompt: 'x', model: 'sdxl', count: 2 });
    assert.equal(result.queued, 0);
    assert.equal(registerComfyGalleryJob.mock.calls.length, 0);
  });

  it('registers each queued job with the active project id and default comfy URL fallback', async () => {
    postComfyUiPromptImpl = async () => ({
      ok: true,
      promptId: 'p-42',
      clientId: 'c-42',
      comfyUrl: undefined,
      releaseLiveSocket: () => {},
    });
    await queueSeedExperiment({ prompt: 'x', model: 'sdxl', count: 2 });
    const call = registerComfyGalleryJob.mock.calls[0]!;
    const arg = call.arguments[0] as { comfyUrl: string; projectId: string; tool: string };
    assert.equal(arg.comfyUrl, 'http://127.0.0.1:8188');
    assert.equal(arg.projectId, 'project-1');
    assert.equal(arg.tool, 'seed-experiment');
  });

  it('injects LoRA triggers into the trimmed prompt and passes explicit negative prompt through', async () => {
    injectLoraTriggers.mock.mockImplementationOnce((prompt: string) => `${prompt} <lora:x:1>`);
    await queueSeedExperiment({
      prompt: '  a dog  ',
      model: 'sdxl',
      negativePrompt: 'blurry',
      count: 2,
    });
    assert.equal(injectLoraTriggers.mock.calls[0]!.arguments[0], 'a dog');
    const prepareCall = prepareQueuePrompts.mock.calls[0]!.arguments[0] as {
      explicitNegative?: string;
    };
    assert.equal(prepareCall.explicitNegative, 'blurry');
  });

  it('schedules a gallery poll for each successfully queued job', async () => {
    await queueSeedExperiment({ prompt: 'x', model: 'sdxl', count: 2 });
    assert.equal(scheduleComfyGalleryPoll.mock.calls.length, 2);
  });
});
