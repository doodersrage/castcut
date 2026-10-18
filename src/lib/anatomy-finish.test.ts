import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ANATOMY_FINISH_LORA_RE,
  ANATOMY_FINISH_SAVE_NODE,
  anatomyBoxFromPose,
  buildAnatomyFinishGraph,
  colourMatch,
  firstPersonKeypoints,
} from './anatomy-finish';

/** BODY_18 flat keypoints with the hips and knees set (the rest unseen). */
function body(points: Record<number, [number, number]>): number[] {
  const flat = new Array(18 * 3).fill(0);
  for (const [index, [x, y]] of Object.entries(points)) {
    flat[Number(index) * 3] = x;
    flat[Number(index) * 3 + 1] = y;
    flat[Number(index) * 3 + 2] = 0.9;
  }
  return flat;
}

describe('anatomy finish', () => {
  it('boxes the crotch between the hips, a third of the way to the knees', () => {
    const box = anatomyBoxFromPose(
      body({ 8: [420, 900], 11: [680, 900], 9: [380, 1300], 12: [720, 1300] }),
      1104,
      1472
    );
    assert.ok(box);
    assert.equal(box.size, 442); // 1.7 × the 260 px hip width
    assert.equal(box.x, 550 - 221);
    assert.equal(box.y, Math.round(900 + 0.35 * 400 - 221));
  });

  it('keeps the box inside the picture and needs both hips', () => {
    const edge = anatomyBoxFromPose(body({ 8: [10, 1450], 11: [200, 1450] }), 1104, 1472);
    assert.ok(edge);
    assert.ok(edge.x >= 0 && edge.y + edge.size <= 1472);
    assert.equal(anatomyBoxFromPose(body({ 8: [420, 900] }), 1104, 1472), null);
  });

  it("reads the first person from DWPose's openpose_json", () => {
    const json = JSON.stringify([{ people: [{ pose_keypoints_2d: [1, 2, 0.5] }] }]);
    assert.deepEqual(firstPersonKeypoints(json), [1, 2, 0.5]);
    assert.equal(firstPersonKeypoints('not json'), null);
    assert.equal(firstPersonKeypoints(JSON.stringify([{ people: [] }])), null);
  });

  it('matches the average colour only (the spread flattened the patch)', () => {
    const { gain, offset } = colourMatch(
      { mean: [200, 150, 120], std: [40, 40, 40] },
      { mean: [190, 150, 130], std: [20, 20, 20] }
    );
    assert.deepEqual(gain, [1, 1, 1]);
    assert.deepEqual(offset, [-10, 0, 10]);
  });

  it('builds a Turbo img2img graph with the anatomy LoRA on the crop', () => {
    const graph = buildAnatomyFinishGraph({
      cropName: 'crop.png',
      unet: 'qwen_image_2.1_turbo_int8_convrot.safetensors',
      clip: 'qwen3vl_8b_int8_convrot.safetensors',
      vae: 'qwen_image_2.1_vae_bf16.safetensors',
      anatomyLora: 'qwen21_femaledvaginus_v13b.safetensors',
    });
    const types = Object.values(graph).map(node => node.class_type);
    assert.ok(types.includes('VAEEncode'));
    assert.equal(types.filter(type => type === 'LoraLoaderModelOnly').length, 1);
    assert.equal(graph[ANATOMY_FINISH_SAVE_NODE]?.class_type, 'SaveImage');
    const withTurboLora = buildAnatomyFinishGraph({
      cropName: 'crop.png',
      unet: 'qwen_image_2.1_bf16.safetensors',
      turboLora: 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors',
      clip: 'c',
      vae: 'v',
      anatomyLora: 'a',
    });
    assert.equal(
      Object.values(withTurboLora).filter(node => node.class_type === 'LoraLoaderModelOnly').length,
      2
    );
    assert.ok(ANATOMY_FINISH_LORA_RE.test('qwen2_1-femaledVaginus-nsfw-v1_3-fine_L22-31.safetensors'));
  });
});
