import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMFY_IMAGE_MODELS } from '../comfy-models/registry';
import { resolveLoaderFilenamesForModel } from './checkpoint-map';
import { installedComfyModels } from './picker';

const installed2_1 = (unets: string[]) =>
  [...(installedComfyModels(COMFY_IMAGE_MODELS, {
      checkpoints: [],
      unets,
      vaes: [],
      upscaleModels: [],
      clips: [],
      dualClipTypes: [],
      clipLoaderTypes: [],
      loras: [],
      controlNets: [],
    })?.keys() ?? [])].filter(
    id => id.startsWith('qwen-image-2.1')
  );

describe('Qwen-Image 2.1 engines in the picker', () => {
  it('each looks for its own file, not the 2512 model', () => {
    assert.equal(resolveLoaderFilenamesForModel('qwen-image-2.1-edit-noct').unet, 'NoctQ_V4_int8_convrot.safetensors');
    assert.equal(resolveLoaderFilenamesForModel('qwen-image-2.1-edit').unet, 'qwen_image_2.1_bf16.safetensors');
    assert.equal(resolveLoaderFilenamesForModel('qwen-image-2512').unet, 'qwen_image_2512_bf16.safetensors');
  });

  it('Noct-Q reads as installed from its own file (it read as missing in Docker, 2026-10-21)', () => {
    assert.deepEqual(installed2_1(['NoctQ_V4_int8_convrot.safetensors']), ['qwen-image-2.1-edit-noct']);
    assert.deepEqual(installed2_1(['qwen_image_2.1_turbo_int8_convrot.safetensors']), ['qwen-image-2.1-edit-turbo-8']);
    // The 2512 model alone no longer passes for the 2.1 base.
    assert.deepEqual(installed2_1(['qwen_image_2512_bf16.safetensors']), []);
  });
});
