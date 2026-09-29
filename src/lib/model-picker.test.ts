import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMFY_IMAGE_MODELS } from './comfy-models/client';
import {
  installedComfyModels,
  modelPickerGroup,
  modelPickerTags,
  pushRecentModel,
  toggleStarredModel,
} from './model-picker';

const byId = (id: string) => COMFY_IMAGE_MODELS.find(entry => entry.id === id)!;

describe('engine model picker', () => {
  it('lists only models whose weight file ComfyUI has', () => {
    const installed = installedComfyModels(
      COMFY_IMAGE_MODELS,
      {
        checkpoints: ['Qwen-Rapid-AIO-NSFW-v23.safetensors'],
        unets: ['qwen_image_2512_fp8_e4m3fn.safetensors'],
      } as never,
      {
        'qwen-image-2512-lightning-8': 'qwen_image_2512_fp8_e4m3fn.safetensors',
        'qwen-rapid-aio-nsfw': 'Qwen-Rapid-AIO-NSFW-v23.safetensors',
      }
    )!;
    assert.equal(installed.get('qwen-image-2512-lightning-8'), 'qwen_image_2512_fp8_e4m3fn.safetensors');
    assert.ok(installed.has('qwen-rapid-aio-nsfw'));
    assert.ok(!installed.has('sd15'));
    // ComfyUI unreachable: unknown, not "nothing installed".
    assert.equal(installedComfyModels(COMFY_IMAGE_MODELS, null), null);
  });

  it('groups by job and tags rows', () => {
    assert.equal(modelPickerGroup(byId('qwen-image-2512-lightning-8')), 'fast');
    assert.equal(modelPickerGroup(byId('qwen-image-2512')), 'quality');
    assert.equal(modelPickerGroup(byId('qwen-rapid-aio-sfw')), 'edit');
    assert.equal(modelPickerGroup(byId('qwen-rapid-aio-nsfw')), 'adult');
    assert.equal(modelPickerGroup(byId('wan-video')), 'video');
    // The label already says "(8-step)" — only the file precision is added.
    assert.deepEqual(
      modelPickerTags(byId('qwen-image-2512-lightning-8'), 'qwen_image_2512_fp8_e4m3fn.safetensors'),
      ['fp8']
    );
    assert.deepEqual(modelPickerTags({ id: 'qwen-image-2512-lightning-8', category: 'qwen' }), [
      '8-step',
    ]);
    assert.deepEqual(modelPickerTags({ id: 'qwen-rapid-aio-nsfw', category: 'qwen' }), ['NSFW']);
    assert.deepEqual(modelPickerTags(byId('qwen-rapid-aio-nsfw')), [], 'the label says NSFW');
  });

  it('keeps recents most-recent-first and toggles stars', () => {
    assert.deepEqual(pushRecentModel(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
    assert.equal(pushRecentModel(['a', 'b', 'c', 'd', 'e'], 'f').length, 5);
    assert.deepEqual(toggleStarredModel(['a'], 'b'), ['a', 'b']);
    assert.deepEqual(toggleStarredModel(['a', 'b'], 'a'), ['b']);
  });
});
