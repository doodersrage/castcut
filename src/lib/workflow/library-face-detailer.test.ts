import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { FACE_DETAIL_IMAGE_TOKEN } from '../gallery/output-face-detail';

type WorkflowFile = {
  id: string;
  name: string;
  filename?: string;
  workflowJson: string;
  createdAt: number;
};

let files: WorkflowFile[] = [];
const loadComfyWorkflowFiles = mock.fn(() => files);
mock.module('../comfyui/workflow-files', { namedExports: { loadComfyWorkflowFiles } });

let modelWorkflowMap: Record<string, string> | undefined;
const loadSettingsCache = mock.fn(() => ({ shared: { modelWorkflowMap } }));
mock.module('../settings/cache', { namedExports: { loadSettingsCache } });

function pipelineWorkflow(): string {
  return JSON.stringify({
    '1': { class_type: 'FaceDetailer' },
  });
}

function loadImageSaveImageWithToken(): string {
  return JSON.stringify({
    '1': { class_type: 'LoadImage' },
    '2': { class_type: 'SaveImage' },
    '3': { class_type: 'Note', _widgets_values: [FACE_DETAIL_IMAGE_TOKEN] },
  });
}

afterEach(() => {
  files = [];
  modelWorkflowMap = undefined;
  loadComfyWorkflowFiles.mock.resetCalls();
  loadSettingsCache.mock.resetCalls();
});

describe('workflow-library-face-detailer', async () => {
  const { findLibraryFaceDetailerWorkflow } = await import('./library-face-detailer');

  it('returns undefined when there are no workflow files', () => {
    files = [];
    assert.equal(findLibraryFaceDetailerWorkflow(), undefined);
  });

  it('returns the pinned workflow from Settings when it exists in the file list', () => {
    files = [
      { id: 'w1', name: 'Random Workflow', workflowJson: '{}', createdAt: 1 },
      { id: 'w2', name: 'My Pin', workflowJson: pipelineWorkflow(), createdAt: 2 },
    ];
    modelWorkflowMap = { faceDetailer: 'w2' };
    const result = findLibraryFaceDetailerWorkflow();
    assert.equal(result?.id, 'w2');
  });

  it('ignores a pinned id that is blank/whitespace', () => {
    files = [{ id: 'w1', name: 'Face Detailer Pro', workflowJson: pipelineWorkflow(), createdAt: 1 }];
    modelWorkflowMap = { faceDetailer: '   ' };
    const result = findLibraryFaceDetailerWorkflow();
    assert.equal(result?.id, 'w1');
  });

  it('falls through to name/node-type heuristic search when the pinned id is not found in files', () => {
    files = [
      { id: 'w1', name: 'Face Detailer', workflowJson: pipelineWorkflow(), createdAt: 1 },
    ];
    modelWorkflowMap = { faceDetailer: 'missing-id' };
    const result = findLibraryFaceDetailerWorkflow();
    assert.equal(result?.id, 'w1');
  });

  it('matches by name/filename pattern combined with a face-detailer-looking pipeline', () => {
    files = [
      { id: 'w1', name: 'Standard Portrait', workflowJson: '{}', createdAt: 1 },
      { id: 'w2', name: 'Reactor Face Swap', workflowJson: pipelineWorkflow(), createdAt: 2 },
    ];
    const result = findLibraryFaceDetailerWorkflow();
    assert.equal(result?.id, 'w2');
  });

  it('does not match by name alone when the workflow JSON does not look like a face-detailer pipeline', () => {
    files = [{ id: 'w1', name: 'Face Fix Notes', workflowJson: '{}', createdAt: 1 }];
    const result = findLibraryFaceDetailerWorkflow();
    assert.equal(result, undefined);
  });

  it('falls back to any workflow that looks like a face-detailer pipeline by node type, regardless of name', () => {
    files = [
      { id: 'w1', name: 'Untitled Import', workflowJson: pipelineWorkflow(), createdAt: 1 },
    ];
    const result = findLibraryFaceDetailerWorkflow();
    assert.equal(result?.id, 'w1');
  });

  it('recognizes the LoadImage+SaveImage+face-detail-token heuristic as a pipeline match', () => {
    files = [
      {
        id: 'w1',
        name: 'Custom Import',
        workflowJson: loadImageSaveImageWithToken(),
        createdAt: 1,
      },
    ];
    const result = findLibraryFaceDetailerWorkflow();
    assert.equal(result?.id, 'w1');
  });

  it('treats malformed workflow JSON as not a face-detailer pipeline, without throwing', () => {
    files = [{ id: 'w1', name: 'Face Detailer Import', workflowJson: '{bad json', createdAt: 1 }];
    assert.equal(findLibraryFaceDetailerWorkflow(), undefined);
  });

  it('returns undefined when no workflow matches by pin, name, or node-type heuristic', () => {
    files = [{ id: 'w1', name: 'Plain Upscale', workflowJson: '{}', createdAt: 1 }];
    assert.equal(findLibraryFaceDetailerWorkflow(), undefined);
  });
});
