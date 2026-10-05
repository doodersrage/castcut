import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  injectPromptsWithFallbacks,
  resolvePlaceholderTokens,
  resolveQueueParams,
} from './comfyui-config';
import { sizeWanClipFromStill, wanClipCanvas } from './wan-clip-canvas';
import { buildWorkflowScaffoldForModel } from './workflow-scaffold';

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

/** The Day / Story WAN clip graph as the queue builds it (Video tool canvas 768²). */
function wanClip(i2v = 'WanImageToVideo'): Graph {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'wan.safetensors' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: 'she turns her head', clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'flicker', clip: ['1', 1] } },
    '4': {
      class_type: 'EmptyHunyuanLatentVideo',
      inputs: { width: '768', height: '768', length: '64', batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: { seed: 1, positive: ['901', 0], negative: ['901', 1], latent_image: ['901', 2] },
    },
    '900': { class_type: 'LoadImage', inputs: { image: 'day-still.png' } },
    '901': {
      class_type: i2v,
      inputs: {
        positive: ['2', 0],
        negative: ['3', 0],
        vae: ['1', 2],
        width: 768,
        height: 768,
        length: 64,
        batch_size: 1,
        start_image: ['900', 0],
      },
    },
  };
}

describe('wan clip canvas', () => {
  it('keeps the pixel budget and takes the still aspect on a 16 grid', () => {
    assert.deepEqual(wanClipCanvas(1104, 1472, 768 * 768), { width: 672, height: 880 });
    assert.deepEqual(wanClipCanvas(848, 1280, 768 * 768), { width: 624, height: 944 });
    assert.deepEqual(wanClipCanvas(1280, 1280, 768 * 768), { width: 768, height: 768 });
    assert.deepEqual(wanClipCanvas(1472, 1104, 768 * 768), { width: 880, height: 672 });
  });

  it('sizes the WAN start-image node from the still (GetImageSize + math)', () => {
    const { workflow, applied } = sizeWanClipFromStill(wanClip());
    assert.equal(applied, true);
    const graph = workflow as Graph;
    const i2v = graph['901']!.inputs;
    assert.ok(Array.isArray(i2v.width) && Array.isArray(i2v.height));
    const widthNode = graph[(i2v.width as [string, number])[0]]!;
    const heightNode = graph[(i2v.height as [string, number])[0]]!;
    assert.equal(widthNode.class_type, 'ComfyMathExpression');
    assert.match(String(widthNode.inputs.expression), /sqrt\(589824 \* a \/ b\) \/ 16\) \* 16/);
    assert.match(String(heightNode.inputs.expression), /sqrt\(589824 \* b \/ a\)/);
    assert.equal((i2v.width as [string, number])[1], 1, 'INT output');
    const sizeRef = widthNode.inputs['values.a'] as [string, number];
    assert.deepEqual(graph[sizeRef[0]]!.inputs.image, ['900', 0]);
    assert.equal(graph[sizeRef[0]]!.class_type, 'GetImageSize');
  });

  it('works on the end-pose (first + last frame) node too', () => {
    const graph = wanClip('WanFirstLastFrameToVideo');
    graph['902'] = { class_type: 'LoadImage', inputs: { image: 'end.png' } };
    graph['901']!.inputs.end_image = ['902', 0];
    const { workflow, applied } = sizeWanClipFromStill(graph);
    assert.equal(applied, true);
    const i2v = (workflow as Graph)['901']!.inputs;
    assert.ok(Array.isArray(i2v.width));
    assert.deepEqual(i2v.end_image, ['902', 0]);
  });

  it('leaves graphs without a WAN start still alone, and does not mutate the input', () => {
    const t2v = wanClip();
    delete t2v['901']!.inputs.start_image;
    assert.equal(sizeWanClipFromStill(t2v).applied, false);
    const other: Graph = { '1': { class_type: 'KSampler', inputs: {} } };
    assert.equal(sizeWanClipFromStill(other).applied, false);
    const original = wanClip();
    sizeWanClipFromStill(original);
    assert.equal(original['901']!.inputs.width, 768);
  });

  it('the queue sizes WAN clips from the still, only when ComfyUI has the nodes', () => {
    const build = (availableNodeTypes?: string[]) => {
      const params = resolveQueueParams(undefined, {
        seed: '7',
        width: '768',
        height: '768',
        videoFrames: 64,
        videoFps: 16,
        inputImageFilename: 'day-still.png',
      });
      return Object.values(
        injectPromptsWithFallbacks(
          JSON.parse(buildWorkflowScaffoldForModel('wan-video').json) as Record<string, unknown>,
          { positive: 'she turns', negative: 'flicker', params },
          resolvePlaceholderTokens(),
          {
            model: 'wan-video',
            directWorkflowPatching: true,
            ...(availableNodeTypes ? { availableNodeTypes } : {}),
          }
        ).workflow as Graph
      );
    };
    const i2v = (nodes: Graph[string][]) =>
      nodes.find(node => node.class_type === 'WanImageToVideo')!.inputs;
    assert.ok(Array.isArray(i2v(build()).width), 'unknown node list: sized');
    assert.ok(
      Array.isArray(i2v(build(['WanImageToVideo', 'GetImageSize', 'ComfyMathExpression'])).width)
    );
    assert.equal(typeof i2v(build(['WanImageToVideo'])).width, 'number', 'older ComfyUI: as before');
  });
});
