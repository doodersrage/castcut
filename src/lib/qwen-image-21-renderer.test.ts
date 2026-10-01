import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  convertQwenEditWorkflowToImage21,
  isMultiPersonPoseGuide,
  isPenetrationDuoPrompt,
  normalizeQwenRenderer,
  pruneUnreachableNodes,
  QWEN_IMAGE_21_FILES,
  qwenImage21Steps,
  toQwenImage21Prompt,
  withoutDroppedReferences,
} from './qwen-image-21-renderer';

/** The shape of a live Rapid AIO Day still (two faces + pose map, ReferenceLatent chain). */
function rapidDayGraph() {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v23.safetensors' } },
    '4': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { clip: ['903', 1], prompt: 'Keep Image 1 face; partner from Image 2; pose map Image 3.', image1: ['900', 0], image2: ['904', 0], image3: ['905', 0] },
    },
    '5': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { clip: ['903', 1], prompt: 'cartoon', image1: ['900', 0], image2: ['904', 0], image3: ['905', 0] },
    },
    '7': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['903', 0], shift: 3.1 } },
    '8': {
      class_type: 'KSampler',
      inputs: { seed: 5, steps: 8, cfg: 1, sampler_name: 'euler_ancestral', scheduler: 'simple', denoise: 1, model: ['7', 0], positive: ['915', 0], negative: ['5', 0], latent_image: ['906', 0] },
    },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['1', 2] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['902', 0], filename_prefix: 'Castcut' } },
    '900': { class_type: 'LoadImage', inputs: { image: 'lead.png' } },
    '902': { class_type: 'ImageBlur', inputs: { image: ['9', 0], blur_radius: 1, sigma: 0.45 } },
    '903': { class_type: 'LoraLoader', inputs: { model: ['1', 0], clip: ['1', 1], lora_name: 'skin.safetensors' } },
    '904': { class_type: 'LoadImage', inputs: { image: 'partner.png' } },
    '905': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide-x.png' } },
    '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280, batch_size: 1 } },
    '907': { class_type: 'VAEEncode', inputs: { pixels: ['900', 0], vae: ['1', 2] } },
    '913': { class_type: 'ReferenceLatent', inputs: { conditioning: ['4', 0], latent: ['907', 0] } },
    '915': { class_type: 'ReferenceLatent', inputs: { conditioning: ['913', 0], latent: ['907', 0] } },
  };
}

describe('Qwen-Image 2.1 renderer', () => {
  it('rewires the Qwen-Edit sampler onto 2.1 with the same refs, prompt and canvas', () => {
    const { workflow, converted } = convertQwenEditWorkflowToImage21(rapidDayGraph(), { steps: 30 });
    assert.equal(converted, true);
    const nodes = Object.values(workflow) as Array<{ class_type: string; inputs: Record<string, unknown> }>;
    const types = nodes.map(n => n.class_type);
    const encode = nodes.find(n => n.class_type === 'TextEncodeQwenImage21')!;
    assert.deepEqual(encode.inputs['images.image_1'], ['900', 0]);
    assert.deepEqual(encode.inputs['images.image_2'], ['904', 0]);
    assert.deepEqual(encode.inputs['images.image_3'], ['905', 0]);
    assert.match(String(encode.inputs.prompt), /Keep <image1> face; partner from <image2>; pose map <image3>\./);
    const latent = nodes.find(n => n.class_type === 'EmptyLatentImage')!;
    assert.deepEqual([latent.inputs.width, latent.inputs.height], [960, 1280]);
    const sampler = (workflow as Record<string, { inputs: Record<string, unknown> }>)['8'];
    assert.equal(sampler.inputs.steps, 30);
    assert.equal(sampler.inputs.sampler_name, 'euler');
    assert.equal(nodes.find(n => n.class_type === 'UNETLoader')!.inputs.unet_name, QWEN_IMAGE_21_FILES.unet);
    // Old checkpoint, LoRA, Qwen-Edit encoders and ReferenceLatent chain are gone; post steps stay.
    for (const gone of ['CheckpointLoaderSimple', 'LoraLoader', 'TextEncodeQwenImageEditPlus', 'ReferenceLatent', 'ModelSamplingAuraFlow', 'EmptySD3LatentImage']) {
      assert.ok(!types.includes(gone), gone);
    }
    assert.ok(types.includes('ImageBlur') && types.includes('SaveImage'));
    const decode = nodes.find(n => n.class_type === 'VAEDecode')!;
    const vae = (workflow as Record<string, { class_type: string }>)[(decode.inputs.vae as [string, number])[0]];
    assert.equal(vae.class_type, 'VAELoader');
  });

  it('leaves graphs without a Qwen-Edit sampler alone', () => {
    const graph = { '1': { class_type: 'KSampler', inputs: { positive: ['2', 0] } }, '2': { class_type: 'CLIPTextEncode', inputs: {} } };
    const result = convertQwenEditWorkflowToImage21(graph);
    assert.equal(result.converted, false);
    assert.equal(result.workflow, graph);
  });

  it('prunes only when the graph has an output node', () => {
    const graph = { '1': { class_type: 'LoadImage', inputs: {} } };
    assert.equal(pruneUnreachableNodes(graph), graph);
  });

  it('normalizes the setting and maps quality to steps', () => {
    assert.equal(normalizeQwenRenderer('qwen-image-2.1'), 'qwen-image-2.1');
    assert.equal(normalizeQwenRenderer('nope'), 'rapid');
    assert.deepEqual(['draft', 'final', 'max'].map(qwenImage21Steps), [20, 30, 40]);
    assert.equal(toQwenImage21Prompt('image 2 and Image 10'), '<image2> and Image 10');
  });
});

