import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  injectPromptsWithFallbacks,
  resolvePlaceholderTokens,
  resolveQueueParams,
} from './comfyui-config';
import { buildWorkflowScaffoldForModel } from './workflow-scaffold';

type Node = { class_type: string; inputs: Record<string, unknown> };

/** The LTX clip graph the queue builds for a still, paced (two-person adult) or not. */
function buildClipGraph(paced: boolean) {
  const params = resolveQueueParams(undefined, {
    seed: '7',
    width: '960',
    height: '1280',
    videoFrames: 64,
    videoFps: 16,
    inputImageFilename: 'day-still.png',
    ...(paced ? { videoMotionPace: 'fast' as const } : {}),
  });
  return injectPromptsWithFallbacks(
    JSON.parse(buildWorkflowScaffoldForModel('ltx-video-2.5').json) as Record<string, unknown>,
    { positive: 'she rocks her hips slowly', negative: 'flicker', params },
    resolvePlaceholderTokens(),
    { model: 'ltx-video-2.5', directWorkflowPatching: true, videoRenderer: 'ltx-2.5' }
  ).workflow as Record<string, Node>;
}

describe('two-person adult LTX clips', () => {
  it('reach the graph with the firmer still hold and 1024 size', () => {
    // Dropped by resolveQueueParams until 2026-10-11 — only the prompt lines applied.
    const strengths = (graph: Record<string, Node>) =>
      Object.values(graph)
        .filter(node => node.class_type === 'LTXVImgToVideoInplace')
        .map(node => node.inputs.strength);
    assert.ok(strengths(buildClipGraph(true)).includes(0.85));
    assert.ok(!strengths(buildClipGraph(false)).includes(0.85));
    const sizes = (graph: Record<string, Node>) =>
      Object.values(graph)
        .filter(node => node.class_type === 'ComfyMathExpression')
        .map(node => String(node.inputs.expression));
    assert.ok(sizes(buildClipGraph(true)).some(text => text.includes('1024')));
    assert.ok(!sizes(buildClipGraph(false)).some(text => text.includes('1024')));
  });
});
