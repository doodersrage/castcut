import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadSettingsCache } from '../settings/cache';
import { loadComfyUiSettings } from './settings';
import { loadComfyWorkflowFiles } from './workflow-files';
import { resolveRuntimeForQueue, resolveRuntimeForQueueAsync } from './runtime-for-model';

// FINISHING_PLAN Phase 3, step 6: the server resolves a take's runtime from its synced copies of
// the settings, passed in, instead of this browser's stores.
const source = () => ({
  shared: loadSettingsCache().shared,
  workflowFiles: loadComfyWorkflowFiles(),
  comfyUi: loadComfyUiSettings(),
});

describe('a queue runtime resolved from settings passed in (Phase 3, step 6)', () => {
  const cases: Array<[string, string | undefined]> = [
    ['qwen-image-edit-2511', 'image-prompt'],
    ['qwen-image-2512', undefined],
    ['flux-2-klein', 'fitting'],
    ['wan-video', 'video'],
  ];
  for (const [model, tool] of cases) {
    it(`${model}${tool ? ` (${tool})` : ''}: the same runtime as from the stores`, () => {
      const fromStores = resolveRuntimeForQueue(model as never, tool, { inventory: null });
      const fromSource = resolveRuntimeForQueue(model as never, tool, { inventory: null, settings: source() });
      assert.deepEqual(fromSource, fromStores);
    });
  }

  it('reads what it is given: sampler overrides passed in reach the runtime', () => {
    const given = source();
    const overrides = { 'qwen-image-edit-2511': { steps: 12 } } as never;
    const runtime = resolveRuntimeForQueue('qwen-image-edit-2511' as never, undefined, {
      inventory: null,
      settings: { ...given, shared: { ...given.shared, modelSamplerOverrides: overrides } },
    });
    assert.deepEqual(runtime.modelSamplerOverrides, overrides);
  });

  it('the async form fetches nothing when settings are passed in', async () => {
    const original = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched += 1;
      throw new Error('no network here');
    }) as typeof fetch;
    try {
      const runtime = await resolveRuntimeForQueueAsync('qwen-image-edit-2511' as never, undefined, {
        settings: source(),
      });
      assert.ok(runtime);
      assert.equal(fetched, 0);
    } finally {
      globalThis.fetch = original;
    }
  });
});
