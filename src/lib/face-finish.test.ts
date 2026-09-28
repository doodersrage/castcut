import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFaceFinishGraph,
  FACE_FINISH_DENOISE,
  FACE_FINISH_SAVE_NODE,
  faceFinishSupportsCheckpoint,
  readStillCheckpoint,
} from './face-finish';

describe('face-finish', () => {
  it('conditions the face detailer on the Cast face crop', () => {
    const graph = buildFaceFinishGraph({
      stillName: 'still.png',
      faceName: 'face.png',
      checkpoint: 'Qwen-Rapid-AIO-NSFW-v21.safetensors',
    });
    const detailer = graph['23']!;
    assert.equal(detailer.class_type, 'FaceDetailer');
    assert.equal(detailer.inputs.denoise, FACE_FINISH_DENOISE);
    assert.deepEqual(detailer.inputs.image, ['1', 0]);
    // The positive conditioning carries the face crop as image1.
    assert.deepEqual(detailer.inputs.positive, ['20', 0]);
    assert.deepEqual(graph['20']!.inputs.image1, ['2', 0]);
    assert.equal(graph['2']!.inputs.image, 'face.png');
    assert.deepEqual(graph[FACE_FINISH_SAVE_NODE]!.inputs.images, ['23', 0]);
  });

  it('reads the checkpoint from a still graph and gates to Rapid / Qwen', () => {
    const graph = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v21.safetensors' } },
      '2': { class_type: 'KSampler', inputs: {} },
    };
    const ckpt = readStillCheckpoint(graph);
    assert.equal(ckpt, 'Qwen-Rapid-AIO-NSFW-v21.safetensors');
    assert.equal(faceFinishSupportsCheckpoint(ckpt), true);
    assert.equal(readStillCheckpoint({ '1': { class_type: 'UNETLoader', inputs: {} } }), null);
    assert.equal(faceFinishSupportsCheckpoint('flux-2-klein-9b-distilled.safetensors'), false);
    assert.equal(faceFinishSupportsCheckpoint(null), false);
  });
});
