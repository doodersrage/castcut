import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { preferInstalledFp8ForEdit2511 } from './model-loader-precision';

const graph = () => ({
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_edit_2511_bf16.safetensors' } },
  '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b.safetensors', type: 'qwen_image' } },
  '3': { class_type: 'UNETLoader', inputs: { unet_name: 'Qwen-Rapid-AIO-NSFW-v23.safetensors' } },
});
const unet = (g: Record<string, unknown>, id: string) =>
  ((g[id] as { inputs: Record<string, string> }).inputs.unet_name ??
    (g[id] as { inputs: Record<string, string> }).inputs.clip_name);

describe('Edit 2511 Lightning on fp8 when installed', () => {
  const inv = {
    availableUnets: ['qwen_image_edit_2511_bf16.safetensors', 'qwen_image_edit_2511_fp8mixed.safetensors'],
    availableClips: ['qwen_2.5_vl_7b.safetensors', 'qwen_2.5_vl_7b_fp8_scaled.safetensors'],
  };
  it('swaps the 2511 UNET and the Qwen VL text encoder; leaves other models alone', () => {
    const g = preferInstalledFp8ForEdit2511(graph(), 'qwen-image-edit-2511-lightning-8', inv);
    assert.equal(unet(g, '1'), 'qwen_image_edit_2511_fp8mixed.safetensors');
    assert.equal(unet(g, '2'), 'qwen_2.5_vl_7b_fp8_scaled.safetensors');
    assert.equal(unet(g, '3'), 'Qwen-Rapid-AIO-NSFW-v23.safetensors');
  });
  it('keeps bf16 when fp8 is not installed or the inventory is unknown', () => {
    assert.equal(
      unet(preferInstalledFp8ForEdit2511(graph(), 'qwen-image-edit-2511-lightning-8', { availableUnets: ['qwen_image_edit_2511_bf16.safetensors'] }), '1'),
      'qwen_image_edit_2511_bf16.safetensors'
    );
    assert.equal(unet(preferInstalledFp8ForEdit2511(graph(), 'qwen-image-edit-2511-lightning-8', {}), '1'), 'qwen_image_edit_2511_bf16.safetensors');
  });
  it('only Edit 2511 Lightning', () => {
    assert.equal(unet(preferInstalledFp8ForEdit2511(graph(), 'qwen-rapid-aio-edit-nsfw', inv), '1'), 'qwen_image_edit_2511_bf16.safetensors');
  });
  it('fp8 UNET without the fp8 encoder keeps the bf16 encoder', () => {
    const g = preferInstalledFp8ForEdit2511(graph(), 'qwen-image-edit-2511-lightning-4', { availableUnets: inv.availableUnets });
    assert.equal(unet(g, '1'), 'qwen_image_edit_2511_fp8mixed.safetensors');
    assert.equal(unet(g, '2'), 'qwen_2.5_vl_7b.safetensors');
  });
});
