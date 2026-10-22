import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cameraChoiceLine } from './camera-shot';
import {
  buildShotReframeGraph,
  pickedReframeShot,
  reframeIsSolo,
  reframeSourceOf,
  SHOT_REFRAME_PREFIX,
  SHOT_REFRAME_SAVE_NODE,
  shotReframeRect,
} from './shot-reframe';

type Nodes = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

const SIZE = { width: 1104, height: 1472 };
// A thigh-up Turbo still from the camera bench: face box 0.13 of the height, near the top.
const FACE = { x: 480, y: 130, width: 150, height: 190 };

describe('pickedReframeShot', () => {
  it('reads the waist-up and close-up picks from the Camera line', () => {
    assert.equal(pickedReframeShot(`Day photo. ${cameraChoiceLine({ shot: 'waist' })}`), 'waist');
    assert.equal(
      pickedReframeShot(`x ${cameraChoiceLine({ height: 'low', shot: 'head', lens: 'long' })}`),
      'head'
    );
    assert.equal(pickedReframeShot(cameraChoiceLine({ shot: 'knees' })), null);
    assert.equal(pickedReframeShot(cameraChoiceLine({ shot: 'full' })), null);
    assert.equal(pickedReframeShot('a waist-up shot of her'), null);
  });
});

describe('shotReframeRect', () => {
  it('cuts head and shoulders around the face, in the still’s aspect', () => {
    const rect = shotReframeRect(SIZE, FACE, 'head')!;
    assert.ok(rect);
    assert.ok(Math.abs(rect.width / rect.height - SIZE.width / SIZE.height) < 0.01);
    // Hair inside, the face in the upper half, centred across.
    assert.ok(rect.y < FACE.y && rect.y >= FACE.y - FACE.height);
    assert.ok(FACE.y + FACE.height < rect.y + rect.height / 2 + FACE.height);
    assert.ok(Math.abs(rect.x + rect.width / 2 - (FACE.x + FACE.width / 2)) <= 1);
    assert.ok(rect.height < SIZE.height * 0.45);
  });

  it('waist-up is taller than head and shoulders and starts at the same hairline', () => {
    const waist = shotReframeRect(SIZE, FACE, 'waist')!;
    const head = shotReframeRect(SIZE, FACE, 'head')!;
    assert.ok(waist.height > head.height * 1.4);
    assert.ok(Math.abs(waist.y - head.y) < FACE.height * 0.2);
  });

  it('stays inside the still and leaves a still that is already close', () => {
    const edge = shotReframeRect(SIZE, { x: 1000, y: 10, width: 100, height: 120 }, 'head')!;
    assert.ok(edge.x + edge.width <= SIZE.width && edge.y >= 0);
    assert.equal(shotReframeRect(SIZE, { x: 300, y: 200, width: 450, height: 600 }, 'head'), null);
    assert.equal(shotReframeRect(SIZE, { x: 0, y: 0, width: 0, height: 0 }, 'waist'), null);
  });

  it('never enlarges more than 4×: a tiny face gets a looser frame', () => {
    const rect = shotReframeRect(SIZE, { x: 540, y: 100, width: 30, height: 40 }, 'head')!;
    assert.ok(rect.height >= SIZE.height / 4 - 1);
  });
});

describe('reframeIsSolo', () => {
  it('leaves two-person stills alone', () => {
    assert.equal(reframeIsSolo('Day photo: One woman alone.'), true);
    assert.equal(reframeIsSolo('two people on a bench, her partner beside her'), false);
  });
});

function turboStill(): Nodes {
  return {
    '8': {
      class_type: 'SamplerCustomAdvanced',
      inputs: { noise: ['915', 0], guider: ['916', 0], sampler: ['917', 0], sigmas: ['918', 0], latent_image: ['914', 0] },
    },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['911', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'Castcut' } },
    '900': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
    '909': { class_type: 'UNETLoader', inputs: { unet_name: 'turbo.safetensors' } },
    '910': { class_type: 'CLIPLoader', inputs: { clip_name: 'te.safetensors' } },
    '911': { class_type: 'VAELoader', inputs: { vae_name: 'vae.safetensors' } },
    '912': { class_type: 'QwenImage21Cache', inputs: { model: ['909', 0] } },
    '913': {
      class_type: 'TextEncodeQwenImage21',
      inputs: { clip: ['910', 0], vae: ['911', 0], prompt: `One woman alone. ${cameraChoiceLine({ shot: 'head' })}`, 'images.image_1': ['900', 0] },
    },
    '914': { class_type: 'EmptyLatentImage', inputs: { width: 1104, height: 1472, batch_size: 1 } },
    '915': { class_type: 'RandomNoise', inputs: { noise_seed: 22 } },
    '916': { class_type: 'BasicGuider', inputs: { model: ['912', 0], conditioning: ['913', 0] } },
    '917': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'er_sde' } },
    '918': { class_type: 'ManualSigmas', inputs: { sigmas: '1, 0.9, 0.7, 0.4, 0' } },
  };
}

describe('buildShotReframeGraph', () => {
  const rect = { x: 380, y: 16, width: 413, height: 551 };

  it('reads the still graph: its prompt and canvas', () => {
    const source = reframeSourceOf(turboStill())!;
    assert.deepEqual(source.size, SIZE);
    assert.equal(pickedReframeShot(source.prompt), 'head');
    assert.equal(reframeSourceOf({ '1': { class_type: 'KSampler', inputs: {} } }), null);
  });

  it('crops and enlarges with lanczos to the still’s size — no model is loaded', () => {
    const graph = buildShotReframeGraph({ stillName: 'shot-reframe-1.png', rect, size: SIZE }) as Nodes;
    assert.deepEqual(graph.rf_crop!.inputs, { image: ['rf_load', 0], ...rect });
    assert.equal(graph.rf_scale!.inputs.width, 1104);
    assert.equal(graph.rf_scale!.inputs.height, 1472);
    assert.equal(graph.rf_scale!.inputs.upscale_method, 'lanczos');
    assert.deepEqual(graph[SHOT_REFRAME_SAVE_NODE]!.inputs, {
      images: ['rf_scale', 0],
      filename_prefix: SHOT_REFRAME_PREFIX,
    });
    assert.ok(!Object.values(graph).some(node => /Loader|Sampler/.test(node.class_type)));
  });
});
