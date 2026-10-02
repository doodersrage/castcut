import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  convertQwenEditWorkflowToImage21,
  isMultiPersonPoseGuide,
  isPlayerPoseGuide,
  isPoseGuideFilename,
  isPenetrationDuoPrompt,
  normalizeQwenRenderer,
  pruneUnreachableNodes,
  QWEN_IMAGE_21_FILES,
  isQwenImage21LightningModel,
  QWEN_IMAGE_21_EIGHT_STEP_LORA,
  qwenImage21FastSampler,
  qwenImage21Canvas,
  qwenImage21Resolution,
  qwenImage21Steps,
  toQwenImage21Prompt,
  withoutDroppedReferences,
  withDistinctPartnerOutfit,
  withProfilePromptFixes,
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
    '905': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide-walk-down-down-e05f5d-photo-1.png' } },
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
    assert.deepEqual([latent.inputs.width, latent.inputs.height], [1104, 1472]);
    assert.equal(encode.inputs.resolution, qwenImage21Resolution(1104, 1472));
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
    assert.deepEqual(['draft', 'final', 'max'].map(qwenImage21Steps), [20, 30, 30]);
    assert.equal(toQwenImage21Prompt('image 2 and Image 10'), '<image2> and Image 10');
    assert.equal(
      toQwenImage21Prompt('face from the first image; the woman has the face from the second image'),
      'face from the <image1>; the woman has the face from the <image2>'
    );
    assert.deepEqual(qwenImage21Canvas(960, 1280), { width: 1104, height: 1472 });
    assert.deepEqual(qwenImage21Canvas(1280, 960), { width: 1472, height: 1104 });
    assert.deepEqual(qwenImage21Canvas(1024, 1024), { width: 1280, height: 1280 });
    assert.deepEqual(qwenImage21Canvas(1920, 1080), { width: 1664, height: 928 });
    assert.equal(qwenImage21Resolution(1104, 1472), 1280);
  });
});

