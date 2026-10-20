import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ScheduledBatchConfig } from './scheduled-batch';

let avoidedBodyImpl: () => Record<string, unknown> = () => ({});
const avoidedTokensRequestBody = mock.fn(() => avoidedBodyImpl());
mock.module('../prompt/avoided-tokens', { namedExports: { avoidedTokensRequestBody } });

let rankImpl: (prompts: string[], keep: number) => Promise<string[]> = async (prompts, keep) =>
  prompts.slice(0, keep);
const rankPromptsWithLlm = mock.fn((prompts: string[], keep: number) => rankImpl(prompts, keep));
mock.module('../best-of-n/rank', { namedExports: { rankPromptsWithLlm } });

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;
function installFetchStub(impl: FetchImpl) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(impl(url, init));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

function baseConfig(overrides: Partial<ScheduledBatchConfig> = {}): ScheduledBatchConfig {
  return {
    enabled: true,
    intervalMinutes: 60,
    target: 'random-scene',
    count: 2,
    autoQueueComfyUi: false,
    ...overrides,
  };
}

afterEach(() => {
  avoidedTokensRequestBody.mock.resetCalls();
  rankPromptsWithLlm.mock.resetCalls();
  avoidedBodyImpl = () => ({});
  rankImpl = async (prompts, keep) => prompts.slice(0, keep);
});

