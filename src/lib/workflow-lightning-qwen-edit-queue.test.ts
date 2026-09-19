import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  disconnectQwenEditReferenceImagesForTxt2Img,
  ensureQwenEditReferenceImagesForImg2Img,
  ensureQwenReferenceLatentWiringInWorkflow,
  isPoseGuideReferenceFilename,
  nextLightningWorkflowNodeId,
  prepareQwenEditReferenceImagesForQueue,
  pruneUnresolvedQwenEditFigureLoaders,
  scaleQwenEditReferenceImagesToLatentSize,
} from './workflow-lightning-qwen-edit-queue';

type NodeShape = {
  class_type?: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
};

/** Read a node out of a plain workflow record with a known, non-any shape. */
function nodeAt(workflow: Record<string, unknown>, id: string): NodeShape {
  return workflow[id] as NodeShape;
}

/** Narrow a `[nodeId, outputIndex]` link value read out of `inputs`. */
function ref(value: unknown): [string, number] {
  return value as [string, number];
}

describe('disconnectQwenEditReferenceImagesForTxt2Img', () => {
  it('passes through unchanged when hasInputImage is true', () => {
    const workflow = { '1': { class_type: 'LoadImage', inputs: { image: 'a.png' } } };
    const result = disconnectQwenEditReferenceImagesForTxt2Img(workflow, { hasInputImage: true });
    assert.equal(result.workflow, workflow);
    assert.deepEqual(result.disconnectedNodeIds, []);
  });

  it('no-ops on an empty workflow', () => {
    const result = disconnectQwenEditReferenceImagesForTxt2Img({});
    assert.deepEqual(result.workflow, {});
    assert.deepEqual(result.disconnectedNodeIds, []);
  });

  it('leaves workflows without Qwen edit encode nodes untouched', () => {
    const workflow = { '1': { class_type: 'KSampler', inputs: { steps: 8 } } };
    const result = disconnectQwenEditReferenceImagesForTxt2Img(workflow);
    assert.deepEqual(result.workflow, workflow);
    assert.notEqual(result.workflow, workflow);
    assert.deepEqual(result.disconnectedNodeIds, []);
  });

  it('disconnects image + vae inputs and drops an orphaned LoadImage', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
      '2': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], vae: ['3', 0], image1: ['1', 0] },
      },
    };
    const result = disconnectQwenEditReferenceImagesForTxt2Img(workflow);
    assert.deepEqual(Object.keys(result.workflow).sort(), ['2']);
    assert.deepEqual(nodeAt(result.workflow, '2').inputs, { clip: ['0', 1] });
    assert.deepEqual(result.disconnectedNodeIds.sort(), ['1', '2']);
  });

  it('keeps a LoadImage that is still referenced elsewhere', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
      '2': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], image1: ['1', 0] },
      },
      '3': { class_type: 'ControlNetApply', inputs: { image: ['1', 0] } },
    };
    const result = disconnectQwenEditReferenceImagesForTxt2Img(workflow);
    assert.ok(result.workflow['1']);
    assert.deepEqual(nodeAt(result.workflow, '3').inputs.image, ['1', 0]);
    assert.deepEqual(result.disconnectedNodeIds, ['2']);
  });

  it('drops a lingering vae input even when no image keys are present', () => {
    const workflow = {
      '1': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], vae: ['2', 0] },
      },
    };
    const result = disconnectQwenEditReferenceImagesForTxt2Img(workflow);
    assert.deepEqual(nodeAt(result.workflow, '1').inputs, { clip: ['0', 1] });
    assert.deepEqual(result.disconnectedNodeIds, ['1']);
  });
});

