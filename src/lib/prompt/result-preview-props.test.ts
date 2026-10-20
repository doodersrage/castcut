import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { promptResultPreviewProps } from './result-preview-props';
import type { PromptResultActionsLike } from './result-preview-props';

describe('promptResultPreviewProps', () => {
  function actions(overrides: Partial<PromptResultActionsLike> = {}): PromptResultActionsLike {
    return {
      previewWorkflow: mock.fn(async () => {}),
      workflowPreview: null,
      previewStatus: null,
      ...overrides,
    };
  }

  it('passes workflowPreview and previewStatus through unchanged', () => {
    const preview = { width: 512, height: 512 } as unknown as PromptResultActionsLike['workflowPreview'];
    const props = promptResultPreviewProps(
      actions({ workflowPreview: preview, previewStatus: 'running' }),
      'a prompt'
    );
    assert.equal(props.workflowPreview, preview);
    assert.equal(props.previewStatus, 'running');
  });

  it('onPreviewWorkflow calls previewWorkflow with the prompt and sport (defaulting sport to null)', () => {
    const previewWorkflow = mock.fn(async (_prompt: string, _sport?: unknown) => {});
    const props = promptResultPreviewProps(actions({ previewWorkflow }), 'a running scene');
    props.onPreviewWorkflow();
    assert.equal(previewWorkflow.mock.calls.length, 1);
    assert.deepEqual(previewWorkflow.mock.calls[0]!.arguments, ['a running scene', null]);
  });

  it('onPreviewWorkflow forwards an explicit sport', () => {
    const previewWorkflow = mock.fn(async (_prompt: string, _sport?: unknown) => {});
    const props = promptResultPreviewProps(actions({ previewWorkflow }), 'x', 'running');
    props.onPreviewWorkflow();
    assert.deepEqual(previewWorkflow.mock.calls[0]!.arguments, ['x', 'running']);
  });

  it('onPreviewWorkflow returns undefined synchronously (fire-and-forget)', () => {
    const previewWorkflow = mock.fn(async () => {});
    const props = promptResultPreviewProps(actions({ previewWorkflow }), 'x');
    assert.equal(props.onPreviewWorkflow(), undefined);
  });
});