describe('Qwen-Image 2.1: one-person pose maps', () => {
  type Node = { class_type: string; inputs: Record<string, unknown> };
  const encoderOf = (workflow: unknown) =>
    (Object.values(workflow as Record<string, Node>) as Node[]).find(
      node => node.class_type === 'TextEncodeQwenImage21'
    )!;
  it('leaves out a planned map and its sentences; keeps a pose the player drew', () => {
    const planned = rapidDayGraph();
    planned['905']!.inputs.image = 'day-pose-guide-cook-82b0de-x1-17.png';
    planned['4']!.inputs.prompt =
      'Day photo: One woman alone. Keep her face from the first image. She wears the outfit from the second image. Match her body to the third image (pose map). Photorealistic photograph.';
    const { workflow } = convertQwenEditWorkflowToImage21(planned, { steps: 30 });
    const encode = encoderOf(workflow);
    assert.deepEqual(encode.inputs['images.image_1'], ['900', 0]);
    assert.deepEqual(encode.inputs['images.image_2'], ['904', 0]);
    assert.equal(encode.inputs['images.image_3'], undefined);
    assert.doesNotMatch(String(encode.inputs.prompt), /pose map|<image3>/);
    assert.match(String(encode.inputs.prompt), /Keep her face from the <image1>\./);

    // The fixture's own map is a player pose ("-photo-"): sent as the third reference.
    const drawn = convertQwenEditWorkflowToImage21(rapidDayGraph(), { steps: 30 }).workflow;
    const kept = encoderOf(drawn);
    assert.deepEqual(kept.inputs['images.image_3'], ['905', 0]);
    assert.equal(isPlayerPoseGuide('day-pose-guide-walk-down-down-e05f5d-photo-1.png'), true);
    assert.equal(isPlayerPoseGuide('day-pose-guide-cook-82b0de-x1-17.png'), false);
    assert.equal(isPoseGuideFilename('fitting-garment-packshot-1.png'), false);
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
    assert.doesNotMatch(String(encode.inputs.prompt), /pose map|second image|<image2>/);
    assert.match(String(encode.inputs.prompt), /Keep her face from the <image1>\./);
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
      inputs: { prompt: 'Nude photo. Keep her face from the first image. Match the two bodies in the second image (pose map).', image1: ['900', 0], image2: ['904', 0] },
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

describe('Qwen-Image 2.1: clothed duo maps stay out', () => {
  it('drops a two-person map so the diagram is not painted as an extra arm', () => {
    const graph = {
      '4': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { prompt: 'TWO PEOPLE in this photo: selfie together. Match Image 2 body positions.', image1: ['900', 0], image2: ['904', 0] },
      },
      '8': { class_type: 'KSampler', inputs: { positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
      '900': { class_type: 'LoadImage', inputs: { image: 'cast-plate.png' } },
      '904': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide-selfie_duo-82b0de-x2-17.png' } },
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
    };
    const workflow = convertQwenEditWorkflowToImage21(graph).workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const encode = Object.values(workflow).find(node => node.class_type === 'TextEncodeQwenImage21')!;
    assert.equal(encode.inputs['images.image_2'], undefined);
    assert.doesNotMatch(String(encode.inputs.prompt), /body positions|pose map/);
    assert.match(String(encode.inputs.prompt), /exactly two arms/);
  });

  it('binds each face to its own person when the partner crop is attached', () => {
    const graph = {
      '4': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: {
          prompt:
            'TWO PEOPLE in this photo: she (wearing rust camisole) and her partner — a woman with dark hair, in their own different clothes — together. SECOND PERSON: Image 2 is the face of the woman with the Cast lead. Match Image 3 body positions.',
          image1: ['900', 0],
          image2: ['901', 0],
          image3: ['904', 0],
        },
      },
      '8': { class_type: 'KSampler', inputs: { positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
      '900': { class_type: 'LoadImage', inputs: { image: 'cast-plate.png' } },
      '901': { class_type: 'LoadImage', inputs: { image: 'day-partner-vl-1.png' } },
      '904': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide-kitchen-82b0de-x2-17.png' } },
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
    };
    const workflow = convertQwenEditWorkflowToImage21(graph).workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const encode = Object.values(workflow).find(node => node.class_type === 'TextEncodeQwenImage21')!;
    assert.deepEqual(encode.inputs['images.image_1'], ['900', 0]);
    assert.deepEqual(encode.inputs['images.image_2'], ['901', 0]);
    assert.equal(encode.inputs['images.image_3'], undefined);
    assert.ok(encode.inputs.vae);
    const prompt = String(encode.inputs.prompt);
    assert.match(prompt, /^Exactly two people, each with exactly two arms/);
    assert.match(prompt, /<image1> is only the first person's face/);
    assert.match(prompt, /<image2> is only the second person's face/);
    assert.match(prompt, /Only she wears the rust camisole/);
    assert.doesNotMatch(prompt, /black knit|pose map|body positions/);
  });
});

describe('Qwen-Image 2.1: clothed duo partner outfit', () => {
  it('keeps the lead outfit on the lead and does not invent the partner clothes', () => {
    const out = withDistinctPartnerOutfit(
      'Keep facial likeness only: TWO PEOPLE in this photo: she (wearing tapered forest green two-piece linen suit) and her partner — a South Asian woman, in their own different clothes — are both fully in frame, together — walking hand in hand. Next sentence.'
    );
    assert.match(
      out,
      /walking hand in hand\. Only she wears the tapered forest green two-piece linen suit\. Her partner does not wear that outfit, any piece of it, or the same color\. Next sentence\./
    );
    assert.doesNotMatch(out, /black knit|white linen|gray sweater/);
  });

  it('uses the partner kit already named on the line', () => {
    const out = withDistinctPartnerOutfit(
      'TWO PEOPLE in this photo: she (wearing rust camisole) and her partner (wearing cream turtleneck) — a woman with dark hair — together in the kitchen.'
    );
    assert.match(
      out,
      /Only she wears the rust camisole; her partner wears the cream turtleneck — never the same outfit or color as her\./
    );
    assert.doesNotMatch(out, /black knit/);
  });

  it('handles a man lead and runs once', () => {
    const man = withDistinctPartnerOutfit(
      'TWO PEOPLE in this photo: he (wearing black tuxedo) and his friend — a tall man, in their own different clothes — together.'
    );
    assert.match(
      man,
      /Only he wears the black tuxedo\. His friend does not wear that outfit, any piece of it, or the same color\./
    );
    assert.equal(withDistinctPartnerOutfit(man), man);
    assert.equal(withDistinctPartnerOutfit('Solo still of her.'), 'Solo still of her.');
  });
});

describe('Qwen-Image 2.1: unnamed outfit', () => {
  it('dresses her when the slot names no outfit', () => {
    const out = withProfilePromptFixes("beat: zip a bag\nreplace clothing with this slot's catalog wardrobe kit\n", {
      namePartnerOutfit: true,
      dressWhenNoOutfit: true,
    });
    assert.match(out, /fully dressed in everyday clothes/);
    assert.doesNotMatch(out, /catalog wardrobe kit/);
  });
});

describe('Qwen-Image 2.1: 4-step sampler', () => {
  it('swaps the KSampler for the PDD 4-step node when asked', () => {
    const graph = {
      '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt: 'Solo still.', image1: ['900', 0] } },
      '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
      '900': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
    };
    const workflow = convertQwenEditWorkflowToImage21(graph, { fourStep: true }).workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    assert.equal(workflow['8']!.class_type, 'T8QwenImage21FunAccPDD4Step');
    assert.equal(workflow['8']!.inputs.seed, 7);
    assert.deepEqual(workflow['9']!.inputs.samples, ['8', 0]);
    const latent = Object.values(workflow).find(node => node.class_type === 'EmptyLatentImage')!;
    assert.deepEqual([latent.inputs.width, latent.inputs.height], [1104, 1472]);
    const encode = Object.values(workflow).find(node => node.class_type === 'TextEncodeQwenImage21')!;
    assert.equal(encode.inputs.resolution, qwenImage21Resolution(1104, 1472));
  });
});

describe('Qwen-Image 2.1: 8-step sampler (Pruna LoRA)', () => {
  it('loads the LoRA ahead of the cache and samples on its fixed sigmas', () => {
    const graph = {
      '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt: 'Solo still.', image1: ['900', 0] } },
      '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
      '900': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
    };
    const workflow = convertQwenEditWorkflowToImage21(graph, { eightStep: true }).workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const byClass = (type: string) => Object.entries(workflow).find(([, node]) => node.class_type === type)!;
    assert.equal(workflow['8']!.class_type, 'SamplerCustomAdvanced');
    assert.deepEqual(workflow['9']!.inputs.samples, ['8', 0]);
    const [loraId, lora] = byClass('LoraLoaderModelOnly');
    assert.equal(lora.inputs.lora_name, QWEN_IMAGE_21_EIGHT_STEP_LORA);
    assert.deepEqual(byClass('QwenImage21Cache')[1].inputs.model, [loraId, 0]);
    assert.equal(String(byClass('ManualSigmas')[1].inputs.sigmas).split(',').length, 9);
    assert.equal(byClass('RandomNoise')[1].inputs.noise_seed, 7);
    const latent = byClass('EmptyLatentImage')[1];
    assert.deepEqual([latent.inputs.width, latent.inputs.height], [1104, 1472]);
  });

  it('the 4-step node wins if both are asked for; the full pass has no LoRA', () => {
    const graph = {
      '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt: 'Solo still.', image1: ['900', 0] } },
      '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
      '900': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
    };
    const both = convertQwenEditWorkflowToImage21(graph, { fourStep: true, eightStep: true }).workflow as Record<string, { class_type: string }>;
    assert.equal(both['8']!.class_type, 'T8QwenImage21FunAccPDD4Step');
    assert.ok(!Object.values(both).some(node => node.class_type === 'LoraLoaderModelOnly'));
    const full = convertQwenEditWorkflowToImage21(graph).workflow as Record<string, { class_type: string }>;
    assert.equal(full['8']!.class_type, 'KSampler');
    assert.ok(!Object.values(full).some(node => node.class_type === 'LoraLoaderModelOnly'));
  });
});

describe('Qwen-Image 2.1 Lightning model', () => {
  it('picks the fast sampler from the engine id', () => {
    assert.equal(qwenImage21FastSampler('qwen-image-2.1-edit-lightning-4'), 'fun-acc-4');
    assert.equal(qwenImage21FastSampler('qwen-image-2.1-edit-pruna-8'), 'pruna-8');
    assert.equal(qwenImage21FastSampler('qwen-image-2.1-edit'), null);
    assert.equal(qwenImage21FastSampler('qwen-image-2512-lightning-8'), null);
  });

  it('is only the lightning id, not the base model', () => {
    assert.equal(isQwenImage21LightningModel('qwen-image-2.1-edit-lightning-4'), true);
    assert.equal(isQwenImage21LightningModel('qwen-image-2.1-edit-pruna-8'), true);
    assert.equal(isQwenImage21LightningModel('qwen-image-2.1-edit'), false);
    assert.equal(isQwenImage21LightningModel('qwen-image-2512-lightning-4'), false);
  });
});
