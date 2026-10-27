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
      'qwen-image-edit-2511-fp8mixed',
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

  // The face finish renders on the fp8 Edit 2511 UNET (resolveFaceFinisher): it asked for the
  // 40.9 GB bf16 file even with fp8mixed installed.
  it('face finish asks for the fp8 Edit 2511 UNET, and an installed bf16 covers it', () => {
    const req = taskRequirements({ faceFinish: true });
    assert.ok(req.assetIds.includes('qwen-image-edit-2511-fp8mixed'));
    assert.ok(!req.assetIds.includes('qwen-image-edit-2511-bf16'));
    const rest = [
      { id: 'qwen-edit-lightning-8', status: 'installed' as const, downloadable: true },
      { id: 'qwen-2.5-vl-7b-fp8', status: 'installed' as const, downloadable: true },
      { id: 'qwen-image-vae', status: 'installed' as const, downloadable: true },
    ];
    const fp8 = { id: 'qwen-image-edit-2511-fp8mixed', downloadable: true, bytes: 20533762817 };
    const bf16 = { id: 'qwen-image-edit-2511-bf16', downloadable: true, bytes: 40861031560 };
    const missing = (rows: Parameters<typeof missingTaskRequirements>[1]) =>
      missingTaskRequirements(req, rows, null).assets.map(row => row.id);
    assert.deepEqual(missing([...rest, { ...fp8, status: 'installed' }]), []);
    assert.deepEqual(
      missing([...rest, { ...fp8, status: 'missing' }, { ...bf16, status: 'installed' }]),
      []
    );
    const neither = missingTaskRequirements(
      req,
      [...rest, { ...fp8, status: 'missing' }, { ...bf16, status: 'missing' }],
      null
    );
    assert.deepEqual(neither.assets.map(row => row.id), ['qwen-image-edit-2511-fp8mixed']);
    assert.equal(neither.bytes, 20533762817);
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

describe('Turbo requirement: the checkpoint or the base + LoRA', () => {
  const rows = (installed: string[]) =>
    ['qwen-image-2.1-turbo-int8', 'qwen-image-2.1-bf16', 'qwen-image-2.1-turbo-lora'].map(id => ({
      id,
      status: installed.includes(id) ? ('installed' as const) : ('missing' as const),
      downloadable: true,
      bytes: 1,
    }));
  const req = { assetIds: ['qwen-image-2.1-turbo-int8'], nodePacks: [] } as never;

  it('asks for the checkpoint on a fresh install', () => {
    assert.deepEqual(
      missingTaskRequirements(req, rows([]), null).assets.map(row => row.id),
      ['qwen-image-2.1-turbo-int8']
    );
  });

  it('is satisfied by the 2.1 base + Turbo LoRA', () => {
    assert.equal(
      missingTaskRequirements(
        req,
        rows(['qwen-image-2.1-bf16', 'qwen-image-2.1-turbo-lora']),
        null
      ).assets.length,
      0
    );
    assert.equal(
      missingTaskRequirements(req, rows(['qwen-image-2.1-bf16']), null).assets.length,
      1
    );
  });
});
