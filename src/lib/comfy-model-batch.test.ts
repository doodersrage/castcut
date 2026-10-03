import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countModelSwitches,
  decideModelTurn,
  frontQueueSubmissionOrder,
  mainModelKeyFromGraph,
  normalizeModelKey,
  planModelBatchOrder,
  sameModelKey,
} from './comfy-model-batch';

const RAPID_NSFW = 'Qwen-Rapid-AIO-NSFW-v23.safetensors';
const RAPID_SFW = 'Qwen-Rapid-AIO-SFW-v23.safetensors';
const EDIT_2511 = 'qwen_image_edit_2511_bf16.safetensors';

describe('model keys', () => {
  it('normalizes folders, extension and case', () => {
    assert.equal(normalizeModelKey('qwen/Qwen-Rapid-AIO-NSFW-v23.safetensors'), 'qwen-rapid-aio-nsfw-v23');
    assert.equal(normalizeModelKey('b.gguf+a.safetensors'), 'a+b');
    assert.equal(normalizeModelKey(undefined), '');
  });

  it('matches a registry hint against a real file name', () => {
    assert.ok(sameModelKey('qwen_image_2.1_bf16.safetensors', 'models/qwen_image_2.1_bf16.safetensors'));
    assert.ok(!sameModelKey(RAPID_NSFW, RAPID_SFW));
    assert.ok(!sameModelKey('', RAPID_SFW));
  });

  it('reads the main model from a Day still graph', () => {
    const graph = {
      '1': { class_type: 'UNETLoader', inputs: { unet_name: EDIT_2511, weight_dtype: 'default' } },
      '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b.safetensors' } },
      '7': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'x.safetensors' } },
    };
    assert.equal(mainModelKeyFromGraph(graph), 'qwen_image_edit_2511_bf16');
    assert.equal(
      mainModelKeyFromGraph({ '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: RAPID_NSFW } } }),
      'qwen-rapid-aio-nsfw-v23'
    );
  });

  it('has no model for a utility graph', () => {
    assert.equal(
      mainModelKeyFromGraph({ '1': { class_type: 'DWPreprocessor', inputs: { image: ['2', 0] } } }),
      null
    );
    assert.equal(mainModelKeyFromGraph(null), null);
  });
});

describe('planModelBatchOrder', () => {
  it('groups jobs on the same model', () => {
    const order = planModelBatchOrder([
      { id: 'morning', modelKey: RAPID_SFW },
      { id: 'noon', modelKey: RAPID_NSFW },
      { id: 'afternoon', modelKey: RAPID_SFW },
      { id: 'night', modelKey: RAPID_NSFW },
    ]);
    assert.deepEqual(order, ['morning', 'afternoon', 'noon', 'night']);
    assert.equal(countModelSwitches([RAPID_SFW, RAPID_NSFW, RAPID_SFW, RAPID_NSFW]), 3);
    assert.equal(countModelSwitches([RAPID_SFW, RAPID_SFW, RAPID_NSFW, RAPID_NSFW]), 1);
  });

  it('starts on the model ComfyUI already has loaded', () => {
    const order = planModelBatchOrder(
      [
        { id: 'a', modelKey: RAPID_SFW },
        { id: 'b', modelKey: RAPID_NSFW },
        { id: 'c', modelKey: RAPID_SFW },
      ],
      { currentModelKey: RAPID_NSFW }
    );
    assert.deepEqual(order, ['b', 'a', 'c']);
  });

  it('holds a follow-up on another model until its batch is done', () => {
    const order = planModelBatchOrder([
      { id: 's1', modelKey: RAPID_SFW },
      { id: 'finish-s1', modelKey: EDIT_2511, after: ['s1'] },
      { id: 's2', modelKey: RAPID_SFW },
      { id: 's3', modelKey: RAPID_SFW },
      { id: 'finish-s3', modelKey: EDIT_2511, after: ['s3'] },
    ]);
    assert.deepEqual(order, ['s1', 's2', 's3', 'finish-s1', 'finish-s3']);
  });

  it('never runs a job before what it depends on', () => {
    const order = planModelBatchOrder(
      [
        { id: 'take2', modelKey: RAPID_SFW, after: ['take1'] },
        { id: 'take1', modelKey: EDIT_2511 },
      ],
      { currentModelKey: RAPID_SFW }
    );
    assert.deepEqual(order, ['take1', 'take2']);
  });

  it('bounds how long a job is passed over', () => {
    const order = planModelBatchOrder(
      [
        { id: 'a1', modelKey: RAPID_SFW },
        { id: 'b1', modelKey: EDIT_2511 },
        { id: 'a2', modelKey: RAPID_SFW },
        { id: 'a3', modelKey: RAPID_SFW },
        { id: 'a4', modelKey: RAPID_SFW },
      ],
      { maxDeferrals: 2 }
    );
    assert.deepEqual(order, ['a1', 'a2', 'a3', 'b1', 'a4']);
  });

  it('keeps utility jobs in place without breaking a group', () => {
    const order = planModelBatchOrder([
      { id: 'a1', modelKey: RAPID_SFW },
      { id: 'b1', modelKey: EDIT_2511 },
      { id: 'cutout', modelKey: null },
      { id: 'a2', modelKey: RAPID_SFW },
    ]);
    assert.deepEqual(order, ['a1', 'cutout', 'a2', 'b1']);
  });

  it('survives cycles and duplicate ids', () => {
    const order = planModelBatchOrder([
      { id: 'x', modelKey: RAPID_SFW, after: ['y'] },
      { id: 'y', modelKey: RAPID_SFW, after: ['x'] },
      { id: 'x', modelKey: RAPID_SFW },
    ]);
    assert.deepEqual(order, ['x', 'y']);
  });
});

