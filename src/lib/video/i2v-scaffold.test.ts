import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBuiltInVideoI2vWorkflow,
  attachLtxClipLoader,
  pickLtxTextEncoderFilename,
  resolveInstalledVideoWeight,
  resolveVideoSplitCompanions,
  rewriteCheckpointLoadersToVideoSplit,
  videoWeightIsUnetOnly,
} from './i2v-scaffold';

describe('video I2V built-in scaffold', () => {
  it('uses EmptyLTXVLatentVideo for LTX and EmptyHunyuanLatentVideo for WAN', () => {
    const wan = buildBuiltInVideoI2vWorkflow('wan-video');
    const ltx = buildBuiltInVideoI2vWorkflow('ltx-video');
    assert.equal((wan['4'] as { class_type?: string }).class_type, 'EmptyHunyuanLatentVideo');
    assert.equal((ltx['4'] as { class_type?: string }).class_type, 'EmptyLTXVLatentVideo');
    assert.equal((wan['5'] as { inputs?: { denoise?: number } }).inputs?.denoise, 1);
    const ltxPositive = ltx['2'] as { inputs?: { clip?: [string, number] } };
    const ltxClip = ltx['10'] as { class_type?: string; inputs?: { type?: string; clip_name?: string } };
    assert.equal(ltxClip.class_type, 'CLIPLoader');
    assert.equal(ltxClip.inputs?.type, 'ltxv');
    assert.equal(ltxClip.inputs?.clip_name, 't5xxl_fp16.safetensors');
    assert.deepEqual(ltxPositive.inputs?.clip, ['10', 0]);
    assert.equal((wan['10'] as { class_type?: string } | undefined)?.class_type, undefined);
  });

  it('keeps an installed mapped weight and otherwise picks a WAN file from inventory', () => {
    const inventory = [
      'qwen_image_2512_fp8_e4m3fn.safetensors',
      'wan2.2-i2v-rapid-aio-v10.safetensors',
    ];
    assert.equal(
      resolveInstalledVideoWeight(
        'wan-video',
        'wan2.2-i2v-rapid-aio-v10-nsfw.safetensors',
        inventory
      ),
      'wan2.2-i2v-rapid-aio-v10.safetensors'
    );
    assert.equal(
      resolveInstalledVideoWeight('wan-video', 'missing-wan.safetensors', inventory),
      'wan2.2-i2v-rapid-aio-v10.safetensors'
    );
  });

  it('treats Hunyuan I2V as UNET-only when it is missing from checkpoints', () => {
    assert.equal(
      videoWeightIsUnetOnly(
        'hunyuan_video_image_to_video_720p_bf16.safetensors',
        ['DreamShaper_8_pruned.safetensors'],
        ['hunyuan_video_image_to_video_720p_bf16.safetensors']
      ),
      true
    );
    assert.equal(
      videoWeightIsUnetOnly(
        'wan2.2-i2v-rapid-aio-v10.safetensors',
        [],
        ['wan2.2-i2v-rapid-aio-v10.safetensors']
      ),
      false
    );
  });

  it('rewrites CheckpointLoaderSimple to Hunyuan DualCLIP + VAE + UNET', () => {
    const split = resolveVideoSplitCompanions({
      model: 'hunyuan-video',
      unet: 'hunyuan_video_image_to_video_720p_bf16.safetensors',
      availableClips: ['clip_l.safetensors', 'llava_llama3_fp8_scaled.safetensors'],
      availableVaes: ['hunyuan_video_vae_bf16.safetensors'],
    });
    assert.equal(split.error, undefined);
    const rewritten = rewriteCheckpointLoadersToVideoSplit(
      buildBuiltInVideoI2vWorkflow('hunyuan-video'),
      split.companions!
    );
    const loader = rewritten.workflow['1'] as {
      class_type?: string;
      inputs?: { unet_name?: string };
    };
    const positive = rewritten.workflow['2'] as { inputs?: { clip?: [string, number] } };
    const decode = rewritten.workflow['6'] as { inputs?: { vae?: [string, number] } };
    assert.equal(loader.class_type, 'UNETLoader');
    assert.equal(loader.inputs?.unet_name, 'hunyuan_video_image_to_video_720p_bf16.safetensors');
    assert.equal(positive.inputs?.clip?.[1], 0);
    assert.equal(decode.inputs?.vae?.[1], 0);
    const clipNode = rewritten.workflow[positive.inputs!.clip![0]] as {
      class_type?: string;
      inputs?: { type?: string };
    };
    assert.equal(clipNode.class_type, 'DualCLIPLoader');
    assert.equal(clipNode.inputs?.type, 'hunyuan_video');
  });

  it('rewires leftover LTX checkpoint CLIP None onto CLIPLoader type ltxv', () => {
    assert.equal(pickLtxTextEncoderFilename(['t5xxl_fp8_e4m3fn.safetensors']), 't5xxl_fp8_e4m3fn.safetensors');
    const attached = attachLtxClipLoader(
      {
        '1': {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: 'ltxv-2b-0.9.8-distilled.safetensors' },
        },
        '2': { class_type: 'CLIPTextEncode', inputs: { text: 'pos', clip: ['1', 1] } },
        '3': { class_type: 'CLIPTextEncode', inputs: { text: 'neg', clip: ['1', 1] } },
        '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      },
      't5xxl_fp16.safetensors'
    );
    assert.equal(attached.attached, 1);
    assert.ok(attached.rewired >= 2);
    const positive = attached.workflow['2'] as { inputs?: { clip?: [string, number] } };
    const decode = attached.workflow['6'] as { inputs?: { vae?: [string, number] } };
    assert.equal(positive.inputs?.clip?.[1], 0);
    assert.deepEqual(decode.inputs?.vae, ['1', 2]);
    const clipNode = attached.workflow[positive.inputs!.clip![0]] as {
      class_type?: string;
      inputs?: { type?: string; clip_name?: string };
    };
    assert.equal(clipNode.class_type, 'CLIPLoader');
    assert.equal(clipNode.inputs?.type, 'ltxv');
    assert.equal(clipNode.inputs?.clip_name, 't5xxl_fp16.safetensors');
  });

  it('rewires leftover checkpoint CLIP even when a T5 CLIPLoader is already in the graph', () => {
    const attached = attachLtxClipLoader(
      {
        '1': {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: 'ltxv-2b-0.9.8-distilled.safetensors' },
        },
        '2': { class_type: 'CLIPTextEncode', inputs: { text: 'pos', clip: ['1', 1] } },
        '10': {
          class_type: 'CLIPLoader',
          inputs: { clip_name: 't5xxl_fp16.safetensors', type: 'ltxv' },
        },
      },
      't5xxl_fp8_e4m3fn.safetensors'
    );
    assert.equal(attached.attached, 0);
    assert.equal(attached.rewired, 1);
    const positive = attached.workflow['2'] as { inputs?: { clip?: [string, number] } };
    assert.deepEqual(positive.inputs?.clip, ['10', 0]);
    const clipNode = attached.workflow['10'] as { inputs?: { clip_name?: string } };
    assert.equal(clipNode.inputs?.clip_name, 't5xxl_fp8_e4m3fn.safetensors');
  });

  it('rewires LoraLoader CLIP passthrough off the LTX checkpoint', () => {
    const attached = attachLtxClipLoader(
      {
        '1': {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: 'ltxv-2b-0.9.8-distilled.safetensors' },
        },
        '8': {
          class_type: 'LoraLoader',
          inputs: { model: ['1', 0], clip: ['1', 1], lora_name: 'style.safetensors' },
        },
        '2': { class_type: 'CLIPTextEncode', inputs: { text: 'pos', clip: ['8', 1] } },
      },
      't5xxl_fp16.safetensors'
    );
    const lora = attached.workflow['8'] as { inputs?: { clip?: [string, number] } };
    const positive = attached.workflow['2'] as { inputs?: { clip?: [string, number] } };
    assert.equal(lora.inputs?.clip?.[1], 0);
    assert.deepEqual(positive.inputs?.clip, ['8', 1]);
    const clipNode = attached.workflow[String(lora.inputs!.clip![0])] as {
      class_type?: string;
      inputs?: { type?: string };
    };
    assert.equal(clipNode.class_type, 'CLIPLoader');
    assert.equal(clipNode.inputs?.type, 'ltxv');
  });
});