describe('ensureQwenEditReferenceImagesForImg2Img', () => {
  it('passes through unchanged when hasInputImage is falsy', () => {
    const workflow = { '1': { class_type: 'LoadImage', inputs: {} } };
    const result = ensureQwenEditReferenceImagesForImg2Img(workflow);
    assert.equal(result.workflow, workflow);
    assert.deepEqual(result.wiredNodeIds, []);
  });

  it('is a no-op when the filenames normalize to empty', () => {
    const workflow = { '1': { class_type: 'LoadImage', inputs: {} } };
    const result = ensureQwenEditReferenceImagesForImg2Img(workflow, {
      hasInputImage: true,
      inputImageFilename: '   ',
    });
    assert.equal(result.workflow, workflow);
    assert.deepEqual(result.wiredNodeIds, []);
  });

  it('creates a new Figure LoadImage and wires TextEncodeQwenImageEditPlus.image1', () => {
    const workflow = {
      '5': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['1', 1] } },
    };
    const result = ensureQwenEditReferenceImagesForImg2Img(workflow, {
      hasInputImage: true,
      inputImageFilename: 'ref.png',
    });
    const loaderId = ref(nodeAt(result.workflow, '5').inputs.image1)[0];
    const loader = nodeAt(result.workflow, loaderId);
    assert.equal(loader.class_type, 'LoadImage');
    assert.equal(loader.inputs.image, 'ref.png');
    assert.equal(loader._meta?.title, 'Figure 1');
    assert.deepEqual(result.wiredNodeIds, ['5']);
  });

  it('reuses an existing titled Figure loader by exact match', () => {
    const workflow = {
      '1': {
        class_type: 'LoadImage',
        inputs: { image: 'old.png' },
        _meta: { title: 'Figure 2' },
      },
      '2': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['0', 1] } },
    };
    const result = ensureQwenEditReferenceImagesForImg2Img(workflow, {
      hasInputImage: true,
      inputImageFilenames: ['', 'new.png'],
    });
    assert.equal(nodeAt(result.workflow, '1').inputs.image, 'new.png');
    assert.deepEqual(nodeAt(result.workflow, '2').inputs.image2, ['1', 0]);
    assert.equal(Object.keys(result.workflow).length, 2);
  });

  it('does not rewire an already-linked slot when forceRewire is false', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'old.png' } },
      '2': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], image1: ['1', 0] },
      },
    };
    const result = ensureQwenEditReferenceImagesForImg2Img(workflow, {
      hasInputImage: true,
      inputImageFilename: 'new.png',
      forceRewire: false,
    });
    assert.deepEqual(nodeAt(result.workflow, '2').inputs.image1, ['1', 0]);
    assert.deepEqual(result.wiredNodeIds, []);
    // The loader itself is still reused/updated even though the encode slot is untouched.
    assert.equal(nodeAt(result.workflow, '1').inputs.image, 'new.png');
  });

  it('only creates loaders without wiring encode nodes when wireEncodeSlots is false', () => {
    const workflow = {
      '2': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['0', 1] } },
    };
    const result = ensureQwenEditReferenceImagesForImg2Img(workflow, {
      hasInputImage: true,
      inputImageFilename: 'ref.png',
      wireEncodeSlots: false,
    });
    assert.deepEqual(nodeAt(result.workflow, '2').inputs, { clip: ['0', 1] });
    assert.equal(result.wiredNodeIds.length, 1);
    const loaderId = result.wiredNodeIds[0]!;
    assert.equal(nodeAt(result.workflow, loaderId).class_type, 'LoadImage');
  });

  it('wires TextEncodeBooguEdit dotted keys and drops legacy image_N keys', () => {
    const workflow = {
      '3': {
        class_type: 'TextEncodeBooguEdit',
        inputs: { clip: ['0', 1], image_1: ['9', 0] },
      },
    };
    const result = ensureQwenEditReferenceImagesForImg2Img(workflow, {
      hasInputImage: true,
      inputImageFilenames: ['a.png', 'b.png'],
    });
    const inputs = nodeAt(result.workflow, '3').inputs;
    assert.equal('image_1' in inputs, false);
    assert.ok(Array.isArray(inputs['images.image_1']));
    assert.ok(Array.isArray(inputs['images.image_2']));
    assert.equal('images.image_3' in inputs, false);
    assert.deepEqual(result.wiredNodeIds, ['3']);
  });
});

describe('nextLightningWorkflowNodeId', () => {
  it('returns "1" for an empty workflow', () => {
    assert.equal(nextLightningWorkflowNodeId({}), '1');
  });

  it('returns one past the highest numeric id', () => {
    assert.equal(nextLightningWorkflowNodeId({ '2': {}, '5': {}, '9': {} }), '10');
  });

  it('ignores non-numeric ids', () => {
    assert.equal(nextLightningWorkflowNodeId({ abc: {}, '3': {} }), '4');
  });
});

