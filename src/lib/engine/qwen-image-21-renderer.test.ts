import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  convertQwenEditWorkflowToImage21,
  isClothedDuoStill,
  isMultiPersonPoseGuide,
  isPlayerPoseGuide,
  isPoseGuideFilename,
  isPenetrationDuoPrompt,
  normalizeQwenRenderer,
  pruneUnreachableNodes,
  QWEN_IMAGE_21_FILES,
  isQwenImage21LightningModel,
  QWEN_IMAGE_21_EIGHT_STEP_LORA,
  QWEN_IMAGE_21_TURBO_LORA,
  qwenImage21FastSampler,
  qwenImage21FullStepsForStill,
  qwenImage21Canvas,
  qwenImage21Resolution,
  qwenImage21Steps,
  toQwenImage21Prompt,
  withoutDroppedReferences,
  withDistinctPartnerOutfit,
  withProfilePromptFixes,
  withTwoPersonFaces,
  isLyingBackNudeSolo,
  withNaturalPoses,
  QWEN_IMAGE_21_CANDID_LINE,
  QWEN_IMAGE_21_LEAN_BODY,
  QWEN_IMAGE_21_RELAXED_STANCE,
  QWEN_IMAGE_21_SLIDE_BODY,
  hasQwenImage21TurboCheckpoint,
  qwenImage21TurboCheckpointFor,
  withDaylightLine,
  withPhotoRealismTail,
  isQwenImage21NoctModel,
  QWEN_IMAGE_21_NOCT_PASS,
  QWEN_IMAGE_21_NOCT_UNET,
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

  it('reads two people from the prompt when no map is attached (2.1 sends none)', () => {
    const lap =
      'Explicit sex photo: Side view of the armchair. The man sits in it; the woman sits on his lap facing him, straddling him, riding his penis.';
    const kneel =
      'Explicit sex photo: Both kneel upright on the bed facing each other, bodies pressed together mid-sex.';
    const oral =
      'Explicit sex photo: Side view, exactly two people. The woman sits on the edge of the bed; the man kneels between her knees, licking her.';
    const solo =
      'Explicit solo photo: One woman alone, masturbating. Two fingers pushed inside her vagina.';
    assert.equal(isPenetrationDuoPrompt(lap, false), true);
    assert.equal(isPenetrationDuoPrompt(kneel, false), true);
    assert.equal(isPenetrationDuoPrompt(oral, false), false);
    assert.equal(isPenetrationDuoPrompt(solo, false), false);
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
    // "Pick the best engine per pose" off: the picked engine (2.1) renders it.
    assert.equal(convertQwenEditWorkflowToImage21(graph, { keepEngine: true }).converted, true);
  });
});

