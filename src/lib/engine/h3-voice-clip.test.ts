import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  injectPromptsWithFallbacks,
  resolvePlaceholderTokens,
  resolveQueueParams,
} from '../comfyui/config';
import { buildWorkflowScaffoldForModel } from '../workflow/scaffold';
import { H3_GUIDE_NODE, H3_REF_NODE, H3_REQUIRED_NODE } from './h3-renderer';

type Node = { class_type: string; inputs: Record<string, unknown> };

/** A Day talking clip on MiniMax-H3, as the queue builds it. */
function talkingClip(params: Record<string, unknown>, nodeTypes?: string[]) {
  const resolved = resolveQueueParams(undefined, {
    seed: '7',
    width: '960',
    height: '1280',
    videoFrames: 80,
    videoFps: 16,
    inputImageFilename: 'day-still.png',
    videoSpeech: 'on',
    ...params,
  });
  return Object.values(
    injectPromptsWithFallbacks(
      JSON.parse(buildWorkflowScaffoldForModel('minimax-h3').json) as Record<string, unknown>,
      { positive: 'She says, "Hi there."', negative: '', params: resolved },
      resolvePlaceholderTokens(),
      {
        model: 'minimax-h3',
        directWorkflowPatching: true,
        videoRenderer: 'minimax-h3',
        ...(nodeTypes ? { availableNodeTypes: nodeTypes } : {}),
      }
    ).workflow as Record<string, Node>
  );
}

describe('a new talking clip speaks in the Cast’s kept voice (M11 T16)', () => {
  it('anchors an H3 talking clip on the voice clip, its start frame pinned', () => {
    const nodes = talkingClip({ videoVoiceClip: 'castcut-voice-anchor.mp4' });
    const ref = nodes.find(node => node.class_type === H3_REF_NODE);
    assert.ok(ref, 'on the reference model');
    assert.match(String(ref.inputs.prompt), /<Video 1> with its sound <Audio 1> is her, speaking/);
    assert.ok(nodes.some(node => node.class_type === 'LoadVideo' && node.inputs.file === 'castcut-voice-anchor.mp4'));
    const pins = nodes.filter(node => node.class_type === H3_GUIDE_NODE);
    assert.deepEqual(pins.map(pin => pin.inputs.frame_idx), [0]);
  });

  it('leaves it alone without a voice clip, or when ComfyUI lacks the nodes', () => {
    assert.ok(talkingClip({}).some(node => node.class_type === H3_REQUIRED_NODE));
    const without = talkingClip({ videoVoiceClip: 'v.mp4' }, [H3_REQUIRED_NODE, 'LoadImage']);
    assert.ok(without.some(node => node.class_type === H3_REQUIRED_NODE));
    assert.ok(!without.some(node => node.class_type === H3_REF_NODE));
  });
});

describe('LTX talking clips speak in the kept voice (M11 T17)', () => {
  function ltxClip(params: Record<string, unknown>, loras: string[] = []) {
    const resolved = resolveQueueParams(undefined, {
      seed: '7', width: '960', height: '1280', videoFrames: 80, videoFps: 16,
      inputImageFilename: 'day-still.png', videoSpeech: 'on', ...params,
    });
    return Object.values(
      injectPromptsWithFallbacks(
        JSON.parse(buildWorkflowScaffoldForModel('ltx-video-2.5').json) as Record<string, unknown>,
        { positive: 'She says, "Hi there."', negative: '', params: resolved },
        resolvePlaceholderTokens(),
        { model: 'ltx-video-2.5', directWorkflowPatching: true, videoRenderer: 'ltx-2.5', availableLoras: loras }
      ).workflow as Record<string, Node>
    );
  }
  it('as reference tokens by default; through the ID-LoRA with Steer on', () => {
    const lora = 'ltx-2.3-id-lora-talkvid-3k.safetensors';
    const byDefault = ltxClip({ videoVoiceSample: 'voice.wav' }, [lora]);
    assert.ok(byDefault.some(node => node.class_type === 'LTXVSetAudioRefTokens'));
    assert.ok(!byDefault.some(node => node.class_type === 'LTXVReferenceAudio'));
    assert.ok(!byDefault.some(node => node.inputs.lora_name === lora));
    const steered = ltxClip({ videoVoiceSample: 'voice.wav', videoVoiceSteer: 'on' }, [lora]);
    assert.ok(steered.some(node => node.class_type === 'LTXVReferenceAudio'));
    assert.ok(steered.some(node => node.inputs.lora_name === lora));
    assert.ok(!ltxClip({}).some(node => node.class_type === 'LTXVSetAudioRefTokens'));
  });
});
