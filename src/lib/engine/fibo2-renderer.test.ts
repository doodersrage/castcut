import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMFY_IMAGE_MODELS } from '../comfy-models/client';
import { installedComfyModels } from '../model/picker';
import { poseModelFamily } from '../pose/pose-model-profile';
import { taskRequirements } from '../media/task-requirements';
import {
  convertImage21WorkflowToFibo2,
  FIBO2_DEFAULT_FILES,
  FIBO2_MODEL_ID,
  FIBO2_PACK_NODES,
  fibo2InventoryFrom,
  fibo2RendersStill,
  hasQwenImage21TurboLoraRoute,
  isFibo2Model,
  pickFibo2Files,
  toFibo2Prompt,
} from './fibo2-renderer';
import { convertQwenEditWorkflowToImage21 } from './qwen-image-21-renderer';

type Node = { class_type: string; inputs: Record<string, unknown> };

/** A one-person Day still on the Rapid graph: the dressed plate and the player's own pose map. */
function rapidSoloGraph() {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v23.safetensors' } },
    '4': {
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: {
        clip: ['1', 1],
        prompt: 'Keep her face from Image 1. Match her body to the second image (pose map).',
        image1: ['900', 0],
        image2: ['905', 0],
      },
    },
    '5': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['1', 1], prompt: '', image1: ['900', 0] } },
    '8': {
      class_type: 'KSampler',
      inputs: { seed: 77, steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1, model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['906', 0] },
    },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['1', 2] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'Castcut' } },
    '900': { class_type: 'LoadImage', inputs: { image: 'day-dress-plate-1.png' } },
    '905': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide-sit-down-down-c4d4d9-photo-1.png' } },
    '906': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280, batch_size: 1 } },
  };
}

function image21Graph() {
  const { workflow, converted } = convertQwenEditWorkflowToImage21(rapidSoloGraph(), {
    eightStep: true,
    eightStepTurbo: true,
    keepEngine: true,
  });
  assert.equal(converted, true);
  return workflow;
}

const nodesOf = (workflow: Record<string, unknown>) => Object.values(workflow) as Node[];

