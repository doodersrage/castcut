import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { SceneStarterPreset } from './starter-presets';
import { applySceneStarterWorkflowHints } from './starter-workflow-hints';

function preset(overrides: Partial<SceneStarterPreset> = {}): SceneStarterPreset {
  return {
    id: 'p1',
    label: 'A Preset',
    hints: 'a scene',
    category: 'sport',
    ...overrides,
  } as SceneStarterPreset;
}

describe('applySceneStarterWorkflowHints', () => {
  it('does not call updateShared when the preset has neither suggestion', () => {
    const updateShared = mock.fn((_patch: unknown) => {});
    applySceneStarterWorkflowHints(preset(), updateShared);
    assert.equal(updateShared.mock.calls.length, 0);
  });

  it('patches only model when only suggestedModel is set', () => {
    const updateShared = mock.fn((_patch: unknown) => {});
    applySceneStarterWorkflowHints(preset({ suggestedModel: 'sdxl' }), updateShared);
    assert.equal(updateShared.mock.calls.length, 1);
    assert.deepEqual(updateShared.mock.calls[0]!.arguments[0], { model: 'sdxl' });
  });

  it('patches only selectedWorkflowFileId when only suggestedWorkflowFileId is set', () => {
    const updateShared = mock.fn((_patch: unknown) => {});
    applySceneStarterWorkflowHints(preset({ suggestedWorkflowFileId: 'wf-1' }), updateShared);
    assert.deepEqual(updateShared.mock.calls[0]!.arguments[0], { selectedWorkflowFileId: 'wf-1' });
  });

  it('patches both when both suggestions are set', () => {
    const updateShared = mock.fn((_patch: unknown) => {});
    applySceneStarterWorkflowHints(
      preset({ suggestedModel: 'sdxl', suggestedWorkflowFileId: 'wf-1' }),
      updateShared
    );
    assert.deepEqual(updateShared.mock.calls[0]!.arguments[0], {
      model: 'sdxl',
      selectedWorkflowFileId: 'wf-1',
    });
  });
});
