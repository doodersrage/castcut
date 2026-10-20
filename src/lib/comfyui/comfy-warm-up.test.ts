import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildWarmUpGraph, decideWarmUp } from './comfy-warm-up';

/** A Day still on Qwen Edit 2511 as the app queues it (prompts trimmed). */
const EDIT_2511_STILL = {
  '1': {
    class_type: 'UNETLoader',
    inputs: { unet_name: 'qwen_image_edit_2511_bf16.safetensors', weight_dtype: 'default' },
  },
  '2': {
    class_type: 'CLIPLoader',
    inputs: { clip_name: 'qwen_2.5_vl_7b.safetensors', type: 'qwen_image' },
  },
  '3': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
  '4': {
    class_type: 'TextEncodeQwenImageEditPlus',
    inputs: { clip: ['2', 0], image1: ['900', 0], prompt: 'She reads by the window.' },
  },
  '5': {
    class_type: 'TextEncodeQwenImageEditPlus',
    inputs: { clip: ['2', 0], image1: ['900', 0], prompt: '' },
  },
  '6': { class_type: 'EmptySD3LatentImage', inputs: { width: 1104, height: 1472, batch_size: 1 } },
  '7': {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['1', 0], lora_name: 'lightning-8.safetensors', strength_model: 1 },
  },
  '8': {
    class_type: 'KSampler',
    inputs: {
      seed: 1,
      steps: 8,
      cfg: 1,
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
      model: ['11', 0],
      positive: ['909', 0],
      negative: ['5', 0],
      latent_image: ['6', 0],
    },
  },
  '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
  '10': { class_type: 'SaveImage', inputs: { images: ['904', 0], filename_prefix: 'Castcut' } },
  '11': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['7', 0], shift: 3 } },
  '900': { class_type: 'LoadImage', inputs: { image: 'cast-plate.png' } },
  '904': {
    class_type: 'ImageScaleBy',
    inputs: { image: ['9', 0], upscale_method: 'lanczos', scale_by: 1.05 },
  },
  '905': {
    class_type: 'ResizeAndPadImage',
    inputs: { image: ['900', 0], target_width: 1104, target_height: 1472 },
  },
  '908': { class_type: 'VAEEncode', inputs: { pixels: ['905', 0], vae: ['3', 0] } },
  '909': { class_type: 'ReferenceLatent', inputs: { conditioning: ['4', 0], latent: ['908', 0] } },
};

/** Qwen-Image 2.1 runs a custom sampler with manual sigmas. */
const QWEN_21_STILL = {
  '8': {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['925', 0],
      guider: ['926', 0],
      sampler: ['927', 0],
      sigmas: ['928', 0],
      latent_image: ['924', 0],
    },
  },
  '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['920', 0] } },
  '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'Castcut' } },
  '900': { class_type: 'LoadImage', inputs: { image: 'face.png' } },
  '918': {
    class_type: 'UNETLoader',
    inputs: { unet_name: 'qwen_image_2.1_bf16.safetensors', weight_dtype: 'default' },
  },
  '919': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl.safetensors', type: 'qwen_image' } },
  '920': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' } },
  '923': {
    class_type: 'TextEncodeQwenImage21',
    inputs: { clip: ['919', 0], vae: ['920', 0], resolution: 1280, 'images.image_1': ['900', 0] },
  },
  '924': { class_type: 'EmptyLatentImage', inputs: { width: 1104, height: 1472, batch_size: 1 } },
  '925': { class_type: 'RandomNoise', inputs: { noise_seed: 11 } },
  '926': { class_type: 'BasicGuider', inputs: { model: ['918', 0], conditioning: ['923', 0] } },
  '927': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
  '928': { class_type: 'ManualSigmas', inputs: { sigmas: '1.0, 0.93, 0.85, 0.0' } },
};

describe('buildWarmUpGraph', () => {
  it('keeps the loaders exactly and shrinks the rest', () => {
    const graph = buildWarmUpGraph(EDIT_2511_STILL)!;
    assert.ok(graph);
    assert.deepEqual(graph['1'], EDIT_2511_STILL['1']);
    assert.deepEqual(graph['7'], EDIT_2511_STILL['7']);
    assert.equal(graph['8']!.inputs.steps, 1);
    assert.equal(graph['6']!.inputs.width, 64);
    assert.equal(graph['905']!.inputs.target_height, 64);
    assert.equal(graph['900']!.class_type, 'EmptyImage');
    assert.equal(graph['10'], undefined, 'SaveImage dropped');
    assert.equal(graph['904'], undefined, 'post-decode upscale dropped');
    assert.deepEqual(graph.warmup_preview, {
      class_type: 'PreviewImage',
      inputs: { images: ['9', 0] },
    });
    // The source graph is left alone.
    assert.equal(EDIT_2511_STILL['8'].inputs.steps, 8);
  });

  it('cuts manual sigmas to one step', () => {
    const graph = buildWarmUpGraph(QWEN_21_STILL)!;
    assert.equal(graph['928']!.inputs.sigmas, '1.0, 0.0');
    assert.equal(graph['924']!.inputs.height, 64);
    assert.equal(graph['900']!.class_type, 'EmptyImage');
  });

  it('refuses graphs without a model, sampler or decode', () => {
    assert.equal(buildWarmUpGraph({ '1': { class_type: 'LoadImage', inputs: {} } }), null);
    const noDecode = Object.fromEntries(
      Object.entries(EDIT_2511_STILL).filter(([id]) => id !== '9')
    );
    assert.equal(buildWarmUpGraph(noDecode), null);
    assert.equal(buildWarmUpGraph('nope'), null);
  });
});

describe('decideWarmUp', () => {
  const base = {
    queueRunning: 0,
    queuePending: 0,
    targetModelKey: 'qwen_image_edit_2511_bf16',
    lastModelKey: 'qwen-rapid-aio-nsfw-v23',
  };

  it('warms an idle ComfyUI that last ran another model', () => {
    assert.deepEqual(decideWarmUp(base), { go: true });
  });

  it('never jumps anyone: busy queue skips', () => {
    assert.deepEqual(decideWarmUp({ ...base, queuePending: 1 }), { go: false, reason: 'busy' });
    assert.deepEqual(decideWarmUp({ ...base, queueRunning: 1 }), { go: false, reason: 'busy' });
  });

  it('skips the model that ran last', () => {
    assert.deepEqual(
      decideWarmUp({ ...base, lastModelKey: 'qwen_image_edit_2511_bf16.safetensors' }),
      { go: false, reason: 'already-loaded' }
    );
  });

  it('skips when free VRAM cannot hold it next to what is loaded', () => {
    const gb = 1024 ** 3;
    assert.deepEqual(
      decideWarmUp({ ...base, vramFreeBytes: 3 * gb, vramTotalBytes: 24 * gb, modelBytes: 40 * gb }),
      { go: false, reason: 'vram' }
    );
    // Bigger than the card: 90 % of the card is enough.
    assert.deepEqual(
      decideWarmUp({ ...base, vramFreeBytes: 22 * gb, vramTotalBytes: 24 * gb, modelBytes: 40 * gb }),
      { go: true }
    );
    assert.deepEqual(decideWarmUp({ ...base, vramFreeBytes: 1 }), { go: true });
  });

  it('needs a template', () => {
    assert.deepEqual(decideWarmUp({ ...base, targetModelKey: null }), {
      go: false,
      reason: 'no-template',
    });
  });
});