describe('Fibo 2.0 renderer', () => {
  it('swaps the 2.1 graph onto the ComfyUI-Fibo2 nodes: refs, prompt, canvas, seed', () => {
    const { workflow, converted } = convertImage21WorkflowToFibo2(image21Graph());
    assert.equal(converted, true);
    const nodes = nodesOf(workflow);
    const types = nodes.map(n => n.class_type);
    for (const type of Object.values(FIBO2_PACK_NODES)) assert.ok(types.includes(type), type);
    for (const gone of ['TextEncodeQwenImage21', 'UNETLoader', 'CLIPLoader', 'QwenImage21Cache', 'ManualSigmas', 'EmptyLatentImage']) {
      assert.ok(!types.includes(gone), gone);
    }
    const encode = nodes.find(n => n.class_type === FIBO2_PACK_NODES.encode)!;
    assert.deepEqual(encode.inputs['images.image0'], ['900', 0]);
    assert.deepEqual(encode.inputs['images.image1'], ['905', 0]);
    const prompt = String(encode.inputs.prompt);
    assert.match(prompt, /^<image_2> is only a stick-figure pose map/);
    assert.match(prompt, /Keep her face from <image_1>\./);
    assert.ok(!/<image\d>/.test(prompt));
    // 2.1's canvas for a 3:4 still, already a multiple of 16.
    assert.deepEqual([encode.inputs.width, encode.inputs.height], [1104, 1472]);
    const latent = nodes.find(n => n.class_type === 'EmptyFlux2LatentImage')!;
    assert.deepEqual([latent.inputs.width, latent.inputs.height], [1104, 1472]);
    assert.equal(nodes.find(n => n.class_type === 'RandomNoise')!.inputs.noise_seed, 77);
    assert.equal(nodes.find(n => n.class_type === FIBO2_PACK_NODES.scheduler)!.inputs.steps, 4);
    assert.equal(nodes.find(n => n.class_type === 'KSamplerSelect')!.inputs.sampler_name, 'euler');
    const sampler = (workflow as Record<string, Node>)['8'];
    assert.equal(sampler.class_type, 'SamplerCustomAdvanced');
    const decode = nodes.find(n => n.class_type === 'VAEDecode')!;
    const vae = (workflow as Record<string, Node>)[(decode.inputs.vae as [string, number])[0]];
    assert.equal(vae.inputs.vae_name, FIBO2_DEFAULT_FILES.vae);
  });

  it('on the built-in route: UNETLoader, CLIPLoader type fibo2, TextEncodeFibo2 into a KSampler', () => {
    const { workflow } = convertImage21WorkflowToFibo2(image21Graph(), {
      files: { route: 'native', unet: 'fibo2_edit_turbo_bf16.safetensors', clip: 'qwen3vl_4b_bf16.safetensors', vae: 'flux2-vae.safetensors' },
    });
    const nodes = nodesOf(workflow);
    const encode = nodes.find(n => n.class_type === 'TextEncodeFibo2')!;
    assert.deepEqual(encode.inputs['images.image_1'], ['900', 0]);
    assert.deepEqual(encode.inputs['images.image_2'], ['905', 0]);
    assert.equal(nodes.find(n => n.class_type === 'CLIPLoader')!.inputs.type, 'fibo2');
    const sampler = (workflow as Record<string, Node>)['8'];
    assert.equal(sampler.class_type, 'KSampler');
    assert.deepEqual(sampler.inputs.latent_image, [(sampler.inputs.positive as [string, number])[0], 2]);
    assert.equal(sampler.inputs.steps, 4);
    assert.equal(sampler.inputs.cfg, 1);
    assert.ok(!nodes.some(n => n.class_type.startsWith('Fibo2')));
  });

  it('leaves a graph with no 2.1 encoder alone (a still kept on Rapid)', () => {
    const graph = rapidSoloGraph();
    const result = convertImage21WorkflowToFibo2(graph);
    assert.equal(result.converted, false);
    assert.equal(result.workflow, graph);
  });

  it('leaves nude stills to 2.1 Turbo / Rapid (Fibo covers her up)', () => {
    const graph = (prompt: string) => ({ '1': { class_type: 'TextEncodeQwenImage21', inputs: { prompt } } });
    assert.equal(fibo2RendersStill(graph('She wears a pink dress, seated.')), true);
    assert.equal(fibo2RendersStill(graph('She is fully nude on the bed.')), false);
    assert.equal(hasQwenImage21TurboLoraRoute({ unets: ['qwen_image_2.1_bf16.safetensors'], loras: [] }), false);
    assert.equal(
      hasQwenImage21TurboLoraRoute({
        unets: ['x/qwen_image_2.1_bf16.safetensors'],
        loras: ['qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors'],
      }),
      true
    );
  });

  it('writes references the way Fibo reads them', () => {
    assert.equal(toFibo2Prompt('Keep <image1>; partner from Image 2.'), 'Keep <image_1>; partner from <image_2>.');
    assert.match(toFibo2Prompt('x', { poseMapImage: 3 }), /^<image_3> is only a stick-figure pose map.* x$/);
  });
});