describe('scaleQwenEditReferenceImagesToLatentSize', () => {
  it('is a no-op when width/height are missing or invalid', () => {
    const workflow = { '1': { class_type: 'LoadImage', inputs: { image: 'a.png' } } };
    const badParams: Array<{ width: number; height: number } | undefined> = [
      undefined,
      { width: 0, height: 100 },
      { width: 100, height: -5 },
      { width: NaN, height: 100 },
    ];
    for (const params of badParams) {
      const result = scaleQwenEditReferenceImagesToLatentSize(workflow, params);
      assert.equal(result.workflow, workflow);
      assert.equal(result.scaledSlotCount, 0);
    }
  });

  it('inserts an ImageScale node and rewires the encode image slot', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
      '2': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], image1: ['1', 0] },
      },
    };
    const result = scaleQwenEditReferenceImagesToLatentSize(workflow, {
      width: 1328,
      height: 1328,
    });
    assert.equal(result.scaledSlotCount, 1);
    const scaleRef = ref(nodeAt(result.workflow, '2').inputs.image1);
    const scaleNode = nodeAt(result.workflow, scaleRef[0]);
    assert.equal(scaleNode.class_type, 'ImageScale');
    assert.deepEqual(scaleNode.inputs, {
      image: ['1', 0],
      upscale_method: 'lanczos',
      width: 1328,
      height: 1328,
      crop: 'center',
    });
  });

  it('reuses a single scale node when two encode slots share a loader', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
      '2': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], image1: ['1', 0], image2: ['1', 0] },
      },
    };
    const result = scaleQwenEditReferenceImagesToLatentSize(workflow, {
      width: 512,
      height: 512,
    });
    assert.equal(result.scaledSlotCount, 2);
    const inputs = nodeAt(result.workflow, '2').inputs;
    assert.deepEqual(inputs.image1, inputs.image2);
    const scaleNodeCount = Object.values(result.workflow).filter(
      candidate => (candidate as NodeShape)?.class_type === 'ImageScale'
    ).length;
    assert.equal(scaleNodeCount, 1);
  });

  it('enforces center-crop on an existing scale node and is idempotent afterwards', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
      '2': {
        class_type: 'ImageScale',
        inputs: { image: ['1', 0], width: 800, height: 600, upscale_method: 'lanczos' },
      },
      '3': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], image1: ['2', 0] },
      },
    };
    const first = scaleQwenEditReferenceImagesToLatentSize(workflow, { width: 800, height: 600 });
    assert.equal(first.scaledSlotCount, 1);
    assert.equal(nodeAt(first.workflow, '2').inputs.crop, 'center');
    assert.deepEqual(nodeAt(first.workflow, '3').inputs.image1, ['2', 0]);

    const second = scaleQwenEditReferenceImagesToLatentSize(first.workflow, {
      width: 800,
      height: 600,
    });
    assert.equal(second.scaledSlotCount, 0);
  });

  it('patches an existing ImageScale in place when dimensions differ', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
      '2': {
        class_type: 'ImageScale',
        inputs: { image: ['1', 0], width: 2048, height: 2048, upscale_method: 'lanczos' },
      },
      '3': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], image1: ['2', 0] },
      },
    };
    const result = scaleQwenEditReferenceImagesToLatentSize(workflow, {
      width: 1328,
      height: 1328,
    });
    assert.equal(result.scaledSlotCount, 1);
    assert.deepEqual(nodeAt(result.workflow, '3').inputs.image1, ['2', 0]);
    const patched = nodeAt(result.workflow, '2');
    assert.equal(patched.inputs.width, 1328);
    assert.equal(patched.inputs.height, 1328);
    assert.equal(patched.inputs.crop, 'center');
  });

  it('replaces an ImageScaleBy factor scale with an absolute ImageScale', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
      '2': { class_type: 'ImageScaleBy', inputs: { image: ['1', 0], scale_by: 1.5 } },
      '3': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], image1: ['2', 0] },
      },
    };
    const result = scaleQwenEditReferenceImagesToLatentSize(workflow, {
      width: 1328,
      height: 1328,
    });
    assert.equal(result.scaledSlotCount, 1);
    const slotRef = ref(nodeAt(result.workflow, '3').inputs.image1);
    assert.notDeepEqual(slotRef, ['2', 0]);
    const scaleNode = nodeAt(result.workflow, slotRef[0]);
    assert.equal(scaleNode.class_type, 'ImageScale');
    assert.deepEqual(scaleNode.inputs.image, ['1', 0]);
  });

  it('skips slots with no linked node or unmatched node types', () => {
    const workflow = {
      '1': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], image1: 'literal.png' },
      },
      '2': { class_type: 'KSampler', inputs: { image1: ['9', 0] } },
    };
    const result = scaleQwenEditReferenceImagesToLatentSize(workflow, {
      width: 512,
      height: 512,
    });
    assert.equal(result.scaledSlotCount, 0);
    assert.deepEqual(result.workflow, workflow);
  });
});

