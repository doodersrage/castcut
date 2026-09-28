import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectLoraFamily, loraFamilyForModel } from './lora-family-detect';

const blocks = (prefix: string, count: number, suffix: string) =>
  Array.from({ length: count }, (_, i) => `${prefix}${i}${suffix}`);

describe('lora-family-detect', () => {
  it('reads the base model from training metadata', () => {
    assert.equal(detectLoraFamily({ metadata: { ss_base_model_version: 'flux2_klein_9b' } }).family, 'flux-klein');
    assert.equal(detectLoraFamily({ metadata: { ss_base_model_version: 'ltx2' } }).family, 'ltx');
    assert.equal(detectLoraFamily({ metadata: { 'modelspec.architecture': 'anima/lora' } }).family, 'other');
    assert.equal(detectLoraFamily({ metadata: { ss_base_model_version: 'Z-image turbo' } }).family, 'z-image');
  });

  it('tells architectures apart from tensor names', () => {
    assert.equal(detectLoraFamily({ keys: blocks('diffusion_model.double_blocks.', 8, '.img_attn.qkv.lora_A.weight') }).family, 'flux-klein');
    assert.equal(detectLoraFamily({ keys: blocks('lora_unet_double_blocks_', 19, '_img_attn_proj.alpha') }).family, 'flux');
    assert.equal(detectLoraFamily({ keys: blocks('transformer.transformer_blocks.', 60, '.attn.to_k.lora.down.weight') }).family, 'qwen');
    assert.equal(detectLoraFamily({ keys: ['diffusion_model.layers.0.attention.qkv.alpha'] }).family, 'z-image');
    assert.equal(detectLoraFamily({ keys: ['diffusion_model.transformer_blocks.0.attn1.to_k.lora_A.weight'] }).family, 'ltx');
    assert.equal(detectLoraFamily({ keys: ['diffusion_model.blocks.0.cross_attn.q.lora_A.weight'] }).family, 'wan');
    assert.equal(detectLoraFamily({ keys: ['lora_unet_down_blocks_0_attentions_0_transformer_blocks_0_attn1_to_q.lora_down.weight', 'lora_te_text_model_encoder_layers_0_mlp_fc1.alpha'] }).family, 'sd15');
    assert.equal(detectLoraFamily({ keys: ['lora_unet_down_blocks_2_attentions_1_transformer_blocks_9_attn1_to_q.lora_down.weight'] }).family, 'sdxl');
    assert.equal(detectLoraFamily({ keys: ['lora_unet_input_blocks_4_1_transformer_blocks_0_attn1_to_k.alpha'] }).family, 'sdxl');
  });

  it('trusts tensor names over trainer-default metadata, but keeps Klein over FLUX.1', () => {
    const qwenKeys = blocks('transformer_blocks.', 60, '.img_mlp.net.0.proj.lora_A.weight');
    assert.equal(detectLoraFamily({ metadata: { ss_base_model_version: 'sd_v1' }, keys: qwenKeys }).family, 'qwen');
    const fluxLike = blocks('double_blocks.', 19, '.img_attn.qkv.lora_A.weight');
    assert.equal(detectLoraFamily({ metadata: { ss_base_model_version: 'flux2_klein_4b' }, keys: fluxLike }).family, 'flux-klein');
  });

  it('picks the most frequent real training tag as the trigger', () => {
    const tags = JSON.stringify({ '10_x': { '1girl': 40, matchingpose9b: 30 } });
    assert.equal(detectLoraFamily({ metadata: { ss_tag_frequency: tags } }).trigger, 'matchingpose9b');
  });

  it('maps queue models to LoRA families', () => {
    assert.equal(loraFamilyForModel('qwen-rapid-aio-edit-nsfw'), 'qwen');
    assert.equal(loraFamilyForModel('qwen-image-2512-lightning-8'), 'qwen');
    assert.equal(loraFamilyForModel('flux-2-klein-9b-distilled'), 'flux-klein');
    assert.equal(loraFamilyForModel('z-image-turbo'), 'z-image');
    assert.equal(loraFamilyForModel('not-a-model'), null);
  });
});
