import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

type Module = typeof import('./comfy-utility-graph-server');
let comfyRanFromCache: Module['comfyRanFromCache'];
let runComfyUtilityGraph: Module['runComfyUtilityGraph'];
let uncachedComfyPrompt: Module['uncachedComfyPrompt'];
before(async () => {
  ({ comfyRanFromCache, runComfyUtilityGraph, uncachedComfyPrompt } = await import(
    './comfy-utility-graph-server'
  ));
});

const graph = {
  '1': { class_type: 'CheckpointLoader', inputs: { ckpt_name: 'a.safetensors' } },
  '2': { class_type: 'LoadImage', inputs: { image: 'still.png' } },
  '3': { class_type: 'DWPreprocessor', inputs: { image: ['2', 0] } },
};

describe('utility graphs past ComfyUI’s cache', () => {
  it('reads a run ComfyUI answered from its cache', () => {
    assert.equal(
      comfyRanFromCache({ status: { messages: [['execution_cached', { nodes: ['2', '3'] }]] } }),
      true
    );
    assert.equal(comfyRanFromCache({ status: { messages: [['execution_cached', { nodes: [] }]] } }), false);
    assert.equal(comfyRanFromCache({}), false);
  });

  it('marks every node but the model loaders with an input ComfyUI ignores', () => {
    const out = uncachedComfyPrompt(graph, 'run-1') as Record<
      string,
      { inputs: Record<string, unknown> }
    >;
    assert.deepEqual(out['1'], graph['1']);
    assert.equal(out['2']!.inputs.castcut_uncache, 'run-1');
    assert.deepEqual(out['3']!.inputs, { image: ['2', 0], castcut_uncache: 'run-1' });
    assert.equal((graph['3'].inputs as Record<string, unknown>).castcut_uncache, undefined);
  });

  it('runs the same graph again past the cache when the cached run reported nothing', async () => {
    const queued: Array<Record<string, { inputs?: Record<string, unknown> }>> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith('/prompt')) {
        queued.push(JSON.parse(String(init?.body)).prompt);
        return new Response(JSON.stringify({ prompt_id: `p${queued.length}` }));
      }
      if (path.includes('/history/p1')) {
        return new Response(
          JSON.stringify({
            p1: {
              outputs: {},
              status: {
                completed: true,
                messages: [['execution_cached', { nodes: ['1', '2', '3'] }]],
              },
            },
          })
        );
      }
      if (path.includes('/history/p2')) {
        return new Response(
          JSON.stringify({
            p2: { outputs: { '3': { openpose_json: ['{"people":[]}'] } }, status: { completed: true } },
          })
        );
      }
      return new Response('{}');
    }) as typeof fetch;
    try {
      const run = await runComfyUtilityGraph({
        baseUrl: 'http://comfy',
        label: 'pose-check',
        prompt: graph,
        read: entry => entry.outputs?.['3']?.openpose_json?.[0] as string | undefined,
        timeoutMs: 20_000,
      });
      assert.equal(run.result, '{"people":[]}');
      assert.equal(queued.length, 2);
      assert.equal(queued[0]!['3']!.inputs?.castcut_uncache, undefined);
      assert.equal(typeof queued[1]!['3']!.inputs?.castcut_uncache, 'string');
    } finally {
      globalThis.fetch = original;
    }
  });
});
