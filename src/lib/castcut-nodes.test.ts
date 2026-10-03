import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyCastcutBestOfTwo,
  buildCastcutCutoutGraph,
  CASTCUT_BEST_OF_TWO_IDS,
  CASTCUT_BEST_OF_TWO_NODES,
  CASTCUT_CUTOUT_NODES,
  castcutBestOfTwoAvailable,
  castcutCutoutAvailable,
  castcutGuideJson,
  castcutViewUrl,
  parseCastcutBestOfTwoReport,
  parseCastcutMaskRepairReport,
} from './castcut-nodes';
import {
  injectPromptsWithFallbacks,
  resolvePlaceholderTokens,
  resolveQueueParams,
} from './comfyui-config';
import { lookupKnownComfyNodePack } from './comfyui-custom-node-registry';
import { buildWorkflowScaffoldForModel } from './workflow-scaffold';

type Node = { class_type: string; inputs: Record<string, unknown> };

const GUIDE = castcutGuideJson(
  [
    Array.from({ length: 18 }, (_, i) =>
      i === 16 ? null : { x: 0.3 + (i % 4) * 0.1, y: 0.1 + i * 0.04 }
    ),
  ],
  0.75
);

/** Base ComfyUI install plus DWPose — what object_info lists without the Castcut pack. */
const WITHOUT_PACK = new Set([
  'KSampler',
  'SaveImage',
  'LoadImage',
  'VAEDecode',
  'DWPreprocessor',
  'RepeatLatentBatch',
]);
const WITH_PACK = new Set([...WITHOUT_PACK, ...CASTCUT_BEST_OF_TWO_NODES]);

/** The still graph the queue builds for a Day still on `model` (scaffold → inject). */
function buildStillGraph(
  model: string,
  extra: { castcutPoseGuide?: string } = {},
  availableNodeTypes?: Set<string>
) {
  const params = resolveQueueParams(
    undefined,
    {
      seed: '7',
      width: '960',
      height: '1280',
      inputImageFilename: 'plate.png',
      ...extra,
    },
    { model }
  );
  return injectPromptsWithFallbacks(
    JSON.parse(buildWorkflowScaffoldForModel(model).json) as Record<string, unknown>,
    { positive: 'she lies on her side on the bed', negative: 'blurry', params },
    resolvePlaceholderTokens(),
    {
      model,
      directWorkflowPatching: true,
      ...(availableNodeTypes ? { availableNodeTypes } : {}),
    }
  ).workflow as Record<string, Node>;
}

const MODELS = ['qwen-rapid-aio-edit', 'qwen-image-edit-2511', 'qwen-image-edit-2511-lightning-4'];

describe('castcut nodes — presence', () => {
  it('needs every node of the job', () => {
    assert.equal(castcutBestOfTwoAvailable(WITH_PACK), true);
    assert.equal(castcutBestOfTwoAvailable(WITHOUT_PACK), false);
    assert.equal(castcutBestOfTwoAvailable(null), false);
    assert.equal(castcutCutoutAvailable(new Set(CASTCUT_CUTOUT_NODES)), true);
    assert.equal(castcutCutoutAvailable(['RemoveBackground', 'CastcutMaskRepair']), false);
  });

  it('is an optional Manager install for every Castcut node', () => {
    for (const node of ['CastcutPoseScore', 'CastcutPickBest', 'CastcutMaskRepair', 'CastcutReport']) {
      const pack = lookupKnownComfyNodePack(node);
      assert.equal(pack?.name, 'castcut');
      assert.match(pack?.description ?? '', /^Optional\./);
    }
  });
});