describe('Qwen-Image 2.1: clothed two-person stills', () => {
  const duo = (prompt: string, images: Record<string, string>) => {
    const slots = Object.keys(images);
    return {
      '4': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: {
          prompt,
          ...Object.fromEntries(slots.map((id, index) => [`image${index + 1}`, [id, 0]])),
        },
      },
      '8': { class_type: 'KSampler', inputs: { positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
      ...Object.fromEntries(
        Object.entries(images).map(([id, image]) => [id, { class_type: 'LoadImage', inputs: { image } }])
      ),
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
    };
  };

  it('flags a clothed still with a two-person map, not a nude one or a solo one', () => {
    assert.equal(isClothedDuoStill('TWO PEOPLE in this photo: selfie together.', true), true);
    assert.equal(isClothedDuoStill('Explicit sex photo: she kneels between her thighs.', true), false);
    assert.equal(isClothedDuoStill('Day photo: One woman alone.', false), false);
  });

  it('converts a clothed two-person graph, the two-person map dropped, the partner face kept', () => {
    // Sweep 2026-10-02 (Pruna, long brief): the pair fused 6/6, so these went to Rapid. Turbo on
    // the couple recipe (2026-10-17): two people 56/56 — they stay on 2.1 without the map.
    const plain = duo('TWO PEOPLE in this photo: selfie together. Match Image 2 body positions.', {
      '900': 'cast-plate.png',
      '904': 'day-pose-guide-selfie_duo-82b0de-x2-17.png',
    });
    assert.equal(convertQwenEditWorkflowToImage21(plain).converted, true);
    const withPartner = duo(
      'TWO PEOPLE in this photo: she (wearing rust camisole) and her partner — a woman with dark hair — together. SECOND PERSON: Image 2 is the face of the woman with the Cast lead. Match Image 3 body positions.',
      {
        '900': 'cast-plate.png',
        '901': 'day-partner-vl-1.png',
        '904': 'day-pose-guide-kitchen-82b0de-x2-17.png',
      }
    );
    const result = convertQwenEditWorkflowToImage21(withPartner);
    assert.equal(result.converted, true);
    const loads = Object.values(result.workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>)
      .filter(node => node.class_type === 'LoadImage')
      .map(node => String(node.inputs.image));
    assert.ok(loads.includes('day-partner-vl-1.png'));
    assert.ok(!loads.some(name => /pose-guide/.test(name)));
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

  it('Turbo: its own LoRA and the checkpoint sigmas; lying stills stay at 8 steps', () => {
    const graph = {
      '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt: 'She is lying on her side on a beach towel.', image1: ['900', 0] } },
      '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
      '900': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
    };
    const workflow = convertQwenEditWorkflowToImage21(graph, {
      eightStep: true,
      eightStepTurbo: true,
      qualityProfile: 'max',
    }).workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const byClass = (type: string) => Object.entries(workflow).find(([, node]) => node.class_type === type)!;
    assert.equal(workflow['8']!.class_type, 'SamplerCustomAdvanced');
    assert.equal(byClass('LoraLoaderModelOnly')[1].inputs.lora_name, QWEN_IMAGE_21_TURBO_LORA);
    const sigmas = String(byClass('ManualSigmas')[1].inputs.sigmas).split(',').map(Number);
    assert.equal(sigmas.length, 9);
    assert.equal(sigmas[7], 0.414568);
    assert.equal(qwenImage21FastSampler('qwen-image-2.1-edit-turbo-8'), 'turbo-8');
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

describe('Qwen-Image 2.1: Good / Best lying solo stills take the full pass', () => {
  const lying = 'Day photo: One woman alone. She lies on her side on the sofa, whole body horizontal along it — not sitting.';

  it('only Good or Best, only one person, only lying', () => {
    assert.equal(qwenImage21FullStepsForStill({ qualityProfile: 'max', prompt: lying, solo: true }), true);
    assert.equal(qwenImage21FullStepsForStill({ qualityProfile: 'final', prompt: lying, solo: true }), true);
    assert.equal(qwenImage21FullStepsForStill({ qualityProfile: 'draft', prompt: lying, solo: true }), false);
    assert.equal(qwenImage21FullStepsForStill({ qualityProfile: null, prompt: lying, solo: true }), false);
    assert.equal(qwenImage21FullStepsForStill({ qualityProfile: 'max', prompt: lying, solo: false }), false);
    assert.equal(
      qwenImage21FullStepsForStill({ qualityProfile: 'max', prompt: `TWO PEOPLE in this photo. ${lying}`, solo: true }),
      false
    );
    assert.equal(
      qwenImage21FullStepsForStill({ qualityProfile: 'max', prompt: 'She sits on the sofa, not lying down.', solo: true }),
      false
    );
    assert.equal(
      qwenImage21FullStepsForStill({ qualityProfile: 'max', prompt: 'She is reclining on a lounger.', solo: true }),
      true
    );
  });

  const graph = (prompt: string, image2?: string) => ({
    '4': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { prompt, image1: ['900', 0], ...(image2 ? { image2: ['901', 0] } : {}) },
    },
    '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
    '900': { class_type: 'LoadImage', inputs: { image: 'face.png' } },
    ...(image2 ? { '901': { class_type: 'LoadImage', inputs: { image: image2 } } } : {}),
    '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
  });
  const sampler = (workflow: Record<string, unknown>) =>
    (workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>)['8']!;

  it('drops the Pruna LoRA for that still and samples 30 steps', () => {
    const best = convertQwenEditWorkflowToImage21(graph(lying, 'day-dress-plate-1.png'), {
      eightStep: true,
      steps: 30,
      qualityProfile: 'max',
    }).workflow;
    assert.equal(sampler(best).class_type, 'KSampler');
    assert.equal(sampler(best).inputs.steps, 30);
    assert.ok(!Object.values(best).some(node => (node as { class_type: string }).class_type === 'LoraLoaderModelOnly'));
    const good = convertQwenEditWorkflowToImage21(graph(lying, 'day-dress-plate-1.png'), {
      eightStep: true,
      qualityProfile: 'final',
    }).workflow;
    assert.equal(sampler(good).class_type, 'KSampler');
    const fast = convertQwenEditWorkflowToImage21(graph(lying, 'day-dress-plate-1.png'), {
      eightStep: true,
      qualityProfile: 'draft',
    }).workflow;
    assert.equal(sampler(fast).class_type, 'SamplerCustomAdvanced');
  });

  it('a partner face keeps the 8-step pass', () => {
    const duo = convertQwenEditWorkflowToImage21(graph(lying, 'day-partner-vl-1.png'), {
      eightStep: true,
      qualityProfile: 'max',
    }).workflow;
    assert.equal(sampler(duo).class_type, 'SamplerCustomAdvanced');
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

describe('Qwen-Image 2.1: group stills', () => {
  it('opens a three-person still with three people, not two', () => {
    const out = withTwoPersonFaces(
      'Day photo: Three people together — exactly three, the woman from the first image, the man from the second image, and the woman from the third image.',
      { partnerImage: 2, droppedPoseMap: false }
    );
    assert.match(out, /^Exactly three people/);
    assert.doesNotMatch(out, /Exactly two people/);
  });
});

describe('Qwen-Image 2.1: look', () => {
  it('lights a daytime Day recipe, leaves a slot with its own LIGHT line alone', () => {
    const day = 'SCENE: a park.\nOUTFIT (mandatory): a dress.\nDay photo: One woman alone.';
    assert.match(withDaylightLine(day), /LIGHT: bright, well-exposed natural light[^\n]*\nOUTFIT/);
    const night = 'SCENE: a bar.\nLIGHT: night — lamps.\nOUTFIT (mandatory): a dress.\nDay photo: x.';
    assert.equal(withDaylightLine(night), night);
    assert.equal(withDaylightLine('OUTFIT (mandatory): a dress.'), 'OUTFIT (mandatory): a dress.');
  });

  it('swaps the murky night line for bright pools of the place\'s light', () => {
    const night =
      'SCENE: a street.\nLIGHT: night — she is lit only by the place’s own lights (street lamps): pools of warm and cool light on her skin and clothes, deep shadows. She is lit like the place around her, not by a studio light.\nOUTFIT (mandatory): a dress.\nDay photo: x.';
    const out = withDaylightLine(night);
    assert.match(out, /bright pools of warm and coloured light falling on her/);
    assert.doesNotMatch(out, /deep shadows/);
  });

  it('adds the photo-realism tail once', () => {
    const out = withPhotoRealismTail('Day photo: x. Photorealistic photograph, natural skin. More.');
    assert.match(out, /natural skin, natural photograph, lifelike skin pores, camera realism\. More/);
    assert.equal(withPhotoRealismTail(out), out);
  });

  it('drops Rapid AIO moiré polish before the save', () => {
    const graph = {
      '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt: 'Day photo: One woman alone.', image1: ['900', 0] } },
      '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '902': { class_type: 'ImageBlur', inputs: { image: ['9', 0], blur_radius: 1, sigma: 0.45 }, _meta: { title: 'Castcut — Rapid AIO moiré polish' } },
      '10': { class_type: 'SaveImage', inputs: { images: ['902', 0] } },
      '900': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
    };
    const w = convertQwenEditWorkflowToImage21(graph, { eightStep: true, eightStepTurbo: true }).workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    assert.deepEqual(w['10']!.inputs.images, ['9', 0]);
    assert.ok(!Object.values(w).some(node => node.class_type === 'ImageBlur'));
  });
});

describe('Qwen-Image 2.1: nude solo lying on her back', () => {
  const graph = (prompt: string) => ({
    '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt, image1: ['900', 0] } },
    '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
    '900': { class_type: 'LoadImage', inputs: { image: 'day-nude-face-1.png' } },
    '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 1104, height: 1472 } },
  });
  const LYING = 'Keep facial likeness only: Explicit solo photo: One woman alone, masturbating. She lies on her back on the bed, head on the pillow. She is completely nude.';

  it('gets the lie-flat line and a landscape canvas', () => {
    assert.equal(isLyingBackNudeSolo(LYING), true);
    const w = convertQwenEditWorkflowToImage21(graph(LYING), { eightStep: true, eightStepTurbo: true }).workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const latent = Object.values(w).find(n => n.class_type === 'EmptyLatentImage')!;
    assert.deepEqual([latent.inputs.width, latent.inputs.height], [1472, 1104]);
    const enc = Object.values(w).find(n => n.class_type === 'TextEncodeQwenImage21')!;
    assert.match(String(enc.inputs.prompt), /POSE FIRST: she lies flat on her back/);
  });

  it('leaves seated, clothed and two-person stills alone', () => {
    assert.equal(isLyingBackNudeSolo(LYING.replace('lies on her back', 'sits on the bed edge')), false);
    assert.equal(isLyingBackNudeSolo('Day photo: One woman alone. She lies on her back on the beach towel.'), false);
    assert.equal(isLyingBackNudeSolo(`${LYING} Her partner kneels beside her.`), false);
  });
});

describe('Qwen-Image 2.1 Turbo sampler', () => {
  const graph = {
    '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt: 'Day photo: she reads.', image1: ['900', 0] } },
    '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
    '900': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
    '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 1104, height: 1472 } },
  };
  const samplerOf = (opts: { eightStep: boolean; eightStepTurbo?: boolean }) =>
    Object.values(
      convertQwenEditWorkflowToImage21(structuredClone(graph), opts).workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>
    ).find(n => n.class_type === 'KSamplerSelect')!.inputs.sampler_name;

  it('runs Turbo on er_sde and Pruna on euler', () => {
    assert.equal(samplerOf({ eightStep: true, eightStepTurbo: true }), 'er_sde');
    assert.equal(samplerOf({ eightStep: true }), 'euler');
  });
});

describe('Qwen-Image 2.1 Turbo checkpoint', () => {
  const graph = {
    '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt: 'Day photo: she reads.', image1: ['900', 0] } },
    '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
    '900': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
    '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 1104, height: 1472 } },
  };
  const nodes = (opts: Record<string, boolean>) =>
    Object.values(
      convertQwenEditWorkflowToImage21(structuredClone(graph), opts).workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>
    );

  it('loads the Turbo checkpoint with no base and no LoRA', () => {
    const w = nodes({ eightStep: true, eightStepTurbo: true, turboCheckpoint: true });
    assert.equal(w.find(n => n.class_type === 'UNETLoader')!.inputs.unet_name, 'qwen_image_2.1_turbo_int8_convrot.safetensors');
    assert.equal(w.filter(n => n.class_type === 'LoraLoaderModelOnly').length, 0);
  });

  it('keeps the base + Turbo LoRA without it, and Pruna ignores the flag', () => {
    const lora = nodes({ eightStep: true, eightStepTurbo: true });
    assert.equal(lora.find(n => n.class_type === 'UNETLoader')!.inputs.unet_name, 'qwen_image_2.1_bf16.safetensors');
    assert.match(String(lora.find(n => n.class_type === 'LoraLoaderModelOnly')!.inputs.lora_name), /turbo_lora/);
    const pruna = nodes({ eightStep: true, turboCheckpoint: true });
    assert.equal(pruna.find(n => n.class_type === 'UNETLoader')!.inputs.unet_name, 'qwen_image_2.1_bf16.safetensors');
  });

  it('lets the queue inventory decide over the runtime guess', () => {
    const withCkpt = ['qwen_image_2.1_turbo_int8_convrot.safetensors'];
    // A re-roll whose runtime had no cached inventory still gets the checkpoint…
    assert.equal(qwenImage21TurboCheckpointFor(withCkpt, undefined), true);
    // …and a stale guess never asks for a file ComfyUI doesn't list.
    assert.equal(qwenImage21TurboCheckpointFor(['qwen_image_2.1_bf16.safetensors'], true), false);
    // No queue inventory: the runtime's guess stands.
    assert.equal(qwenImage21TurboCheckpointFor(null, true), true);
    assert.equal(qwenImage21TurboCheckpointFor(undefined, undefined), undefined);
  });

  it('finds the checkpoint in the inventory', () => {
    assert.equal(hasQwenImage21TurboCheckpoint({ unets: ['qwen/qwen_image_2.1_turbo_int8_convrot.safetensors'] }), true);
    assert.equal(hasQwenImage21TurboCheckpoint({ unets: ['qwen_image_2.1_bf16.safetensors'] }), false);
    assert.equal(hasQwenImage21TurboCheckpoint(null), false);
  });
});

describe('Qwen-Image 2.1: four-person group header', () => {
  it('names four faces for a four-person still', () => {
    const out = withTwoPersonFaces(
      'Day photo: Four people together — exactly four, all fully clothed. <image2> is the face of her partner.',
      { partnerImage: 2, droppedPoseMap: false }
    );
    assert.match(out, /^Exactly four people, .* <image1>, <image2>, <image3> and <image4> are only the four people's faces/);
  });
});

describe('Qwen-Image 2.1: more than four reference pictures', () => {
  it('carries image5 (the room photo of a four-person still) into the 2.1 encoder', () => {
    const graph = {
      '4': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: {
          prompt: 'Day photo: Four people together — exactly four. Place: the room shown in Image 5.',
          image1: ['900', 0],
          image2: ['901', 0],
          image3: ['902', 0],
          image4: ['903', 0],
          image5: ['904', 0],
        },
      },
      '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
      '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
      '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
      '900': { class_type: 'LoadImage', inputs: { image: 'lead.png' } },
      '901': { class_type: 'LoadImage', inputs: { image: 'day-partner-vl-1.png' } },
      '902': { class_type: 'LoadImage', inputs: { image: 'third.png' } },
      '903': { class_type: 'LoadImage', inputs: { image: 'fourth.png' } },
      '904': { class_type: 'LoadImage', inputs: { image: 'room.png' } },
      '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 1104, height: 1472 } },
    };
    const w = convertQwenEditWorkflowToImage21(graph, { eightStep: true, eightStepTurbo: true })
      .workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const enc = Object.values(w).find(n => n.class_type === 'TextEncodeQwenImage21')!;
    const fifth = enc.inputs['images.image_5'] as [string, number];
    assert.ok(fifth, 'image_5 wired');
    assert.equal(w[fifth[0]].inputs.image, 'room.png');
  });
});


describe('Qwen-Image 2.1: natural pose wording', () => {
  it('a dance sways instead of a stage pose; a stretch keeps the feet flat', () => {
    const out = withNaturalPoses(
      'POSE FIRST: she dances, both arms raised overhead, one knee lifted mid-step, hips mid-sway. Pose: both arms stretched high overhead, back long, up on the balls of the feet.'
    );
    assert.match(out, /swaying to the music, one hand raised loosely/);
    assert.match(out, /both feet flat/);
    assert.doesNotMatch(out, /balls of the feet|one knee lifted/);
  });

  it('reaching for a pier railing leans on it; reaching for a high shelf keeps the reach', () => {
    const pier =
      'POSE FIRST: she stands reaching up with one arm high, the other arm out — reaching for a pier railing mid-lean. She stands reaching up with one arm high, the other arm out.';
    const out = withNaturalPoses(pier);
    assert.match(out, /^POSE FIRST: she leans on the railing with one hand on it/);
    assert.match(out, /She leans on the railing with one hand on it/);
    const shelf = 'She stands reaching up with one arm high, the other arm out — reaching for a jar on a high shelf.';
    assert.equal(withNaturalPoses(shelf), shelf);
  });
});

describe('Qwen-Image 2.1: lying on her back with a pose map attached', () => {
  const graph = (image2: string) => ({
    '4': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: {
        prompt:
          'Edit Image 1: Explicit solo photo: One woman alone, masturbating. She lies on her back on the bed. Match her body to the second image (pose map). She is completely nude — bare breasts.',
        image1: ['900', 0],
        image2: ['901', 0],
      },
    },
    '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
    '900': { class_type: 'LoadImage', inputs: { image: 'day-nude-face-1.png' } },
    '901': { class_type: 'LoadImage', inputs: { image: image2 } },
    '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 1104, height: 1472 } },
  });
  const latentOf = (image2: string) =>
    Object.values(
      convertQwenEditWorkflowToImage21(graph(image2), { eightStep: true, eightStepTurbo: true })
        .workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>
    ).find(n => n.class_type === 'EmptyLatentImage')!.inputs;

  it('"the second image" (its pose map) is not a second person — night sweep 3/3 missed', () => {
    assert.deepEqual([latentOf('day-pose-guide-on_back-1.png').width, latentOf('day-pose-guide-on_back-1.png').height], [1472, 1104]);
  });

  it('a partner face attached keeps the duo canvas', () => {
    assert.notDeepEqual([latentOf('day-partner-vl-1.png').width, latentOf('day-partner-vl-1.png').height], [1472, 1104]);
  });
});

describe('Qwen-Image 2.1: lying on her side', () => {
  it('a nude solo on her side on the couch gets the side line', async () => {
    const { lieSideLineFor } = await import('./qwen-image-21-renderer');
    const line = lieSideLineFor(
      'Explicit solo photo: One woman alone. She lies on her side on the couch facing the camera. She is completely nude — bare breasts.'
    );
    assert.match(String(line), /lies on her side along the couch — her whole body horizontal, head resting on the cushion at one end/);
    assert.equal(lieSideLineFor('Day photo: One woman alone. She lies on her side on the couch reading.'), null);
  });
});

describe('2.1 across-the-table duos', () => {
  it('seats a duo "across from" each other at the table, not side by side (night sweep, 2026-10-17)', async () => {
    const { withNaturalPoses, QWEN_IMAGE_21_ACROSS_TABLE_LINE } = await import('./qwen-image-21-renderer');
    const out = withNaturalPoses(
      'Edit <image1>: POSE FIRST: the two people — diner booth across from a friend, leaning into conversation. SCENE: a diner.'
    );
    assert.ok(out.includes(`leaning into conversation — ${QWEN_IMAGE_21_ACROSS_TABLE_LINE}. SCENE`));
    assert.equal(withNaturalPoses(out), out);
    const side = 'Edit <image1>: POSE FIRST: the two people — sitting side by side on the couch. SCENE: home.';
    assert.equal(withNaturalPoses(side), side);
    // A one-person still: this rewrite leaves it; only the candid camera line joins.
    const solo = 'Edit <image1>: POSE FIRST: seated across from the window. SCENE: cafe.';
    assert.equal(
      withNaturalPoses(solo),
      `Edit <image1>: POSE FIRST: seated across from the window. ${QWEN_IMAGE_21_CANDID_LINE} SCENE: cafe.`
    );
  });
});

describe('2.1 swimsuit colour', () => {
  it('a bare swimsuit gets a bold colour (skin-toned 4/4 → fabric 3/3, 2026-10-17)', async () => {
    const { withNaturalPoses, QWEN_IMAGE_21_SWIMSUIT_WORDS } = await import('./qwen-image-21-renderer');
    const out = withNaturalPoses('OUTFIT (mandatory): she wears a swimsuit; the base. She wears a swimsuit.');
    assert.equal(out.split(QWEN_IMAGE_21_SWIMSUIT_WORDS).length, 3);
    assert.equal(withNaturalPoses(out), out);
    const red = 'She wears a swimsuit in a red colour.';
    assert.equal(withNaturalPoses(red), red);
  });
});

describe('2.1 duo jobs', () => {
  it('a shared task gives each of the two a job (night sweep, 2026-10-17)', async () => {
    const { withNaturalPoses } = await import('./qwen-image-21-renderer');
    const wrap = (beat: string) => `Edit <image1>: POSE FIRST: the two people — ${beat}. SCENE: home.`;
    const cook = withNaturalPoses(wrap('cooking with her partner at the stove, both stirring one pot'));
    assert.match(cook, /both stirring one pot — one of them stirs the pot with a wooden spoon, the other leans in tasting/);
    assert.equal(withNaturalPoses(cook), cook);
    assert.match(withNaturalPoses(wrap('sitting side by side at one desk, both looking at a laptop screen')), /one of them types on the laptop/);
    assert.match(withNaturalPoses(wrap('seated knee-to-knee with a companion sharing a menu')), /holds it open between them/);
    assert.match(withNaturalPoses(wrap('sitting up in bed sharing breakfast, trays on their laps')), /lifts a forkful/);
    const dance = withNaturalPoses(
      'Edit <image1>: POSE FIRST: the two people — face each other, one hand joined and held out. SCENE: club. Moment: dancing with a friend under club lights.'
    );
    assert.match(dance, /one hand joined and held out — dancing together face to face/);
    assert.equal(withNaturalPoses(dance), dance);
    assert.match(withNaturalPoses(wrap('singing karaoke, sharing one mic')), /both lean in to the one microphone/);
    assert.match(withNaturalPoses(wrap('on the couch sharing coffee after the party')), /each holds a mug of coffee/);
    const walk = wrap('walking side by side through the market');
    assert.equal(withNaturalPoses(walk), walk);
    // A one-person still: this rewrite leaves it; the relaxed stance and candid line join.
    const solo = 'Edit <image1>: POSE FIRST: cooking pasta at the stove. SCENE: home.';
    assert.equal(
      withNaturalPoses(solo),
      `Edit <image1>: POSE FIRST: cooking pasta at the stove, ${QWEN_IMAGE_21_RELAXED_STANCE}. ${QWEN_IMAGE_21_CANDID_LINE} SCENE: home.`
    );
  });
});

describe('2.1 sport kit label', () => {
  it('lower-cases the SPORT KIT label so it is not printed on the jersey (2026-10-18)', async () => {
    const { withNaturalPoses } = await import('./qwen-image-21-renderer');
    const out = withNaturalPoses('outfit: ATHLETIC KIT ONLY — wear only the SPORT KIT. SPORT KIT (mandatory): a jersey.');
    assert.equal(out, 'outfit: athletic kit only — wear only the sport kit. sport kit (mandatory): a jersey.');
  });
});

describe('Qwen-Image 2.1: face-down nude solos stay on the engine model', () => {
  const solo = (prompt: string, extra: Record<string, string> = {}) => ({
    '4': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { prompt, image1: ['900', 0], ...(extra['904'] ? { image2: ['904', 0] } : {}) },
    },
    '8': { class_type: 'KSampler', inputs: { positive: ['4', 0], latent_image: ['906', 0] } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
    '900': { class_type: 'LoadImage', inputs: { image: 'day-nude-face-1.png' } },
    ...(extra['904'] ? { '904': { class_type: 'LoadImage', inputs: { image: extra['904'] } } } : {}),
    '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280 } },
  });

  it('returns a face-down nude solo unconverted (Turbo 0/9 face-down, Rapid 3/3; 2026-10-18)', async () => {
    const { isFaceDownNudeSolo } = await import('./qwen-image-21-renderer');
    assert.equal(isFaceDownNudeSolo('Explicit solo photo. She lies stretched out flat on her stomach on the bed.', true), true);
    assert.equal(isFaceDownNudeSolo('Day photo. Lying on her stomach on the bed scrolling, fully dressed.', true), false);
    const graph = solo('Explicit solo photo: One woman alone, naked. She lies stretched out flat on her stomach on the bed.');
    const result = convertQwenEditWorkflowToImage21(graph);
    assert.equal(result.converted, false);
    assert.equal(result.workflow, graph);
  });

  it('still converts a nude solo on her back, and a face-down beat with a partner', () => {
    assert.equal(convertQwenEditWorkflowToImage21(solo('Explicit solo photo, naked. She lies on her back on the bed.')).converted, true);
    const partner = solo('Explicit photo, naked. She lies face-down on the bed, kissed by her partner.', {
      '904': 'day-partner-man-abc.png',
    });
    assert.equal(convertQwenEditWorkflowToImage21(partner).converted, true);
  });
});

describe('2.1 held props', () => {
  it('carries a held prop from the moment into POSE FIRST (fruit bags 0/3 → 3/3, 2026-10-18)', async () => {
    const { withNaturalPoses } = await import('./qwen-image-21-renderer');
    const p =
      'Edit <image1>: POSE FIRST: the two people — side by side with heads close, she holds a phone out. SCENE: market. Moment: selfie with a friend at the farmers market, fruit bags in hand.';
    const out = withNaturalPoses(p);
    assert.match(out, /she holds a phone out — fruit bags in hand\. SCENE/);
    assert.equal(withNaturalPoses(out), out);
    const already = 'Edit <image1>: POSE FIRST: walking with a coffee in one hand. Moment: walking, a coffee in one hand.';
    assert.equal(withNaturalPoses(already), already);
  });
});

describe('the player’s own 2.1 LoRAs', () => {
  it('chains them onto the model before the cache, and nothing when there are none', () => {
    const plain = convertQwenEditWorkflowToImage21(rapidDayGraph(), { steps: 30 }).workflow as Record<
      string,
      { class_type: string; inputs: Record<string, unknown> }
    >;
    assert.equal(Object.values(plain).filter(n => n.class_type === 'LoraLoaderModelOnly').length, 0);
    const { workflow } = convertQwenEditWorkflowToImage21(rapidDayGraph(), {
      steps: 30,
      userLoras: [
        { name: 'qwen21_femaledvaginus_v13b.safetensors', strength: 0.7 },
        { name: 'qwen21_detail_fix_v2.safetensors', strength: 0 },
      ],
    });
    const nodes = workflow as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const loras = Object.entries(nodes).filter(([, n]) => n.class_type === 'LoraLoaderModelOnly');
    assert.equal(loras.length, 1);
    assert.equal(loras[0]![1].inputs.lora_name, 'qwen21_femaledvaginus_v13b.safetensors');
    assert.equal(loras[0]![1].inputs.strength_model, 0.7);
    const cache = Object.values(nodes).find(n => n.class_type === 'QwenImage21Cache')!;
    assert.deepEqual(cache.inputs.model, [loras[0]![0], 0]);
  });
});

describe('Qwen-Image 2.1: natural look-backs and candid scene stills', () => {
  const SOLO =
    'Edit <image1>: POSE FIRST: she kneels upright on the bed, looking back over her shoulder at the camera, full body in frame. SCENE: a dark bedroom. Vacation photo: One woman alone. She walks mid-step, full body in frame. The woman: a White woman in her thirties, athletic and endurance-toned with defined posture, with olive skin. Keep facial identity and camera framing.';

  it('turns a look-back only as far as a neck turns', () => {
    const out = withNaturalPoses(SOLO);
    assert.doesNotMatch(out, /looking back over her shoulder at the camera/);
    assert.match(out, /head turned back over her shoulder only as far as a real neck turns/);
    assert.match(
      withNaturalPoses('She stands at the stove, looking back over a shoulder.'),
      /body turned three-quarters away/
    );
  });

  it('a solo scene still: camera to one side, no framing or posture pin, full body said once', () => {
    const out = withNaturalPoses(SOLO);
    assert.ok(out.includes(`${QWEN_IMAGE_21_CANDID_LINE} SCENE: `));
    assert.match(out, /Keep facial identity\.$/);
    assert.doesNotMatch(out, /camera framing|defined posture/);
    assert.equal(out.split('full body in frame').length - 1, 1);
    assert.equal(withNaturalPoses(out), out);
  });

  it('leaves plate edits and two-person stills as they were', () => {
    const plate =
      'Carry out this change on <image1> even if lighting, wardrobe, or background must change. Keep facial identity and camera framing.';
    assert.equal(withNaturalPoses(plate), plate);
    const duo = SOLO.replace('One woman alone', 'Exactly two people');
    assert.doesNotMatch(withNaturalPoses(duo), /Photographed candidly/);
  });
});

describe('Qwen-Image 2.1: natural POSE FIRST on one-person stills (2026-10-20 sweep)', () => {
  const still = (pose: string) => `Edit <image1>: POSE FIRST: ${pose}.\nSCENE: she is in the park — show that place around her.`;
  const first = (pose: string) => withNaturalPoses(still(pose)).split('\n')[0]!;

  it('a standing gesture gets a relaxed stance; a pose off her feet or in motion does not', () => {
    assert.match(first('both hands on the hips, elbows bent out to the sides'), new RegExp(QWEN_IMAGE_21_RELAXED_STANCE));
    for (const pose of [
      'she kneels upright on the bed',
      'both hands hold a book open — reads a book, curled up in an armchair',
      'she walks mid-step, one foot ahead of the other',
      'she crouches low, knees bent deep',
      'one foot up on a bench, tying her sneaker',
    ]) {
      assert.doesNotMatch(first(pose), /standing relaxed/, pose);
    }
  });

  it('a lean says how she leans; eating at a café table sits her down', () => {
    assert.ok(first('she is leaning against a café wall').endsWith(`${QWEN_IMAGE_21_LEAN_BODY}.`));
    assert.match(first('one hand brings food up to the mouth — eating a croissant at a café table'), /sitting on a chair at the table\.$/);
    assert.doesNotMatch(first('she stands eating a croissant at a café table'), /sitting on a chair/);
  });

  it('a sport still stays mid-action: no candid line, no relaxed stance', () => {
    const sport = 'Edit <image1>: POSE FIRST: mid-action — tennis serve, racket high.\nSCENE: she is in the court — show that place around her. ACTION: tennis serve.';
    const out = withNaturalPoses(sport);
    assert.doesNotMatch(out, /Photographed candidly|standing relaxed/);
  });

  it('a slide into a base is down on the dirt, not running', () => {
    assert.match(first('mid-action — softball player sliding feet-first into second base'), new RegExp(QWEN_IMAGE_21_SLIDE_BODY.slice(0, 40)));
    assert.equal(withNaturalPoses(withNaturalPoses(still('sliding into home plate'))), withNaturalPoses(still('sliding into home plate')));
  });
});


describe('Qwen-Image 2.1 Noct-Q', () => {
  const graph = {
    '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt: 'Day photo: she reads.', image1: ['900', 0] } },
    '8': { class_type: 'KSampler', inputs: { seed: 7, positive: ['4', 0], latent_image: ['906', 0] } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0] } },
    '900': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
    '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 1104, height: 1472 } },
  };
  type Node = { class_type: string; inputs: Record<string, unknown> };
  const convert = (opts: Parameters<typeof convertQwenEditWorkflowToImage21>[1]) =>
    convertQwenEditWorkflowToImage21(structuredClone(graph), opts).workflow as Record<string, Node>;
  const noct = { fullUnet: QWEN_IMAGE_21_NOCT_UNET, ...QWEN_IMAGE_21_NOCT_PASS };

  it('runs the full pass on its own file, 35 steps at cfg 1, through shift 3', () => {
    const w = convert(noct);
    const all = Object.values(w);
    assert.equal(all.find(n => n.class_type === 'UNETLoader')!.inputs.unet_name, QWEN_IMAGE_21_NOCT_UNET);
    assert.equal(all.filter(n => n.class_type === 'LoraLoaderModelOnly').length, 0);
    const ks = w['8']!.inputs;
    assert.equal(ks.steps, 35);
    assert.equal(ks.cfg, 1);
    const shift = w[(ks.model as [string, number])[0]]!;
    assert.equal(shift.class_type, 'ModelSamplingAuraFlow');
    assert.equal(shift.inputs.shift, 3);
    assert.equal(w[(shift.inputs.model as [string, number])[0]]!.class_type, 'QwenImage21Cache');
  });

  it('leaves the fast samplers and the plain full pass alone', () => {
    const turbo = Object.values(convert({ ...noct, eightStep: true, eightStepTurbo: true, turboCheckpoint: true }));
    assert.equal(turbo.find(n => n.class_type === 'UNETLoader')!.inputs.unet_name, 'qwen_image_2.1_turbo_int8_convrot.safetensors');
    assert.equal(turbo.some(n => n.class_type === 'ModelSamplingAuraFlow'), false);
    const plain = Object.values(convert({}));
    assert.equal(plain.find(n => n.class_type === 'UNETLoader')!.inputs.unet_name, 'qwen_image_2.1_bf16.safetensors');
    assert.equal(plain.some(n => n.class_type === 'ModelSamplingAuraFlow'), false);
  });

  it('is told apart from the other 2.1 engines', () => {
    assert.equal(isQwenImage21NoctModel('qwen-image-2.1-edit-noct'), true);
    assert.equal(isQwenImage21NoctModel('qwen-image-2.1-edit'), false);
    assert.equal(qwenImage21FastSampler('qwen-image-2.1-edit-noct'), null);
  });
});
