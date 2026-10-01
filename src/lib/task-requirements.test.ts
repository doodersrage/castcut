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

describe('task requirements: Qwen-Image 2.1 engine', () => {
  it('needs the 2.1 files plus the Rapid NSFW checkpoint it falls back to', () => {
    const req = taskRequirements({ model: 'qwen-image-2.1-edit' });
    for (const id of ['qwen-image-2.1-bf16', 'qwen-image-2.1-text-encoder', 'qwen-image-2.1-vae', 'qwen-rapid-aio-nsfw-checkpoint']) {
      assert.ok(req.assetIds.includes(id), id);
    }
    assert.ok(!taskRequirements({ model: 'qwen-rapid-aio-edit-nsfw' }).assetIds.includes('qwen-image-2.1-bf16'));
  });

  it('Lightning needs the same weights plus the 4-step sampler node', () => {
    const req = taskRequirements({ model: 'qwen-image-2.1-edit-lightning-4' });
    assert.ok(req.assetIds.includes('qwen-image-2.1-bf16'));
    assert.ok(req.nodePacks.some(pack => pack.nodeTypes.includes('T8QwenImage21FunAccPDD4Step')));
    assert.equal(taskRequirements({ model: 'qwen-image-2.1-edit' }).nodePacks.length, 0);
  });

  it('Lightning 8 needs the Pruna LoRA and no custom node pack', () => {
    const req = taskRequirements({ model: 'qwen-image-2.1-edit-pruna-8' });
    assert.ok(req.assetIds.includes('qwen-image-2.1-bf16'));
    assert.ok(req.assetIds.includes('qwen-image-2.1-pruna-8step'));
    assert.equal(req.nodePacks.length, 0);
  });
});
