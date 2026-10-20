import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { EnsureVideoWorkflowResult } from './ensure-video-workflow';

let objectInfoImpl: (opts: unknown) => Promise<{ models: unknown[] } | null> = async () => ({
  models: [],
});
const fetchComfyObjectInfoCached = mock.fn((opts: unknown) => objectInfoImpl(opts));
mock.module('./comfyui/object-info-cache', { namedExports: { fetchComfyObjectInfoCached } });

let videoModelImpl = (_model: string) => true;
const isVideoModel = mock.fn((model: string) => videoModelImpl(model));
mock.module('./queue-tool-model', { namedExports: { isVideoModel } });

function fakeResult(overrides: Partial<EnsureVideoWorkflowResult> = {}): EnsureVideoWorkflowResult {
  return {
    created: false,
    assigned: true,
    workflow: { id: 'wf-1', name: 'Video scaffold' } as EnsureVideoWorkflowResult['workflow'],
    model: 'video-model' as EnsureVideoWorkflowResult['model'],
    sharedPatch: { videoModel: 'video-model' } as EnsureVideoWorkflowResult['sharedPatch'],
    checkpointFilename: 'video.safetensors',
    ...overrides,
  };
}

let scaffoldImpl: (model?: unknown, options?: unknown) => EnsureVideoWorkflowResult = () => fakeResult();
const ensureVideoWorkflowScaffold = mock.fn((model?: unknown, options?: unknown) =>
  scaffoldImpl(model, options)
);
mock.module('./ensure-video-workflow', { namedExports: { ensureVideoWorkflowScaffold } });

function resetMocks() {
  for (const m of [fetchComfyObjectInfoCached, isVideoModel, ensureVideoWorkflowScaffold]) {
    m.mock.resetCalls();
  }
  objectInfoImpl = async () => ({ models: [] });
  videoModelImpl = () => true;
  scaffoldImpl = () => fakeResult();
}

afterEach(resetMocks);

describe('pin-video-weights', async () => {
  const { pinVideoWeightsAfterInstall } = await import('./pin-video-weights');

  it('returns a generic note without touching object info when the model is not a video model', async () => {
    videoModelImpl = () => false;
    const result = await pinVideoWeightsAfterInstall('not-video');
    assert.deepEqual(result, { note: 'Installed weights. Refresh ComfyUI if loaders stay empty.' });
    assert.equal(fetchComfyObjectInfoCached.mock.calls.length, 0);
    assert.equal(ensureVideoWorkflowScaffold.mock.calls.length, 0);
  });

  it('refreshes object info, passes its models as inventory, and reports the mapped checkpoint', async () => {
    objectInfoImpl = async () => ({ models: [{ filename: 'video.safetensors' }] });
    scaffoldImpl = (_model, options) => {
      assert.deepEqual((options as { inventory: unknown }).inventory, [
        { filename: 'video.safetensors' },
      ]);
      return fakeResult({ created: true, checkpointFilename: 'video.safetensors' });
    };
    const result = await pinVideoWeightsAfterInstall('video-1');
    assert.equal(fetchComfyObjectInfoCached.mock.calls.length, 1);
    assert.deepEqual(fetchComfyObjectInfoCached.mock.calls[0]!.arguments[0], { forceRefresh: true });
    assert.equal(result.checkpointFilename, 'video.safetensors');
    assert.ok(result.note.includes('Mapped video-model → video.safetensors and created a video scaffold'));
  });

  it('reports the mapped checkpoint without "created" wording when the scaffold already existed', async () => {
    scaffoldImpl = () => fakeResult({ created: false, checkpointFilename: 'video.safetensors' });
    const result = await pinVideoWeightsAfterInstall('video-1');
    assert.ok(result.note.includes('Mapped video-model → video.safetensors.'));
    assert.ok(!result.note.includes('created a video scaffold'));
  });

  it('reports the fallback note when no checkpoint could be mapped', async () => {
    scaffoldImpl = () => fakeResult({ checkpointFilename: undefined });
    const result = await pinVideoWeightsAfterInstall('video-1');
    assert.equal(result.checkpointFilename, undefined);
    assert.equal(
      result.note,
      'Video weights installed — refresh ComfyUI, then Refresh here so the checkpoint map can pick them up.'
    );
  });

  it('passes null inventory when fetchComfyObjectInfoCached resolves to null', async () => {
    objectInfoImpl = async () => null;
    scaffoldImpl = (_model, options) => {
      assert.deepEqual((options as { inventory: unknown }).inventory, null);
      return fakeResult();
    };
    await pinVideoWeightsAfterInstall('video-1');
    assert.equal(ensureVideoWorkflowScaffold.mock.calls.length, 1);
  });

  it('trims whitespace off the reported checkpointFilename', async () => {
    scaffoldImpl = () => fakeResult({ checkpointFilename: '  padded.safetensors  ' });
    const result = await pinVideoWeightsAfterInstall('video-1');
    assert.equal(result.checkpointFilename, 'padded.safetensors');
  });
});
