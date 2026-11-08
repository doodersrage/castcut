import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ComfyUiModelLists } from '@/lib/comfyui/object-info';

import { CAST_FIRST_PLATE_MODEL, castFirstPlateModel } from './plate-queue';

const models = (unets: string[], checkpoints: string[] = []): ComfyUiModelLists => ({
  checkpoints,
  unets,
  vaes: [],
  upscaleModels: [],
  clips: [],
  dualClipTypes: [],
  clipLoaderTypes: [],
  loras: [],
  controlNets: [],
});

describe('a Cast’s first plate', () => {
  it('renders on Qwen-Image 2.1 when ComfyUI has it, even with UltraReal installed', () => {
    assert.equal(CAST_FIRST_PLATE_MODEL, 'qwen-image-2.1-edit');
    assert.equal(
      castFirstPlateModel(
        models(
          ['ultrarealFineTune_v4.safetensors', 'qwen_image_2.1_bf16.safetensors'],
          ['ultrarealFineTune_v4.safetensors']
        )
      ),
      'qwen-image-2.1-edit'
    );
  });

  it('leaves it to the Edit fallback when Qwen-Image 2.1 is missing or the models are unknown', () => {
    assert.equal(castFirstPlateModel(models(['ultrarealFineTune_v4.safetensors'])), null);
    assert.equal(castFirstPlateModel(null), null);
  });
});
