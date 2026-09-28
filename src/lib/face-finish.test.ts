import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFaceFinishGraph,
  FACE_FINISH_DENOISE,
  FACE_FINISH_SAVE_NODE,
  readStillCheckpoint,
  resolveFaceFinisher,
} from './face-finish';

const full = {
  unets: ['qwen_image_edit_2511_bf16.safetensors', 'flux-2-klein-9b-distilled.safetensors', 'flux-2-klein-base-9b.safetensors'],
  loras: ['Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors'],
  clips: ['qwen_2.5_vl_7b_fp8_scaled.safetensors', 'qwen_3_8b_fp8mixed.safetensors'],
  vaes: ['qwen_image_vae.safetensors', 'flux2-vae.safetensors'],
};

describe('face-finish', () => {
  it('prefers Qwen Edit 2511 + Lightning, then Klein Distilled, then the still checkpoint', () => {
    assert.equal(resolveFaceFinisher(full)?.kind, 'qwen-edit');
    const noQwenLora = { ...full, loras: [] };
    const klein = resolveFaceFinisher(noQwenLora);
    assert.equal(klein?.kind, 'klein-distilled');
    assert.equal(klein && 'unet' in klein ? klein.unet : '', 'flux-2-klein-9b-distilled.safetensors');
    const bare = { unets: ['flux-2-klein-base-9b.safetensors'], loras: [], clips: [], vaes: [] };
    assert.equal(resolveFaceFinisher(bare), null);
    assert.deepEqual(resolveFaceFinisher(bare, 'Qwen-Rapid-AIO-NSFW-v21.safetensors'), {
      kind: 'rapid',
      checkpoint: 'Qwen-Rapid-AIO-NSFW-v21.safetensors',
    });
  });

  it('conditions the detailer on the face crop for every finisher', () => {
    for (const finisher of [
      resolveFaceFinisher(full)!,
      resolveFaceFinisher({ ...full, loras: [] })!,
      { kind: 'rapid' as const, checkpoint: 'Qwen-Rapid-AIO-SFW-v23.safetensors' },
    ]) {
      const graph = buildFaceFinishGraph({ stillName: 'still.png', faceName: 'face.png', finisher });
      const detailer = graph['23']!;
      assert.equal(detailer.class_type, 'FaceDetailer');
      assert.equal(detailer.inputs.denoise, FACE_FINISH_DENOISE);
      assert.deepEqual(detailer.inputs.positive, ['20', 0]);
      assert.equal(graph['2']!.inputs.image, 'face.png');
      const cond = graph['20']!;
      if (finisher.kind === 'klein-distilled') {
        assert.equal(cond.class_type, 'ReferenceLatent');
        assert.equal(detailer.inputs.steps, 4);
      } else {
        assert.equal(cond.class_type, 'TextEncodeQwenImageEditPlus');
        assert.deepEqual(cond.inputs.image1, ['2', 0]);
      }
      assert.deepEqual(graph[FACE_FINISH_SAVE_NODE]!.inputs.images, ['23', 0]);
    }
  });

  it('reads the checkpoint from a still graph', () => {
    assert.equal(
      readStillCheckpoint({
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v21.safetensors' } },
      }),
      'Qwen-Rapid-AIO-NSFW-v21.safetensors'
    );
    assert.equal(readStillCheckpoint({ '1': { class_type: 'UNETLoader', inputs: {} } }), null);
  });
});
