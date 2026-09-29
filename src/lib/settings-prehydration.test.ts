import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { preHydrationSavePatch } from './settings-cache';

describe('preHydrationSavePatch', () => {
  it('queues only what an early save changed — never default maps, tools or plugins', () => {
    const seen = {
      shared: { model: 'qwen-image-2512', modelCheckpointMap: {}, modelWorkflowMap: {}, useSystemWorkflows: false },
      tools: {},
      installedPlugins: [],
    } as never;
    const next = {
      shared: { model: 'flux-2-klein', modelCheckpointMap: {}, modelWorkflowMap: {}, useSystemWorkflows: false },
      tools: {},
      installedPlugins: [],
      updatedAt: 5,
    } as never;
    const patch = preHydrationSavePatch(next, seen);
    assert.deepEqual(patch.shared, { model: 'flux-2-klein' });
    assert.deepEqual(patch.tools, {});
    assert.equal(patch.installedPlugins, undefined);
    assert.equal(patch.updatedAt, 5);
  });

  it('keeps a map the early save really changed', () => {
    const seen = { shared: { modelWorkflowMap: {} }, tools: {}, installedPlugins: [] } as never;
    const next = { shared: { modelWorkflowMap: { 'ltx-video': 'wan' } }, tools: {}, installedPlugins: [] } as never;
    assert.deepEqual(preHydrationSavePatch(next, seen).shared, { modelWorkflowMap: { 'ltx-video': 'wan' } });
  });
});