describe('scheduled-batch-generate', async () => {
  const { generateScheduledBatchPrompts, resolveScheduledBatchModelDetail, rankScheduledBatchPrompts } =
    await import('./scheduled-batch-generate');

  describe('generateScheduledBatchPrompts', () => {
    it('target=topics: posts one batch request and collects trimmed prompts from results', async () => {
      const stub = installFetchStub(() =>
        jsonResponse({ results: [{ prompt: '  a scene  ' }, { prompt: '' }, {}] })
      );
      try {
        const prompts = await generateScheduledBatchPrompts({
          config: baseConfig({ target: 'topics', count: 3, genre: 'noir' }),
          model: 'sdxl',
          detail: 'balanced',
        });
        assert.deepEqual(prompts, ['a scene']);
        assert.equal(stub.calls.length, 1);
        assert.equal(stub.calls[0]!.url, '/api/topics/batch');
        const body = JSON.parse(stub.calls[0]!.init!.body as string) as { topics: string[] };
        assert.deepEqual(body.topics, ['noir scene 1', 'noir scene 2', 'noir scene 3']);
      } finally {
        stub.restore();
      }
    });

    it('target=topics: uses a generic topic label when no genre is given, and returns [] on a non-ok response', async () => {
      const stub = installFetchStub(() => jsonResponse({ results: [{ prompt: 'x' }] }, false));
      try {
        const prompts = await generateScheduledBatchPrompts({
          config: baseConfig({ target: 'topics', count: 1 }),
          model: 'sdxl',
          detail: 'balanced',
        });
        assert.deepEqual(prompts, []);
        const body = JSON.parse(stub.calls[0]!.init!.body as string) as { topics: string[] };
        assert.deepEqual(body.topics, ['Scheduled scene 1']);
      } finally {
        stub.restore();
      }
    });

    it('target=nsfw-generator: makes one request per count and collects each prompt', async () => {
      let call = 0;
      const stub = installFetchStub(() => {
        call += 1;
        return jsonResponse({ prompt: `nsfw prompt ${call}` });
      });
      try {
        const prompts = await generateScheduledBatchPrompts({
          config: baseConfig({ target: 'nsfw-generator', count: 3, genre: 'noir' }),
          model: 'sdxl',
          detail: 'balanced',
        });
        assert.deepEqual(prompts, ['nsfw prompt 1', 'nsfw prompt 2', 'nsfw prompt 3']);
        assert.equal(stub.calls.length, 3);
        assert.equal(stub.calls[0]!.url, '/api/nsfw-generate');
        const body = JSON.parse(stub.calls[0]!.init!.body as string) as { hints?: string };
        assert.equal(body.hints, 'noir');
      } finally {
        stub.restore();
      }
    });

    it('target=nsfw-generator: skips an entry whose response is not ok or has a blank prompt', async () => {
      let call = 0;
      const stub = installFetchStub(() => {
        call += 1;
        if (call === 1) return jsonResponse({}, false);
        return jsonResponse({ prompt: '   ' });
      });
      try {
        const prompts = await generateScheduledBatchPrompts({
          config: baseConfig({ target: 'nsfw-generator', count: 2 }),
          model: 'sdxl',
          detail: 'balanced',
        });
        assert.deepEqual(prompts, []);
      } finally {
        stub.restore();
      }
    });

    it('default (random-scene) target: makes one request per count with includePeople/wildness fixed', async () => {
      let call = 0;
      const stub = installFetchStub(() => {
        call += 1;
        return jsonResponse({ prompt: `random ${call}` });
      });
      try {
        const prompts = await generateScheduledBatchPrompts({
          config: baseConfig({ target: 'random-scene', count: 2, genre: 'cyberpunk' }),
          model: 'sdxl',
          detail: 'balanced',
        });
        assert.deepEqual(prompts, ['random 1', 'random 2']);
        assert.equal(stub.calls[0]!.url, '/api/random-scene');
        const body = JSON.parse(stub.calls[0]!.init!.body as string) as {
          includePeople: boolean;
          wildness: number;
          genre?: string;
        };
        assert.equal(body.includePeople, true);
        assert.equal(body.wildness, 50);
        assert.equal(body.genre, 'cyberpunk');
      } finally {
        stub.restore();
      }
    });

    it('merges avoidedTokensRequestBody into the request payload', async () => {
      avoidedBodyImpl = () => ({ avoidedTokens: ['neon'], avoidedTokensInstruction: 'avoid neon' });
      const stub = installFetchStub(() => jsonResponse({ prompt: 'x' }));
      try {
        await generateScheduledBatchPrompts({
          config: baseConfig({ target: 'random-scene', count: 1 }),
          model: 'sdxl',
          detail: 'balanced',
        });
        const body = JSON.parse(stub.calls[0]!.init!.body as string) as { avoidedTokens?: string[] };
        assert.deepEqual(body.avoidedTokens, ['neon']);
      } finally {
        stub.restore();
      }
    });
  });

  describe('resolveScheduledBatchModelDetail', () => {
    const shared = { model: 'shared-model', detail: 'balanced' as const, queueQualityProfile: 'final' as const };

    it('uses shared settings when overrideSharedSettings is not true', () => {
      const result = resolveScheduledBatchModelDetail(
        baseConfig({ overrideSharedSettings: false, model: 'override-model' }),
        shared
      );
      assert.deepEqual(result, { model: 'shared-model', detail: 'balanced', qualityProfile: 'final' });
    });

    it('uses config overrides when overrideSharedSettings is true and values are present', () => {
      const result = resolveScheduledBatchModelDetail(
        baseConfig({
          overrideSharedSettings: true,
          model: '  override-model  ',
          detail: 'rich',
          qualityProfile: 'max',
        }),
        shared
      );
      assert.deepEqual(result, { model: '  override-model  '.trim(), detail: 'rich', qualityProfile: 'max' });
    });

    it('falls back to shared values for any override field left blank/unset', () => {
      const result = resolveScheduledBatchModelDetail(
        baseConfig({ overrideSharedSettings: true }),
        shared
      );
      assert.deepEqual(result, { model: 'shared-model', detail: 'balanced', qualityProfile: 'final' });
    });

    it('normalizes an invalid shared queueQualityProfile via normalizeQueueQualityProfile', () => {
      const result = resolveScheduledBatchModelDetail(baseConfig(), {
        ...shared,
        queueQualityProfile: 'bogus' as never,
      });
      assert.equal(result.qualityProfile, 'followSettings');
    });
  });

  describe('rankScheduledBatchPrompts', () => {
    it('skips ranking (just slices) when bestOfN <= 1', async () => {
      const result = await rankScheduledBatchPrompts(['a', 'b', 'c'], 2, 1);
      assert.deepEqual(result, ['a', 'b']);
      assert.equal(rankPromptsWithLlm.mock.calls.length, 0);
    });

    it('skips ranking when there are already fewer prompts than keep', async () => {
      const result = await rankScheduledBatchPrompts(['a'], 5, 3);
      assert.deepEqual(result, ['a']);
      assert.equal(rankPromptsWithLlm.mock.calls.length, 0);
    });

    it('delegates to rankPromptsWithLlm when bestOfN > 1 and there are more prompts than keep', async () => {
      rankImpl = async (prompts, keep) => [...prompts].reverse().slice(0, keep);
      const result = await rankScheduledBatchPrompts(['a', 'b', 'c'], 2, 3);
      assert.deepEqual(result, ['c', 'b']);
      assert.equal(rankPromptsWithLlm.mock.calls.length, 1);
    });
  });
});