describe('Fibo 2.0 files and install check', () => {
  const pack = {
    nodeTypes: Object.values(FIBO2_PACK_NODES),
    fibo2Unets: ['fibo2_edit_turbo_bf16.safetensors', 'fibo2_edit_turbo_nodepack_bf16.safetensors'],
    clips: ['qwen3vl_4b_int8_convrot.safetensors'],
    vaes: ['flux2-vae.safetensors'],
  };

  it('hands the pack the file its metadata marks as converted', () => {
    assert.deepEqual(
      pickFibo2Files({ ...pack, fibo2PackUnets: ['fibo2_edit_turbo_nodepack_bf16.safetensors'] }),
      { route: 'pack', unet: 'fibo2_edit_turbo_nodepack_bf16.safetensors', clip: 'qwen3vl_4b_int8_convrot.safetensors', vae: 'flux2-vae.safetensors' }
    );
    // Metadata read, none converted (only Comfy-Org's file): the pack can't run it.
    assert.equal(pickFibo2Files({ ...pack, fibo2Unets: ['fibo2_edit_turbo_bf16.safetensors'], fibo2PackUnets: [] }), null);
    // Not read: by name, the "nodepack" copy first.
    assert.equal(pickFibo2Files(pack)?.unet, 'fibo2_edit_turbo_nodepack_bf16.safetensors');
  });

  it('needs the encoder and the VAE; falls back to the built-in route', () => {
    assert.equal(pickFibo2Files({ ...pack, vaes: [] }), null);
    assert.equal(pickFibo2Files({ ...pack, clips: ['qwen3vl_8b_int8_convrot.safetensors'] }), null);
    const native = pickFibo2Files({
      nodeTypes: ['TextEncodeFibo2', 'CLIPLoader'],
      unets: ['fibo2_edit_turbo_bf16.safetensors'],
      clipLoaderTypes: ['qwen_image', 'fibo2'],
      clips: ['qwen3vl_4b_bf16.safetensors'],
      vaes: ['flux2-vae.safetensors'],
    });
    assert.equal(native?.route, 'native');
    assert.equal(native?.unet, 'fibo2_edit_turbo_bf16.safetensors');
    // No built-in node and no pack: nothing.
    assert.equal(
      pickFibo2Files({ nodeTypes: ['CLIPLoader'], unets: ['fibo2_edit_turbo_bf16.safetensors'], clipLoaderTypes: ['qwen_image'], clips: pack.clips, vaes: pack.vaes }),
      null
    );
  });

  it('shows installed in the picker only with the pack loader’s file, encoder and VAE', () => {
    const base = { checkpoints: [], unets: ['fibo2_edit_turbo_bf16.safetensors'], clips: pack.clips, vaes: pack.vaes, clipLoaderTypes: [] };
    assert.ok(!installedComfyModels(COMFY_IMAGE_MODELS, base as never)?.has(FIBO2_MODEL_ID));
    const withPack = { ...base, fibo2Unets: pack.fibo2Unets, fibo2PackUnets: ['fibo2_edit_turbo_nodepack_bf16.safetensors'] };
    assert.equal(
      installedComfyModels(COMFY_IMAGE_MODELS, withPack as never)?.get(FIBO2_MODEL_ID),
      'fibo2_edit_turbo_nodepack_bf16.safetensors'
    );
    assert.equal(fibo2InventoryFrom(null), null);
  });

  it('rides Qwen-Image 2.1’s pose family and lists its node pack', () => {
    assert.ok(isFibo2Model('fibo-2-edit-turbo'));
    assert.equal(poseModelFamily(FIBO2_MODEL_ID), 'qwen-image-2.1');
    const needs = taskRequirements({ model: FIBO2_MODEL_ID });
    assert.ok(needs.assetIds.includes('fibo2-edit-turbo-nodepack'));
    assert.ok(needs.nodePacks.some(p => p.url === 'https://github.com/drphero/ComfyUI-Fibo2'));
  });
});