describe('ensureQwenReferenceLatentWiringInWorkflow', () => {
  it('is a no-op when there are no reference filenames', () => {
    const workflow = {
      '1': { class_type: 'KSampler', inputs: { positive: ['2', 0], latent_image: ['3', 0] } },
    };
    const result = ensureQwenReferenceLatentWiringInWorkflow(workflow, {
      width: 1024,
      height: 1024,
    });
    assert.equal(result.workflow, workflow);
    assert.equal(result.wired, false);
    assert.deepEqual(result.insertedNodeIds, []);
  });

  it('is a no-op when width/height are invalid', () => {
    const workflow = { '1': {} };
    const result = ensureQwenReferenceLatentWiringInWorkflow(workflow, {
      inputImageFilename: 'ref.png',
      width: 0,
      height: 512,
    });
    assert.equal(result.workflow, workflow);
    assert.equal(result.wired, false);
  });

  it('is a no-op when no primary sampler is found', () => {
    const workflow = { '1': { class_type: 'SaveImage', inputs: { images: ['9', 0] } } };
    const result = ensureQwenReferenceLatentWiringInWorkflow(workflow, {
      inputImageFilename: 'ref.png',
      width: 1024,
      height: 1024,
    });
    assert.equal(result.workflow, workflow);
    assert.equal(result.wired, false);
  });

  it('is a no-op when no VAE source can be found', () => {
    const workflow = {
      '1': { class_type: 'KSampler', inputs: { positive: ['2', 0], latent_image: ['3', 0] } },
    };
    const result = ensureQwenReferenceLatentWiringInWorkflow(workflow, {
      inputImageFilename: 'ref.png',
      width: 1024,
      height: 1024,
    });
    assert.equal(result.workflow, workflow);
    assert.equal(result.wired, false);
  });

  it('returns the partially-wired clone when positive is not a node ref', () => {
    const workflow = {
      '1': { class_type: 'VAELoader', inputs: { vae_name: 'vae.safetensors' } },
      '2': { class_type: 'KSampler', inputs: { positive: 'literal', latent_image: ['3', 0] } },
      '3': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
    };
    const result = ensureQwenReferenceLatentWiringInWorkflow(workflow, {
      inputImageFilename: 'ref.png',
      width: 1024,
      height: 1024,
    });
    assert.equal(result.wired, false);
    assert.notEqual(result.workflow, workflow);
    // The empty latent still gets resized in place even though wiring aborts.
    assert.equal(nodeAt(result.workflow, '3').class_type, 'EmptySD3LatentImage');
    assert.equal(nodeAt(result.workflow, '3').inputs.width, 1024);
  });

  it('builds the full LoadImage -> ImageScale -> VAEEncode -> ReferenceLatent chain', () => {
    const workflow = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'qwen.safetensors' } },
      '2': { class_type: 'VAELoader', inputs: { vae_name: 'vae.safetensors' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'a photo', clip: ['1', 1] } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
      '6': {
        class_type: 'KSampler',
        inputs: {
          model: ['1', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['5', 0],
          steps: 8,
          cfg: 1,
        },
      },
      '9': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['1', 1], vae: ['2', 0] } },
    };
    const result = ensureQwenReferenceLatentWiringInWorkflow(workflow, {
      inputImageFilename: 'ref.png',
      width: 1024,
      height: 1024,
    });
    assert.equal(result.wired, true);
    assert.deepEqual(result.insertedNodeIds, ['10', '11', '12', '13']);
    assert.equal(nodeAt(result.workflow, '9').inputs.vae, undefined);
    assert.deepEqual(nodeAt(result.workflow, '9').inputs.image1, ['10', 0]);

    const loader = nodeAt(result.workflow, '10');
    assert.equal(loader.class_type, 'LoadImage');
    assert.equal(loader.inputs.image, 'ref.png');

    const scale = nodeAt(result.workflow, '11');
    assert.equal(scale.class_type, 'ImageScale');
    assert.deepEqual(scale.inputs.image, ['10', 0]);

    const encode = nodeAt(result.workflow, '12');
    assert.equal(encode.class_type, 'VAEEncode');
    assert.deepEqual(encode.inputs, { pixels: ['11', 0], vae: ['2', 0] });

    const referenceLatent = nodeAt(result.workflow, '13');
    assert.equal(referenceLatent.class_type, 'ReferenceLatent');
    assert.deepEqual(referenceLatent.inputs, { conditioning: ['3', 0], latent: ['12', 0] });

    assert.deepEqual(nodeAt(result.workflow, '6').inputs.positive, ['13', 0]);
    assert.equal(nodeAt(result.workflow, '5').class_type, 'EmptySD3LatentImage');
  });

  it('keeps pose-guide Image 3 on VL encode but skips ReferenceLatent', () => {
    assert.equal(isPoseGuideReferenceFilename('day-pose-guide-stand-1.png'), true);
    assert.equal(isPoseGuideReferenceFilename('story-pose-guide-wall-2.png'), true);
    assert.equal(isPoseGuideReferenceFilename('day-outfit-vl-123.png'), true);
    assert.equal(isPoseGuideReferenceFilename('day-vacation-face-1.png'), true);
    assert.equal(isPoseGuideReferenceFilename('day-vacation-id-vl-day-shared.png'), true);
    assert.equal(isPoseGuideReferenceFilename('day-vacation-keep-day-shared.png'), false);
    assert.equal(isPoseGuideReferenceFilename('plate.png'), false);

    const workflow = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'qwen.safetensors' } },
      '2': { class_type: 'VAELoader', inputs: { vae_name: 'vae.safetensors' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'a photo', clip: ['1', 1] } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
      '6': {
        class_type: 'KSampler',
        inputs: {
          model: ['1', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['5', 0],
          seed: 1,
          steps: 4,
          cfg: 1,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1,
        },
      },
      '9': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { prompt: 'edit', clip: ['1', 1], vae: ['2', 0] },
      },
    };
    const result = ensureQwenReferenceLatentWiringInWorkflow(workflow, {
      inputImageFilename: 'plate.png',
      inputImageFilenames: ['plate.png', '', 'day-pose-guide-rail-1.png'],
      width: 1024,
      height: 1024,
    });
    assert.equal(result.wired, true);
    const nodes = Object.values(result.workflow) as NodeShape[];
    const refLatents = nodes.filter(node => node.class_type === 'ReferenceLatent');
    // Plate gets ReferenceLatent; pose guide does not.
    assert.equal(refLatents.length, 1);
    const loaders = nodes.filter(node => node.class_type === 'LoadImage');
    assert.ok(loaders.some(node => node.inputs.image === 'day-pose-guide-rail-1.png'));
    const encode = nodeAt(result.workflow, '9');
    assert.ok(encode.inputs.image3);
  });

  it('skips ReferenceLatent for day-outfit-vl Keep on Image 2 (face-break outfit)', () => {
    const workflow = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'qwen.safetensors' } },
      '2': { class_type: 'VAELoader', inputs: { vae_name: 'vae.safetensors' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'a photo', clip: ['1', 1] } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
      '6': {
        class_type: 'KSampler',
        inputs: {
          model: ['1', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['5', 0],
          seed: 1,
          steps: 4,
          cfg: 1,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1,
        },
      },
      '9': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { prompt: 'edit', clip: ['1', 1], vae: ['2', 0] },
      },
    };
    const result = ensureQwenReferenceLatentWiringInWorkflow(workflow, {
      inputImageFilenames: [
        'day-vacation-face-1.png',
        'day-outfit-vl-1.png',
        'day-pose-guide-walk-1.png',
      ],
      width: 1024,
      height: 1024,
    });
    assert.equal(result.wired, true);
    const nodes = Object.values(result.workflow) as NodeShape[];
    const refLatents = nodes.filter(node => node.class_type === 'ReferenceLatent');
    // Face crop + outfit VL + pose guide are all VL-only (pose unlock on Lightning).
    assert.equal(refLatents.length, 0);
    const loaders = nodes.filter(node => node.class_type === 'LoadImage');
    assert.ok(loaders.some(node => node.inputs.image === 'day-vacation-face-1.png'));
    assert.ok(loaders.some(node => node.inputs.image === 'day-outfit-vl-1.png'));
    assert.ok(loaders.some(node => node.inputs.image === 'day-pose-guide-walk-1.png'));
  });

  it('reuses an existing titled Figure LoadImage and chains multiple references', () => {
    const workflow = {
      '1': { class_type: 'VAELoader', inputs: { vae_name: 'vae.safetensors' } },
      '2': {
        class_type: 'LoadImage',
        inputs: { image: 'old.png' },
        _meta: { title: 'Figure 1' },
      },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'prompt' } },
      '4': {
        class_type: 'KSampler',
        inputs: { positive: ['3', 0], latent_image: ['5', 0] },
      },
      '5': { class_type: 'EmptySD3LatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
    };
    const result = ensureQwenReferenceLatentWiringInWorkflow(workflow, {
      inputImageFilenames: ['a.png', 'b.png'],
      width: 1024,
      height: 1024,
    });
    assert.equal(result.wired, true);
    // Existing "Figure 1" loader is reused (image updated), not recreated.
    assert.equal(nodeAt(result.workflow, '2').inputs.image, 'a.png');
    assert.equal(result.insertedNodeIds.includes('2'), false);

    // A single new loader was created, for figure 2.
    const newLoaderIds = result.insertedNodeIds.filter(
      id => nodeAt(result.workflow, id).class_type === 'LoadImage'
    );
    assert.equal(newLoaderIds.length, 1);
    assert.equal(nodeAt(result.workflow, newLoaderIds[0]!).inputs.image, 'b.png');

    // Two ReferenceLatent nodes chained: sampler.positive -> refB -> refA -> original text cond.
    const refBId = ref(nodeAt(result.workflow, '4').inputs.positive)[0];
    const refB = nodeAt(result.workflow, refBId);
    assert.equal(refB.class_type, 'ReferenceLatent');
    const refAId = ref(refB.inputs.conditioning)[0];
    const refA = nodeAt(result.workflow, refAId);
    assert.equal(refA.class_type, 'ReferenceLatent');
    assert.deepEqual(refA.inputs.conditioning, ['3', 0]);
  });
});