describe('castcut nodes — Best of two in one job', () => {
  for (const model of MODELS) {
    it(`${model}: the graph is byte-identical without the pack (or an unknown node list)`, () => {
      const plain = JSON.stringify(buildStillGraph(model));
      assert.equal(
        JSON.stringify(buildStillGraph(model, { castcutPoseGuide: GUIDE }, WITHOUT_PACK)),
        plain
      );
      assert.equal(JSON.stringify(buildStillGraph(model, { castcutPoseGuide: GUIDE })), plain);
      // The pack alone, with no guide asked for, changes nothing either.
      assert.equal(JSON.stringify(buildStillGraph(model, {}, WITH_PACK)), plain);
    });

    it(`${model}: with the pack, both takes are scored and the closer one saved`, () => {
      const plain = buildStillGraph(model);
      const graph = buildStillGraph(model, { castcutPoseGuide: GUIDE }, WITH_PACK);
      const id = CASTCUT_BEST_OF_TWO_IDS;
      const save = Object.values(graph).find(node => node.class_type === 'SaveImage')!;
      const sampler = Object.values(graph).find(node => node.class_type === 'KSampler')!;
      const plainSampler = Object.values(plain).find(node => node.class_type === 'KSampler')!;
      const plainSave = Object.values(plain).find(node => node.class_type === 'SaveImage')!;
      assert.deepEqual(graph[id.batch]?.inputs, {
        samples: plainSampler.inputs.latent_image,
        amount: 2,
      });
      assert.deepEqual(sampler.inputs.latent_image, [id.batch, 0]);
      assert.deepEqual(graph[id.detect]?.inputs.image, plainSave.inputs.images);
      assert.deepEqual(graph[id.score]?.inputs, {
        pose_keypoint: [id.detect, 1],
        guide_json: GUIDE,
      });
      assert.deepEqual(graph[id.pick]?.inputs.images, plainSave.inputs.images);
      assert.deepEqual(save.inputs.images, [id.pick, 0]);
      assert.deepEqual(graph[id.report]?.inputs.alternate, [id.pick, 1]);
      // Nothing else moved.
      assert.equal(Object.keys(graph).length, Object.keys(plain).length + 5);
    });
  }

  it('leaves graphs it does not recognise alone', () => {
    const twoSaves = {
      '1': { class_type: 'EmptyLatentImage', inputs: {} },
      '2': { class_type: 'KSampler', inputs: { latent_image: ['1', 0] } },
      '3': { class_type: 'VAEDecode', inputs: { samples: ['2', 0] } },
      '4': { class_type: 'SaveImage', inputs: { images: ['3', 0] } },
      '5': { class_type: 'SaveImage', inputs: { images: ['3', 0] } },
    };
    const result = applyCastcutBestOfTwo(twoSaves, GUIDE);
    assert.equal(result.applied, false);
    assert.equal(result.workflow, twoSaves);
    const twoRoots = {
      '1': { class_type: 'EmptyLatentImage', inputs: {} },
      '2': { class_type: 'KSampler', inputs: { latent_image: ['1', 0] } },
      '3': { class_type: 'KSampler', inputs: { latent_image: ['1', 0] } },
      '4': { class_type: 'SaveImage', inputs: { images: ['3', 0] } },
    };
    assert.equal(applyCastcutBestOfTwo(twoRoots, GUIDE).applied, false);
  });

  it('batches only the first pass of a two-pass graph, and only once', () => {
    const hires = {
      '1': { class_type: 'EmptyLatentImage', inputs: {} },
      '2': { class_type: 'KSampler', inputs: { latent_image: ['1', 0] } },
      '3': { class_type: 'LatentUpscaleBy', inputs: { samples: ['2', 0] } },
      '4': { class_type: 'KSampler', inputs: { latent_image: ['3', 0] } },
      '5': { class_type: 'VAEDecode', inputs: { samples: ['4', 0] } },
      '6': { class_type: 'SaveImage', inputs: { images: ['5', 0], filename_prefix: 'Castcut' } },
    };
    const result = applyCastcutBestOfTwo(hires, GUIDE);
    assert.equal(result.applied, true);
    const graph = result.workflow as Record<string, Node>;
    assert.deepEqual(graph['2']?.inputs.latent_image, [CASTCUT_BEST_OF_TWO_IDS.batch, 0]);
    assert.deepEqual(graph['4']?.inputs.latent_image, ['3', 0]);
    assert.equal(graph[CASTCUT_BEST_OF_TWO_IDS.report]?.inputs.filename_prefix, 'Castcut-alt');
    // The input graph is untouched, and a second pass is a no-op.
    assert.deepEqual(hires['2'].inputs.latent_image, ['1', 0]);
    assert.equal(applyCastcutBestOfTwo(graph, GUIDE).applied, false);
  });
});

describe('castcut nodes — reports', () => {
  const outputs = {
    '9': { images: [{ filename: 'Castcut_00001_.png', subfolder: '', type: 'output' }] },
    'castcut-dwpose': { openpose_json: ['[]'] },
    'castcut-report': {
      castcut: [
        {
          version: '1.0.0',
          kind: 'pick-best',
          bestIndex: 1,
          otherIndex: 0,
          scores: [0.42, 0.81],
          results: [{ score: 0.42, postureMiss: true }, { score: 0.81 }],
          alternates: [{ filename: 'Castcut-alt_00003_.png', subfolder: '', type: 'output' }],
        },
      ],
    },
  };

  it('reads both scores and the other take from the job outputs', () => {
    const report = parseCastcutBestOfTwoReport(outputs);
    assert.deepEqual(report?.scores, [0.42, 0.81]);
    assert.equal(report?.bestIndex, 1);
    assert.equal(report?.results[0]?.postureMiss, true);
    assert.equal(
      castcutViewUrl(report!.alternate!),
      '/api/comfyui/view?filename=Castcut-alt_00003_.png&subfolder=&type=output'
    );
    assert.equal(parseCastcutBestOfTwoReport({ '9': outputs['9'] }), null);
    assert.equal(parseCastcutBestOfTwoReport(null), null);
    assert.equal(parseCastcutMaskRepairReport(outputs), null);
  });

  it('reads the cut-out repair numbers', () => {
    const report = parseCastcutMaskRepairReport({
      '6': {
        castcut: [
          {
            kind: 'mask-repair',
            images: [
              {
                filledHolePixels: 12,
                regrownPixels: 0,
                plainBackdrop: true,
                subjectShare: 0.31,
                looksIsolated: true,
              },
            ],
          },
        ],
      },
    });
    assert.deepEqual(report, {
      filledHolePixels: 12,
      regrownPixels: 0,
      plainBackdrop: true,
      subjectShare: 0.31,
      looksIsolated: true,
    });
  });

  it('builds the in-job cut-out graph', () => {
    const graph = buildCastcutCutoutGraph({
      imageName: 'castcut-isolate-1.png',
      modelInput: 'bg_removal_name',
      modelName: 'birefnet.safetensors',
      fill: { r: 0, g: 177, b: 64 },
    }) as Record<string, Node>;
    assert.equal(graph['4']?.class_type, 'CastcutMaskRepair');
    assert.equal(graph['4']?.inputs.fill, '#00b140');
    assert.equal(graph['4']?.inputs.regrow_edges, false);
    assert.deepEqual(graph['5']?.inputs.images, ['4', 0]);
    assert.deepEqual(graph['6']?.inputs.report_json, ['4', 2]);
  });

  it('pads the guide to 18 joints', () => {
    const parsed = JSON.parse(castcutGuideJson([[{ x: 0.5, y: 0.2 }]], 0.75)) as {
      guide: unknown[][];
      aspect: number;
    };
    assert.equal(parsed.guide[0]?.length, 18);
    assert.equal(parsed.guide[0]?.[1], null);
    assert.equal(parsed.aspect, 0.75);
  });
});
