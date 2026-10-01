import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  missingTaskRequirements,
  runnableModelsFromMap,
  taskRequirements,
} from './task-requirements';

describe('Task requirements', () => {
  it('a Rapid Day needs one file; adult, clips and face finish add theirs', () => {
    assert.deepEqual(taskRequirements({ model: 'qwen-rapid-aio-edit' }).assetIds, [
      'qwen-rapid-aio-sfw-checkpoint',
    ]);
    const all = taskRequirements({
      model: 'qwen-rapid-aio-edit',
      adult: true,
      animate: true,
      faceFinish: true,
      autoReview: true,
    });
    assert.deepEqual(all.assetIds, [
      'qwen-rapid-aio-sfw-checkpoint',
      'qwen-rapid-aio-nsfw-checkpoint',
      'wan-video-rapid-aio',
      'qwen-image-edit-2511-bf16',
      'qwen-edit-lightning-8',
      'qwen-2.5-vl-7b-fp8',
      'qwen-image-vae',
    ]);
    assert.equal(all.nodePacks.length, 2);
  });

  it('a model whose mapped file is installed asks for nothing', () => {
    const runnable = runnableModelsFromMap(
      { 'wan-video-rapid-aio': 'wan2.2-i2v-rapid-aio-v10-nsfw.safetensors' },
      ['subdir/wan2.2-i2v-rapid-aio-v10-nsfw.safetensors']
    );
    assert.deepEqual(taskRequirements({ animate: true, runnableModels: runnable }).assetIds, []);
    assert.deepEqual(taskRequirements({ animate: true }).assetIds, ['wan-video-rapid-aio']);
  });

  it('unknown models ask for nothing', () => {
    assert.deepEqual(taskRequirements({ model: 'some-new-model' }).assetIds, []);
  });

  it('lists only what is missing, and splits what cannot be downloaded here', () => {
    const req = taskRequirements({ model: 'qwen-rapid-aio-edit', adult: true, autoReview: true });
    const missing = missingTaskRequirements(
      req,
      [
        { id: 'qwen-rapid-aio-sfw-checkpoint', status: 'installed', downloadable: true },
        { id: 'qwen-rapid-aio-nsfw-checkpoint', status: 'missing', downloadable: true, bytes: 28e9 },
      ],
      new Set(['DWPreprocessor'])
    );
    assert.deepEqual(
      missing.assets.map(row => row.id),
      ['qwen-rapid-aio-nsfw-checkpoint']
    );
    assert.equal(missing.bytes, 28e9);
    assert.deepEqual(
      missing.nodePacks.map(pack => pack.label),
      ['FaceAnalysis (InsightFace)']
    );
  });
});
