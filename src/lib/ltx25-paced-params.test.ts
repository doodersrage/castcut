import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  injectPromptsWithFallbacks,
  resolvePlaceholderTokens,
  resolveQueueParams,
} from './comfyui/config';
import { buildWorkflowScaffoldForModel } from './workflow/scaffold';

type Node = { class_type: string; inputs: Record<string, unknown> };

/** The LTX clip graph the queue builds for a still, paced (two-person adult) or not. */
function buildClipGraph(
  paced: boolean,
  refine?: { loras?: string[]; nodeTypes?: string[]; speech?: boolean; ambience?: string; on?: boolean }
) {
  const params = resolveQueueParams(undefined, {
    seed: '7',
    width: '960',
    height: '1280',
    videoFrames: 64,
    videoFps: 16,
    inputImageFilename: 'day-still.png',
    ...(paced ? { videoStillHold: 'on' as const } : {}),
    ...(refine && refine.on !== false ? { videoRefine: 'on' as const } : {}),
    ...(refine?.ambience ? { videoAmbience: refine.ambience } : {}),
    ...(refine?.speech ? { videoSpeech: 'on' as const } : {}),
  });
  return injectPromptsWithFallbacks(
    JSON.parse(buildWorkflowScaffoldForModel('ltx-video-2.5').json) as Record<string, unknown>,
    { positive: 'she rocks her hips slowly', negative: 'flicker', params },
    resolvePlaceholderTokens(),
    {
      model: 'ltx-video-2.5',
      directWorkflowPatching: true,
      videoRenderer: 'ltx-2.5',
      ...(refine?.loras ? { availableLoras: refine.loras } : {}),
      ...(refine?.nodeTypes ? { availableNodeTypes: refine.nodeTypes } : {}),
    }
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

describe('adult LTX clip prompt', () => {
  it('adds the calm tempo line, and the anatomy line only for two people', async () => {
    const { withAdultLtxLines, LTX_FAST_PACE_LINE, LTX_DUO_ANATOMY_LINE } = await import(
      './ltx25-renderer'
    );
    assert.equal(withAdultLtxLines(' She rocks. ', false), `She rocks. ${LTX_FAST_PACE_LINE}`);
    assert.equal(
      withAdultLtxLines('She rocks.', true),
      `She rocks. ${LTX_FAST_PACE_LINE} ${LTX_DUO_ANATOMY_LINE}`
    );
  });
});

describe('refine detail', () => {
  const REFINE = 'ltx-2.5-22b-ic-lora-refine-details-1.0.safetensors';
  const refined = (graph: Record<string, Node>) =>
    Object.values(graph).some(node => node.class_type === 'LTXAddVideoICLoRAGuide');

  it('re-renders the clip on the IC-LoRA, guided by its own frames, and saves that', () => {
    const graph = buildClipGraph(false, { loras: [`ltx/${REFINE}`] });
    assert.equal(graph['80']?.inputs.lora_name, `ltx/${REFINE}`);
    assert.deepEqual(graph['83']?.inputs.image, ['29', 0]);
    assert.deepEqual(graph['92']?.inputs.samples, ['91', 2]);
    const save = Object.values(graph).find(node => node.class_type === 'SaveAnimatedWEBP');
    assert.deepEqual(save?.inputs.images, ['92', 0]);
  });

  it('is skipped without the LoRA or without the LTXVideo pack', () => {
    assert.equal(refined(buildClipGraph(false, { loras: [] })), false);
    assert.equal(refined(buildClipGraph(false)), false);
    assert.equal(
      refined(
        buildClipGraph(false, {
          loras: [REFINE],
          nodeTypes: ['LTXVImgToVideoInplace', 'GetImageSize', 'ComfyMathExpression'],
        })
      ),
      false
    );
  });

  it('keeps a talking clip\'s voice: the refine sees it frozen, the MP4 takes it as decoded', () => {
    const graph = buildClipGraph(false, { loras: [REFINE], speech: true });
    assert.ok(refined(graph));
    assert.equal(graph['93']?.class_type, 'LTXVFreezeLatent');
    assert.deepEqual(graph['93']?.inputs.latent, ['28', 1]);
    assert.deepEqual(graph['84']?.inputs.audio_latent, ['93', 0]);
    const mp4 = Object.values(graph).find(node => node.class_type === 'CreateVideo');
    assert.deepEqual(mp4?.inputs.images, ['92', 0]);
    assert.deepEqual(mp4?.inputs.audio, ['54', 0]);
  });
});

describe('room sound under a talking clip', () => {
  const talking = (ambience?: string, nodeTypes?: string[]) =>
    buildClipGraph(false, { on: false, speech: true, ambience, nodeTypes });

  it('adds a sound-only pass of the place, matched and mixed under the voice', () => {
    const graph = talking('harbor-side brunch terrace');
    assert.match(String(graph['100']?.inputs.text), /harbor-side brunch terrace: low murmur of other guests/);
    // It hears a blurred copy of the first pass (no lips to read) …
    assert.deepEqual(graph['113']?.inputs.samples, ['20', 0]);
    assert.equal(graph['114']?.class_type, 'ImageBlur');
    assert.deepEqual(graph['103']?.inputs.latent, ['115', 0]);
    // … and is matched 20 dB under her spoken level, not boosted by a fixed amount.
    assert.equal(graph['111']?.class_type, 'CastcutAudioMatchLevel');
    assert.deepEqual(graph['111']?.inputs.reference, ['54', 0]);
    assert.equal(graph['111']?.inputs.offset_db, -20);
    assert.deepEqual(graph['112']?.inputs.audio1, ['54', 0]);
    const mp4 = Object.values(graph).find(node => node.class_type === 'CreateVideo');
    assert.deepEqual(mp4?.inputs.audio, ['112', 0]);
  });

  it('is left off without a place or without the audio mix nodes', () => {
    assert.equal(talking()['112'], undefined);
    const mp4 = Object.values(talking()).find(node => node.class_type === 'CreateVideo');
    assert.deepEqual(mp4?.inputs.audio, ['54', 0]);
    assert.equal(
      talking('park bench', ['LTXVImgToVideoInplace', 'LTXVAudioVAEDecode', 'CreateVideo', 'SaveVideo'])['112'],
      undefined
    );
  });
});