describe('Qwen-Image 2.1: two-person pose maps', () => {
  it('drops a duo pose map and the sentences that point at it', () => {
    const graph = {
      '4': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: {
          prompt:
            'Carry out this change on Image 1. Explicit photo: the two lie on the bed. Keep her face from the first image. Match the two bodies in the second image (pose map). Photorealistic.',
          image1: ['900', 0],
          image2: ['904', 0],
        },
      },
      '8': { class_type: 'KSampler', inputs: { positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
      '900': { class_type: 'LoadImage', inputs: { image: 'day-nude-face-1.png' } },
      '904': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide-missionary-d8c99b-x2-17.png' } },
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
    };
    const { workflow } = convertQwenEditWorkflowToImage21(graph);
    const encode = Object.values(workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>).find(
      node => node.class_type === 'TextEncodeQwenImage21'
    )!;
    assert.deepEqual(encode.inputs['images.image_1'], ['900', 0]);
    assert.equal(encode.inputs['images.image_2'], undefined);
    assert.doesNotMatch(String(encode.inputs.prompt), /pose map|second image/);
    assert.match(String(encode.inputs.prompt), /Keep her face from the first image\./);
  });

  it('keeps one-person maps (Outfit custom pose) and renumbers around a dropped slot', () => {
    assert.equal(isMultiPersonPoseGuide('day-pose-guide-walk-down-down-e05f5d-photo-1.png'), false);
    assert.equal(isMultiPersonPoseGuide('day-pose-guide-lap-59c64f-x2-1790.png'), true);
    assert.equal(
      withoutDroppedReferences('Face from <image1>. Map <image2> shows it. Outfit from <image3>.', [2], [1, 3]),
      'Face from <image1>. Outfit from <image2>.'
    );
  });
});

describe('Qwen-Image 2.1: pose ControlNet for two-person maps', () => {
  const duoGraph = () => ({
    '4': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { prompt: 'Keep her face from the first image. Match the two bodies in the second image (pose map).', image1: ['900', 0], image2: ['904', 0] },
    },
    '8': { class_type: 'KSampler', inputs: { positive: ['4', 0], latent_image: ['906', 0] } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
    '900': { class_type: 'LoadImage', inputs: { image: 'day-nude-face-1.png' } },
    '904': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide-bent-7c9821-x2-17.png' } },
    '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
  });
  type Nodes = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

  it('routes the map through QwenImage21UnionApply (Pose) when the nodes exist', () => {
    const workflow = convertQwenEditWorkflowToImage21(duoGraph(), { poseControl: {} }).workflow as Nodes;
    const apply = Object.values(workflow).find(node => node.class_type === 'QwenImage21UnionApply')!;
    assert.deepEqual(apply.inputs.control_image, ['904', 0]);
    assert.equal(apply.inputs.control_mode, 'Pose');
    assert.equal(apply.inputs.strength, 0.8);
    const sampler = Object.values(workflow).find(node => node.class_type === 'KSampler')!;
    assert.equal(workflow[(sampler.inputs.model as [string, number])[0]].class_type, 'QwenImage21UnionApply');
    const encode = Object.values(workflow).find(node => node.class_type === 'TextEncodeQwenImage21')!;
    assert.equal(encode.inputs['images.image_2'], undefined);
  });

  it('leaves the ControlNet out without the nodes', () => {
    const workflow = convertQwenEditWorkflowToImage21(duoGraph(), { poseControl: false }).workflow as Nodes;
    assert.ok(!Object.values(workflow).some(node => node.class_type === 'QwenImage21UnionApply'));
  });
});

describe('Qwen-Image 2.1: penetration duos stay on the engine model', () => {
  it('flags penetration duos only', () => {
    assert.equal(isPenetrationDuoPrompt('the man lies on top of her, his penis inside her', true), true);
    assert.equal(isPenetrationDuoPrompt('the man stands behind her, penetrating her from behind', true), true);
    assert.equal(isPenetrationDuoPrompt('her girlfriend kneels between her thighs, licking her', true), false);
    assert.equal(isPenetrationDuoPrompt('his penis inside her', false), false);
  });

  it('returns the graph unconverted for a penetration duo', () => {
    const graph = {
      '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt: 'Side view. The man lies on top of her, his penis inside her.', image1: ['900', 0], image2: ['904', 0] } },
      '8': { class_type: 'KSampler', inputs: { positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
      '900': { class_type: 'LoadImage', inputs: { image: 'day-nude-face-1.png' } },
      '904': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide-missionary-d8c99b-x2-17.png' } },
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
    };
    const result = convertQwenEditWorkflowToImage21(graph);
    assert.equal(result.converted, false);
    assert.equal(result.workflow, graph);
  });
});