describe('Fibo 2.0 nude stills are recorded on the engine that renders them', () => {
  it('Day routes them to 2.1 Turbo (else Rapid NSFW), hand-offs on or off, with a card note', async () => {
    const { resolveDayStillModel, resolveAdultNudePlateQueueModel, clothedOnlyHandOffNote } =
      await import('../queue/tool-model');
    const all = () => true;
    const turbo = 'qwen-image-2.1-edit-turbo-8';
    for (const handOffs of [true, false]) {
      assert.equal(
        resolveDayStillModel(FIBO2_MODEL_ID, { adultNude: true, handOffs, installed: all }),
        turbo
      );
      assert.equal(
        resolveDayStillModel(FIBO2_MODEL_ID, { adultNude: false, handOffs, installed: all }),
        FIBO2_MODEL_ID
      );
    }
    // Turbo's own hand-off still applies: a sex-pose duo goes on to Rapid NSFW.
    assert.equal(
      resolveDayStillModel(FIBO2_MODEL_ID, {
        adultNude: true,
        penetrationDuo: true,
        handOffs: true,
        installed: all,
      }),
      'qwen-rapid-aio-edit-nsfw'
    );
    const rapidOnly = (id: string) => id === 'qwen-rapid-aio-edit-nsfw';
    assert.equal(
      resolveDayStillModel(FIBO2_MODEL_ID, { adultNude: true, installed: rapidOnly }),
      'qwen-rapid-aio-edit-nsfw'
    );
    // Story's nude plate (no inventory): Rapid NSFW, which Fibo's graph is built on.
    assert.equal(
      resolveAdultNudePlateQueueModel(FIBO2_MODEL_ID, { adultNude: true }),
      'qwen-rapid-aio-edit-nsfw'
    );
    assert.equal(resolveAdultNudePlateQueueModel(FIBO2_MODEL_ID, { adultNude: false }), FIBO2_MODEL_ID);
    assert.equal(
      clothedOnlyHandOffNote(FIBO2_MODEL_ID, turbo),
      "Rendered on Qwen-Image 2.1 Turbo — Bria Fibo 2.0 Edit Turbo doesn't do nude stills"
    );
    assert.equal(clothedOnlyHandOffNote(FIBO2_MODEL_ID, FIBO2_MODEL_ID), undefined);
    assert.equal(clothedOnlyHandOffNote(turbo, 'qwen-rapid-aio-edit-nsfw'), undefined);
  });
});

describe('Fibo 2.0 on the queue', () => {
  it('the runtime rides 2.1 with the Fibo flag', async () => {
    const { resolveRuntimeForQueue } = await import('../comfyui/runtime-for-model');
    const runtime = resolveRuntimeForQueue(FIBO2_MODEL_ID, 'day', { inventory: null });
    assert.equal(runtime.qwenRenderer, 'qwen-image-2.1');
    assert.equal(runtime.fibo2, true);
    assert.equal(runtime.qwenImage21EightStep, undefined);
  });

  it('a clothed still renders on Fibo, a nude one on 2.1 Turbo', async () => {
    const { injectPromptsWithFallbacks, resolvePlaceholderTokens } = await import(
      '../comfyui/config'
    );
    const run = (prompt: string) => {
      const graph = rapidSoloGraph();
      (graph['4'].inputs as Record<string, unknown>).prompt = prompt;
      return nodesOf(
        injectPromptsWithFallbacks(graph, { positive: prompt }, resolvePlaceholderTokens(), {
          qwenRenderer: 'qwen-image-2.1',
          fibo2: true,
          qwenImage21KeepEngine: true,
          availableUnets: [
            'qwen_image_2.1_turbo_int8_convrot.safetensors',
            'fibo2_edit_turbo_nodepack_bf16.safetensors',
          ],
          fibo2Inventory: {
            nodeTypes: Object.values(FIBO2_PACK_NODES),
            fibo2Unets: ['fibo2_edit_turbo_nodepack_bf16.safetensors'],
            fibo2PackUnets: ['fibo2_edit_turbo_nodepack_bf16.safetensors'],
            clips: ['qwen3vl_4b_int8_convrot.safetensors'],
            vaes: ['flux2-vae.safetensors'],
          },
        }).workflow
      ).map(n => n.class_type);
    };
    const dressed = run('She wears the pink dress from Image 1, seated on the lawn.');
    assert.ok(dressed.includes(FIBO2_PACK_NODES.encode));
    const nude = run('She is fully nude, seated on the bed. Keep her face from Image 1.');
    assert.ok(!nude.some(type => type.startsWith('Fibo2')));
    assert.ok(nude.includes('TextEncodeQwenImage21'));
  });
});
