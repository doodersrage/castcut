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

function resetMocks() {
  for (const m of [
    registerComfyGalleryJob,
    scheduleComfyGalleryPoll,
    postComfyUiPrompt,
    resolveRuntimeForQueue,
    resolveQueueParams,
    guardQueueQualityForVram,
    maybeHoldMaxGenerateJobs,
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
}

afterEach(resetMocks);

describe('model-shootout', async () => {
  const { DEFAULT_SHOOTOUT_MODELS, queueSameSeedShootout, queueFamilySameSeedShootout } =
    await import('./model-shootout');

  describe('DEFAULT_SHOOTOUT_MODELS', () => {
    it('lists 4 default models with non-empty labels', () => {
      assert.equal(DEFAULT_SHOOTOUT_MODELS.length, 4);
      for (const entry of DEFAULT_SHOOTOUT_MODELS) {
        assert.ok(entry.model.length > 0);
        assert.ok(entry.label.length > 0);
      }
    });
  });

  describe('queueSameSeedShootout', () => {
    it('queues one job per model, all sharing the given seed', async () => {
      const result = await queueSameSeedShootout({
        prompt: 'a prompt',
        models: ['sdxl', 'sd1.5'],
        seed: 42,
      });
      assert.deepEqual(result, { queued: 2, held: 0, errors: [] });
      assert.equal(resolveQueueParams.mock.calls.length, 2);
      for (const call of resolveQueueParams.mock.calls) {
        const arg = call.arguments[0] as { base?: { seed?: string } };
        assert.equal(arg.base?.seed, '42');
      }
      assert.equal(registerComfyGalleryJob.mock.calls.length, 2);
    });

    it('counts a held job without queuing it', async () => {
      holdImpl = async () => ({ held: true, count: 1 });
      const result = await queueSameSeedShootout({ prompt: 'x', models: ['sdxl'], seed: 1 });
      assert.deepEqual(result, { queued: 0, held: 1, errors: [] });
    });

    it('records a per-model error and continues when the queue request fails', async () => {
      postComfyUiPromptImpl = async () => ({
        ok: false,
        error: 'boom',
        releaseLiveSocket: () => {},
      });
      const result = await queueSameSeedShootout({ prompt: 'x', models: ['sdxl'], seed: 1 });
      assert.deepEqual(result, { queued: 0, held: 0, errors: ['boom'] });
    });

    it('records a generic error message when the queue request fails without one', async () => {
      postComfyUiPromptImpl = async () => ({ ok: false, releaseLiveSocket: () => {} });
      const result = await queueSameSeedShootout({ prompt: 'x', models: ['sdxl'], seed: 1 });
      assert.deepEqual(result.errors, ['Failed for sdxl']);
    });

    it('catches a thrown error for one model and continues to the next', async () => {
      let call = 0;
      guardImpl = async input => {
        call += 1;
        if (call === 1) {
          throw new Error('vram probe failed');
        }
        return { profile: 'final', runtime: (input as { runtime?: unknown }).runtime, downgraded: false };
      };
      const result = await queueSameSeedShootout({ prompt: 'x', models: ['sdxl', 'sd1.5'], seed: 1 });
      assert.deepEqual(result, { queued: 1, held: 0, errors: ['vram probe failed'] });
    });
  });

  describe('queueFamilySameSeedShootout', () => {
    it('resolves real family peers for a known model and queues one job per peer', async () => {
      const result = await queueFamilySameSeedShootout({ prompt: 'x', model: 'sdxl', seed: 7 });
      assert.deepEqual(result.models, ['sdxl', 'sdxl-refiner', 'ssd-1b', 'segmind-vega']);
      assert.equal(result.queued, 4);
      assert.equal(result.held, 0);
      assert.deepEqual(result.errors, []);
    });

    it('returns an error and no models for a model with no known family peers', async () => {
      const result = await queueFamilySameSeedShootout({
        prompt: 'x',
        model: 'not-a-real-model-id',
        seed: 1,
      });
      assert.deepEqual(result, {
        queued: 0,
        held: 0,
        errors: ['No family peers for not-a-real-model-id'],
        models: [],
      });
      assert.equal(postComfyUiPrompt.mock.calls.length, 0);
    });
  });
});
