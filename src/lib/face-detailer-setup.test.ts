import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach } from 'node:test';

const sharedState: {
  modelWorkflowMap?: Record<string, string>;
  model?: string;
} = {};

const files: Array<{ id: string; name: string; workflowJson: string }> = [];

mock.module('./settings-cache', {
  namedExports: {
    loadSettingsCache: () => ({ shared: sharedState }),
    saveSharedSettings: (shared: typeof sharedState) => {
      Object.assign(sharedState, shared);
    },
  },
});

mock.module('./comfyui-workflow-files', {
  namedExports: {
    upsertComfyWorkflowFile: (input: { name: string; workflowJson: string }) => {
      const saved = {
        id: `wf-${files.length + 1}`,
        name: input.name,
        workflowJson: input.workflowJson,
      };
      files.push(saved);
      return saved;
    },
    loadComfyWorkflowFiles: () => files,
  },
});

mock.module('./workflow-library-face-detailer', {
  namedExports: {
    findLibraryFaceDetailerWorkflow: () => {
      const pinned = sharedState.modelWorkflowMap?.faceDetailer?.trim();
      if (pinned) {
        return files.find(file => file.id === pinned);
      }
      return files.find(file => /FaceDetailer|face.?detail/i.test(file.name));
    },
  },
});

mock.module('./face-detailer-health', {
  namedExports: {
    getFaceDetailerHealth: () => {
      const pinned = sharedState.modelWorkflowMap?.faceDetailer?.trim();
      if (pinned && files.some(file => file.id === pinned)) {
        const file = files.find(entry => entry.id === pinned)!;
        const hasImpact = /"class_type"\s*:\s*"FaceDetailer"/i.test(file.workflowJson);
        if (hasImpact) {
          return {
            status: 'ready' as const,
            label: 'Ready',
            workflowName: file.name,
            pinnedId: pinned,
            hasImpactNodes: true,
          };
        }
        return {
          status: 'partial' as const,
          label: 'Scaffold · needs Impact Pack',
          workflowName: file.name,
          pinnedId: pinned,
          hasImpactNodes: false,
        };
      }
      if (files.length > 0) {
        return {
          status: 'detected' as const,
          label: 'Detected',
          workflowName: files[0]!.name,
        };
      }
      return { status: 'missing' as const, label: 'Missing' };
    },
  },
});

describe('ensureFaceDetailerLibraryPin', async () => {
  const { ensureFaceDetailerLibraryPin } = await import('./face-detailer-setup');

  beforeEach(() => {
    files.length = 0;
    sharedState.modelWorkflowMap = {};
    sharedState.model = 'qwen-image-edit-2511-lightning-8';
  });

  it('creates and pins a scaffold when Impact Pack is unavailable', () => {
    const result = ensureFaceDetailerLibraryPin({
      availableNodeTypes: ['LoadImage', 'SaveImage'],
    });
    assert.equal(result.ok, false);
    assert.equal(result.created, true);
    assert.equal(result.usedAutoGraph, false);
    assert.equal(sharedState.modelWorkflowMap?.faceDetailer, result.workflowId);
    assert.match(result.message, /scaffold/i);
  });

  it('creates an auto FaceDetailer graph when the node is installed', () => {
    const result = ensureFaceDetailerLibraryPin({
      availableNodeTypes: ['FaceDetailer', 'UltralyticsDetectorProvider', 'LoadImage', 'SaveImage'],
    });
    assert.equal(result.ok, true);
    assert.equal(result.created, true);
    assert.equal(result.usedAutoGraph, true);
    assert.match(files[0]!.workflowJson, /FaceDetailer/);
    assert.match(result.message, /Impact Pack FaceDetailer/i);
  });

  it('is a no-op when already ready', () => {
    const first = ensureFaceDetailerLibraryPin({
      availableNodeTypes: ['FaceDetailer', 'UltralyticsDetectorProvider'],
    });
    const second = ensureFaceDetailerLibraryPin({
      availableNodeTypes: ['FaceDetailer', 'UltralyticsDetectorProvider'],
    });
    assert.equal(second.created, false);
    assert.equal(second.workflowId, first.workflowId);
    assert.equal(files.length, 1);
  });
});
