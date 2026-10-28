import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  replayGraphPlan,
  requeueSourceImageUrlFromEntry,
  resolveRequeueSessionLoraIds,
  restoreExactGraphFromComfyHistory,
} from './requeue';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';

// Minimal entry fixtures — only the fields these functions actually read.
const baseHistoryEntry = {
  id: 'entry-1',
  promptId: 'prompt-123',
  comfyUrl: 'http://127.0.0.1:8188',
} as Pick<ComfyGalleryEntry, 'id' | 'promptId' | 'comfyUrl'>;

const baseSourceImageEntry = {
  comfyUrl: 'http://127.0.0.1:8188',
  images: [],
  tool: 'refine',
  model: 'qwen-image-2512',
  queueParams: undefined,
  sourceImageUrl: undefined,
  maskImageUrl: undefined,
} as unknown as Pick<
  ComfyGalleryEntry,
  'comfyUrl' | 'images' | 'tool' | 'model' | 'queueParams' | 'sourceImageUrl' | 'maskImageUrl'
>;

describe('comfyui-requeue pure/self-contained helpers', () => {
  describe('resolveRequeueSessionLoraIds', () => {
    it('prefers an explicit sessionActiveLoraIds array recorded on the entry', () => {
      const ids = ['lora-a', 'lora-b'];
      assert.deepEqual(
        resolveRequeueSessionLoraIds({ sessionActiveLoraIds: ids, model: 'qwen-image-2512' }),
        ids
      );
    });

    it('falls back to the shared session stack (empty in a window-less env) when unset', () => {
      assert.deepEqual(
        resolveRequeueSessionLoraIds({ sessionActiveLoraIds: undefined, model: 'qwen-image-2512' }),
        []
      );
    });
  });

  describe('requeueSourceImageUrlFromEntry', () => {
    it('returns the entry sourceImageUrl when one is set and not durable-media-backed', () => {
      const entry = { ...baseSourceImageEntry, sourceImageUrl: 'https://example.test/source.png' };
      assert.equal(requeueSourceImageUrlFromEntry(entry), 'https://example.test/source.png');
    });

    it('returns undefined when the entry has no source image and no queue-param fallback', () => {
      assert.equal(requeueSourceImageUrlFromEntry(baseSourceImageEntry), undefined);
    });
  });

  describe('restoreExactGraphFromComfyHistory error/early-return branches', () => {
    // The success path performs `await import('../gallery/comfyui-gallery')` and
    // `void import('../server/local-observability')...` to write into gallery
    // storage — intentionally left uncovered here to avoid pulling that
    // storage layer into this unit test. Only the 5 self-contained
    // error/early-return branches are exercised.
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('short-circuits with no fetch call when promptId is missing/blank', async () => {
      globalThis.fetch = (async () => {
        throw new Error('fetch should not be called');
      }) as typeof fetch;

      const result = await restoreExactGraphFromComfyHistory({
        ...baseHistoryEntry,
        promptId: '   ',
      });

      assert.deepEqual(result, {
        ok: false,
        message: 'No Comfy prompt id — cannot fetch history graph.',
      });
    });

    it('reports the HTTP status when the history fetch is not ok', async () => {
      globalThis.fetch = (async () =>
        new Response(null, { status: 502 })) as typeof fetch;

      const result = await restoreExactGraphFromComfyHistory(baseHistoryEntry);

      assert.deepEqual(result, {
        ok: false,
        message: 'Comfy history fetch failed (502).',
      });
    });

    it('surfaces the server-provided error when the response has no workflow', async () => {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ ok: true, error: 'nope' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch;

      const result = await restoreExactGraphFromComfyHistory(baseHistoryEntry);

      assert.deepEqual(result, { ok: false, message: 'nope' });
    });

    it('falls back to a default message when there is no workflow and no error', async () => {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch;

      const result = await restoreExactGraphFromComfyHistory(baseHistoryEntry);

      assert.deepEqual(result, {
        ok: false,
        message: 'No workflow in ComfyUI history for this prompt id.',
      });
    });

    it('catches a thrown fetch error and returns its message', async () => {
      globalThis.fetch = (async () => {
        throw new Error('network down');
      }) as typeof fetch;

      const result = await restoreExactGraphFromComfyHistory(baseHistoryEntry);

      assert.deepEqual(result, { ok: false, message: 'network down' });
    });
  });
});

// M7 T4 / M6 D23: a finished graph is queued as it is; a template is filled and patched.
describe('replayGraphPlan', () => {
  const base = { exactGraph: true, isVariation: false };
  it('a graph from the history route (Castcut or ComfyUI) is finished', () => {
    assert.deepEqual(replayGraphPlan({ ...base, graph: '{"1":{}}' }), {
      replayedFrom: 'history',
      workflowFinal: true,
    });
  });
  it("a render's own stored graph is a template, unless it was marked finished", () => {
    assert.deepEqual(replayGraphPlan({ ...base, graph: 'g', stored: 'g' }), {
      replayedFrom: 'stored',
      workflowFinal: false,
    });
    assert.deepEqual(replayGraphPlan({ ...base, graph: 'g', stored: 'g', storedFinal: true }), {
      replayedFrom: 'stored',
      workflowFinal: true,
    });
    assert.equal(
      replayGraphPlan({ ...base, graph: 'g', passed: 'g', stored: 'g', storedFinal: true })
        .workflowFinal,
      false,
      'a graph the caller passes is adapted as before'
    );
  });
  it('no graph found is a rebuild; a variation or a non-exact requeue is never finished', () => {
    assert.deepEqual(replayGraphPlan({ ...base }), { replayedFrom: 'rebuilt', workflowFinal: false });
    assert.deepEqual(replayGraphPlan({ ...base, isVariation: true, graph: 'g' }), {
      workflowFinal: false,
    });
    assert.deepEqual(replayGraphPlan({ exactGraph: false, isVariation: false, graph: 'g' }), {
      workflowFinal: false,
    });
  });
});