describe('frontQueueSubmissionOrder', () => {
  it('submits backwards so ComfyUI front jobs run in order', () => {
    assert.deepEqual(frontQueueSubmissionOrder(['a', 'b', 'c'], { firstStartsNow: false }), [
      'c',
      'b',
      'a',
    ]);
  });

  it('sends the first job first when it starts on an idle queue', () => {
    assert.deepEqual(frontQueueSubmissionOrder(['a', 'b', 'c', 'd'], { firstStartsNow: true }), [
      'a',
      'd',
      'c',
      'b',
    ]);
    assert.deepEqual(frontQueueSubmissionOrder([], { firstStartsNow: true }), []);
  });
});

describe('decideModelTurn', () => {
  it('waits while the app has jobs waiting on another model', () => {
    const decision = decideModelTurn({
      modelKey: EDIT_2511,
      appPending: [
        { promptId: 'p1', modelKey: RAPID_SFW },
        { promptId: 'p2', modelKey: EDIT_2511 },
      ],
      waitedMs: 0,
      maxWaitMs: 90_000,
    });
    assert.deepEqual(decision, { wait: true, blocking: 1 });
  });

  it('goes when nothing of the app is waiting, or only the same model', () => {
    assert.equal(
      decideModelTurn({ modelKey: EDIT_2511, appPending: [], waitedMs: 0, maxWaitMs: 1 }).wait,
      false
    );
    assert.deepEqual(
      decideModelTurn({
        modelKey: EDIT_2511,
        appPending: [{ promptId: 'p', modelKey: EDIT_2511 }],
        waitedMs: 0,
        maxWaitMs: 1,
      }),
      { wait: false, reason: 'same-model' }
    );
  });

  it('stops waiting at the cap and ignores unknown models', () => {
    const appPending = [{ promptId: 'p', modelKey: RAPID_SFW }];
    assert.deepEqual(
      decideModelTurn({ modelKey: EDIT_2511, appPending, waitedMs: 90_000, maxWaitMs: 90_000 }),
      { wait: false, reason: 'held-long-enough' }
    );
    assert.deepEqual(
      decideModelTurn({ modelKey: null, appPending, waitedMs: 0, maxWaitMs: 90_000 }),
      { wait: false, reason: 'unknown-model' }
    );
  });
});
