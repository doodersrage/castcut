import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadSettingsCache } from '../settings/cache';
import { loadComfyUiSettings } from '../comfyui/settings';
import { loadComfyWorkflowFiles } from '../comfyui/workflow-files';
import { loadModelSamplerMemory } from '../history/sampler-memory';
import { loadQueueParamsSettings, resolveQueueParams } from './params-settings';

// FINISHING_PLAN Phase 3: a take's queue params resolved from settings passed in (the server's
// synced copies) instead of this browser's stores.
const given = () => ({
  shared: loadSettingsCache().shared,
  comfyUi: loadComfyUiSettings(),
  workflowFiles: loadComfyWorkflowFiles(),
  queueParams: loadQueueParamsSettings(),
  samplerMemory: loadModelSamplerMemory(),
});
const PINNED = { seed: '1234' };

describe('queue params from settings passed in (Phase 3)', () => {
  for (const [model, tool] of [
    ['qwen-image-edit-2511', 'image-prompt'],
    ['qwen-image-edit-2511-lightning-8', 'image-prompt'],
    ['flux-2-klein', 'fitting'],
    ['sdxl', 'generate'],
  ] as const) {
    it(`${model}: the same params as from the stores`, () => {
      const input = { model, tool, base: PINNED, inputImageFilename: 'plate.png', castPlateReference: true };
      assert.deepEqual(resolveQueueParams({ ...input, settings: given() }), resolveQueueParams(input));
    });
  }

  it('reads what it is given: a portrait orientation and a pinned queue seed', () => {
    const settings = given();
    const landscape = resolveQueueParams({ model: 'sdxl', tool: 'generate', settings });
    const portrait = resolveQueueParams({
      model: 'sdxl',
      tool: 'generate',
      settings: {
        ...settings,
        shared: { ...settings.shared, modelResolutionOrientation: 'portrait' as never },
        queueParams: { ...settings.queueParams, enabled: true, seed: '777' },
      },
    });
    assert.ok(Number(portrait.height) > Number(portrait.width), JSON.stringify(portrait));
    assert.notDeepEqual([portrait.width, portrait.height], [landscape.width, landscape.height]);
    assert.equal(portrait.seed, '777');
  });

  it('reads what it is given: the sampler memory passed in', () => {
    const settings = given();
    const remembered = resolveQueueParams({
      model: 'sdxl',
      tool: 'generate',
      settings: { ...settings, samplerMemory: { sdxl: { steps: '41', at: Date.now() } as never } },
    });
    assert.equal(remembered.steps, '41');
  });
});