describe('pruneUnresolvedQwenEditFigureLoaders', () => {
  it('removes an unresolved unreferenced LoadImage', () => {
    const workflow = { '1': { class_type: 'LoadImage', inputs: { image: '{{INPUT_IMAGE_2}}' } } };
    const result = pruneUnresolvedQwenEditFigureLoaders(workflow);
    assert.deepEqual(result.workflow, {});
    assert.deepEqual(result.removedNodeIds, ['1']);
  });

  it('keeps an unresolved LoadImage that is still referenced', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: '{{INPUT_IMAGE_1}}' } },
      '2': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { image1: ['1', 0] } },
    };
    const result = pruneUnresolvedQwenEditFigureLoaders(workflow);
    assert.ok(result.workflow['1']);
    assert.deepEqual(result.removedNodeIds, []);
  });

  it('leaves resolved LoadImage filenames alone', () => {
    const workflow = { '1': { class_type: 'LoadImage', inputs: { image: 'real.png' } } };
    const result = pruneUnresolvedQwenEditFigureLoaders(workflow);
    assert.ok(result.workflow['1']);
    assert.deepEqual(result.removedNodeIds, []);
  });

  it('also prunes unresolved LoadImageOutput nodes, case-insensitively', () => {
    const workflow = {
      '1': { class_type: 'LoadImageOutput', inputs: { image: '{{input_image_3}}' } },
    };
    const result = pruneUnresolvedQwenEditFigureLoaders(workflow);
    assert.deepEqual(result.removedNodeIds, ['1']);
  });

  it('ignores non-string image inputs and empty workflows', () => {
    const withRef = { '1': { class_type: 'LoadImage', inputs: { image: ['0', 0] } } };
    const result = pruneUnresolvedQwenEditFigureLoaders(withRef);
    assert.deepEqual(result.removedNodeIds, []);

    const empty = pruneUnresolvedQwenEditFigureLoaders({});
    assert.deepEqual(empty.removedNodeIds, []);
    assert.deepEqual(empty.workflow, {});
  });
});

