import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const inferModelsFromWorkflowLabel = mock.fn((_input: { name: string; filename?: string }) => [] as string[]);
mock.module('./category-defaults', { namedExports: { inferModelsFromWorkflowLabel } });

let sharedModelWorkflowMap: Record<string, string> | undefined;
let sharedModel = 'sdxl';
const loadSettingsCache = mock.fn(() => ({
  shared: { modelWorkflowMap: sharedModelWorkflowMap, model: sharedModel },
}));
mock.module('../settings/cache', { namedExports: { loadSettingsCache } });

afterEach(() => {
  sharedModelWorkflowMap = undefined;
  sharedModel = 'sdxl';
  inferModelsFromWorkflowLabel.mock.resetCalls();
  inferModelsFromWorkflowLabel.mock.mockImplementation((_input: { name: string; filename?: string }) => []);
  loadSettingsCache.mock.resetCalls();
});

describe('workflow-optimize-model', async () => {
  const { resolveOptimizeModelForWorkflowFile } = await import('./optimize-model');

  it('returns the first model assigned to this workflow file id in the given map', () => {
    const result = resolveOptimizeModelForWorkflowFile({ id: 'w1', name: 'My Flow' }, undefined, {
      flux: 'w1',
      sdxl: 'w2',
    } as never);
    assert.equal(result, 'flux');
  });

  it('uses loadSettingsCache().shared.modelWorkflowMap when no map is given', () => {
    sharedModelWorkflowMap = { 'wan-video': 'w9' };
    const result = resolveOptimizeModelForWorkflowFile({ id: 'w9', name: 'Vid Flow' });
    assert.equal(result, 'wan-video');
  });

  it('falls back to inferModelsFromWorkflowLabel when no assignment matches', () => {
    inferModelsFromWorkflowLabel.mock.mockImplementation(() => ['flux-2-klein']);
    const result = resolveOptimizeModelForWorkflowFile(
      { id: 'w1', name: 'Klein Portrait', filename: 'klein.json' },
      undefined,
      {}
    );
    assert.equal(result, 'flux-2-klein');
    assert.deepEqual(inferModelsFromWorkflowLabel.mock.calls[0]!.arguments[0], {
      name: 'Klein Portrait',
      filename: 'klein.json',
    });
  });

  it('falls back to the given fallbackModel when there is no assignment or inference match', () => {
    const result = resolveOptimizeModelForWorkflowFile({ id: 'w1', name: 'Untitled' }, 'sd15', {});
    assert.equal(result, 'sd15');
  });

  it('falls back to loadSettingsCache().shared.model when nothing else matches', () => {
    sharedModel = 'qwen-image';
    const result = resolveOptimizeModelForWorkflowFile({ id: 'w1', name: 'Untitled' }, undefined, {});
    assert.equal(result, 'qwen-image');
  });

  it('treats an undefined modelWorkflowMap parameter as absent and reads the settings cache', () => {
    sharedModelWorkflowMap = { flux: 'w5' };
    const result = resolveOptimizeModelForWorkflowFile({ id: 'w5', name: 'Any' }, undefined, undefined);
    assert.equal(result, 'flux');
  });
});
