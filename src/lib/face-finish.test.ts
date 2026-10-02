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

describe('Face finish on a two-person still', () => {
  const finisher = { kind: 'rapid', checkpoint: 'Qwen-Rapid-AIO-SFW-v23.safetensors' } as const;

  it('re-renders only the face on the lead\'s side, a little harder', async () => {
    const { buildFaceFinishGraph, FACE_FINISH_DUO_DENOISE } = await import('./face-finish');
    const all = buildFaceFinishGraph({ stillName: 'still.png', faceName: 'face.png', finisher });
    assert.equal(all['23']!.class_type, 'FaceDetailer');
    for (const [side, descending] of [
      ['leftmost', false],
      ['rightmost', true],
    ] as const) {
      const graph = buildFaceFinishGraph({
        stillName: 'still.png',
        faceName: 'face.png',
        finisher,
        onlyFace: side,
      });
      assert.equal(graph['24']!.class_type, 'BboxDetectorSEGS');
      assert.deepEqual(
        [graph['25']!.inputs.target, graph['25']!.inputs.order, graph['25']!.inputs.take_count],
        ['x1', descending, 1]
      );
      // The detailer works on the filtered face only, with the same model and conditioning.
      assert.equal(graph['23']!.class_type, 'DetailerForEach');
      assert.deepEqual(graph['23']!.inputs.segs, ['25', 0]);
      assert.deepEqual(graph['23']!.inputs.positive, all['23']!.inputs.positive);
      assert.equal(graph['23']!.inputs.denoise, FACE_FINISH_DUO_DENOISE);
      assert.deepEqual(graph['99']!.inputs.images, ['23', 0]);
    }
  });

  it('tells the lead from the partner by distance to the Cast face', async () => {
    const { pickLeadFace, soleFaceIsLead } = await import('./face-finish');
    // The larger face (first) is the partner; she is the closer one, on the left.
    assert.deepEqual(
      pickLeadFace([
        { x: 547, distance: 0.798 },
        { x: 373, distance: 0.207 },
      ]),
      { side: 'leftmost', distance: 0.207 }
    );
    assert.equal(
      pickLeadFace([
        { x: 120, distance: 0.9 },
        { x: 640, distance: 0.55 },
      ])?.side,
      'rightmost'
    );
    // Too close to call, one face only (the node repeats it), or no reading: leave the still.
    assert.equal(
      pickLeadFace([
        { x: 100, distance: 0.62 },
        { x: 500, distance: 0.6 },
      ]),
      null
    );
    const one = [
      { x: 300, distance: 0.5 },
      { x: 300, distance: 0.5 },
    ];
    assert.equal(pickLeadFace(one), null);
    assert.equal(pickLeadFace([{ x: null, distance: null }]), null);
    // One visible face that is plausibly hers may take the ordinary pass; a stranger's may not.
    assert.equal(soleFaceIsLead(one), true);
    assert.equal(
      soleFaceIsLead([
        { x: 300, distance: 0.93 },
        { x: 300, distance: 0.93 },
      ]),
      false
    );
    assert.equal(soleFaceIsLead([{ x: null, distance: null }]), false);
  });

  it('one probed face: only the largest detected face is finished, and her side is what is re-checked', async () => {
    const { buildFaceFinishGraph, leadFaceDistance } = await import('./face-finish');
    const graph = buildFaceFinishGraph({
      stillName: 'still.png',
      faceName: 'face.png',
      finisher,
      onlyFace: 'largest',
    });
    assert.deepEqual(
      [graph['25']!.inputs.target, graph['25']!.inputs.order, graph['25']!.inputs.take_count],
      ['area(=w*h)', true, 1]
    );
    assert.equal(graph['23']!.class_type, 'DetailerForEach');
    // After the pass the partner (x 547) is the closer face — her side (left) is what counts.
    const after = [
      { x: 547, distance: 0.3 },
      { x: 373, distance: 0.6 },
    ];
    assert.equal(leadFaceDistance(after, 'leftmost'), 0.6);
    assert.equal(leadFaceDistance(after, 'rightmost'), 0.3);
    assert.equal(leadFaceDistance(after, 'largest'), 0.3);
    assert.equal(leadFaceDistance([{ x: null, distance: null }], 'leftmost'), null);
  });

  it('probes the two largest faces against the Cast face', async () => {
    const { buildLeadFaceProbeGraph, LEAD_FACE_PROBE_NODES } = await import('./face-finish');
    const graph = buildLeadFaceProbeGraph({ stillName: 'still.png', faceName: 'face.png' });
    assert.deepEqual(
      [graph.b0!.inputs.index, graph.b1!.inputs.index],
      [0, 1]
    );
    assert.deepEqual(graph.d1!.inputs.reference, ['2', 0]);
    for (const ids of LEAD_FACE_PROBE_NODES) {
      assert.equal(graph[ids.distance]!.class_type, 'PreviewAny');
      assert.equal(graph[ids.x]!.class_type, 'PreviewAny');
    }
  });
});