describe('prepareQwenEditReferenceImagesForQueue', () => {
  it('disconnects edit refs for a txt2img request with no input image', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
      '2': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], image1: ['1', 0], vae: ['3', 0] },
      },
    };
    const result = prepareQwenEditReferenceImagesForQueue(
      workflow,
      'qwen-image-2512-lightning-8',
      {}
    );
    assert.deepEqual(nodeAt(result, '2').inputs, { clip: ['0', 1] });
    assert.equal(result['1'], undefined);
  });

  it('leaves the workflow untouched when no model id is provided but a reference image is queued', () => {
    const workflow = { '1': { class_type: 'LoadImage', inputs: { image: 'x.png' } } };
    const result = prepareQwenEditReferenceImagesForQueue(workflow, undefined, {
      inputImageFilename: 'ref.png',
    });
    assert.equal(result, workflow);
  });

  it('leaves the workflow untouched for a non-edit-capable model', () => {
    const workflow = { '1': { class_type: 'LoadImage', inputs: { image: 'x.png' } } };
    const result = prepareQwenEditReferenceImagesForQueue(workflow, 'sdxl-base', {
      inputImageFilename: 'ref.png',
    });
    assert.equal(result, workflow);
  });

  it('wires reference latents end-to-end for a generic edit-capable model', () => {
    const workflow = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'qwen.safetensors' } },
      '2': { class_type: 'VAELoader', inputs: { vae_name: 'vae.safetensors' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'a photo', clip: ['1', 1] } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
      '6': {
        class_type: 'KSampler',
        inputs: {
          model: ['1', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['5', 0],
          steps: 8,
          cfg: 1,
        },
      },
      '9': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['1', 1] } },
    };
    const result = prepareQwenEditReferenceImagesForQueue(workflow, 'custom-qwen-edit', {
      inputImageFilename: 'ref.png',
      width: 1024,
      height: 1024,
    });
    const refId = ref(nodeAt(result, '6').inputs.positive)[0];
    assert.equal(nodeAt(result, refId).class_type, 'ReferenceLatent');

    const figure1 = Object.values(result).find(candidate => {
      const node = candidate as NodeShape;
      return node?.class_type === 'LoadImage' && node?._meta?.title === 'Figure 1';
    }) as NodeShape | undefined;
    assert.ok(figure1);
    assert.equal(figure1!.inputs.image, 'ref.png');
  });

  it('wires TextEncodeBooguEdit image slots without adding ReferenceLatent nodes for boogu edit', () => {
    const workflow = {
      '1': { class_type: 'TextEncodeBooguEdit', inputs: { clip: ['0', 1] } },
    };
    const result = prepareQwenEditReferenceImagesForQueue(workflow, 'boogu-image-edit', {
      inputImageFilename: 'ref.png',
      width: 1024,
      height: 1024,
    });
    const node1 = nodeAt(result, '1');
    assert.ok(Array.isArray(node1.inputs['images.image_1']));
    const hasReferenceLatent = Object.values(result).some(
      candidate => (candidate as NodeShape)?.class_type === 'ReferenceLatent'
    );
    assert.equal(hasReferenceLatent, false);
  });

  it('passes forceRewire through to the encode-slot wiring step', () => {
    const workflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'old.png' } },
      '2': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['0', 1], image1: ['1', 0] },
      },
    };
    const result = prepareQwenEditReferenceImagesForQueue(
      workflow,
      'custom-qwen-edit',
      { inputImageFilename: 'new.png', width: 0, height: 0 },
      { forceRewire: false }
    );
    // image1 is already wired to a node ref -> left alone since forceRewire is false.
    assert.deepEqual(nodeAt(result, '2').inputs.image1, ['1', 0]);
  });
});
