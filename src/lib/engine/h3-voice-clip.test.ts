import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  injectPromptsWithFallbacks,
  resolvePlaceholderTokens,
  resolveQueueParams,
} from '../comfyui/config';
import { buildWorkflowScaffoldForModel } from '../workflow/scaffold';
import { conversationClipPrompt, conversationSpeakers } from '../video/ltx25-renderer';
import {
  H3_GUIDE_NODE,
  H3_REF_NODE,
  H3_REQUIRED_NODE,
  h3OneSpeaks,
  h3ReplaySource,
  H3_FILES,
  isH3ClipGraph,
  withH3PartSpeaker,
} from './h3-renderer';

type Node = { class_type: string; inputs: Record<string, unknown> };

/** A Day talking clip on MiniMax-H3, as the queue builds it (its graph, by node id). */
function talkingGraph(
  params: Record<string, unknown>,
  nodeTypes?: string[],
  positive = 'She says, "Hi there."'
): Record<string, Node> {
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
  return injectPromptsWithFallbacks(
    JSON.parse(buildWorkflowScaffoldForModel('minimax-h3').json) as Record<string, unknown>,
    { positive, negative: '', params: resolved },
    resolvePlaceholderTokens(),
    {
      model: 'minimax-h3',
      directWorkflowPatching: true,
      videoRenderer: 'minimax-h3',
      ...(nodeTypes ? { availableNodeTypes: nodeTypes } : {}),
    }
  ).workflow as Record<string, Node>;
}

/** Its nodes. */
function talkingClip(
  params: Record<string, unknown>,
  nodeTypes?: string[],
  positive = 'She says, "Hi there."'
) {
  return Object.values(talkingGraph(params, nodeTypes, positive));
}

describe('a new talking clip speaks in the Cast’s kept voice (M11 T16)', () => {
  it('anchors an H3 talking clip on the voice clip, its start frame pinned', () => {
    const nodes = talkingClip({ videoVoiceClip: 'castcut-voice-anchor.mp4' });
    const ref = nodes.find(node => node.class_type === H3_REF_NODE);
    assert.ok(ref, 'on the reference model');
    assert.match(String(ref.inputs.prompt), /<Video 1> with its sound <Audio 1> is \(S1\), speaking: \(S1\) speaks/);
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

describe('a recorded voice (sound only) on MiniMax-H3', () => {
  it('anchors on the sample when there is no voice clip; the clip wins when there is one', () => {
    const nodes = talkingClip({ videoVoiceSample: 'castcut-voice.wav' });
    const ref = nodes.find(node => node.class_type === H3_REF_NODE);
    assert.ok(ref);
    assert.match(String(ref.inputs.prompt), /^<Audio 1> is her voice: \(S1\) speaks in exactly that voice/);
    assert.ok(nodes.some(node => node.class_type === 'LoadAudio' && node.inputs.audio === 'castcut-voice.wav'));
    assert.ok(!nodes.some(node => node.class_type === 'LoadVideo'));
    const both = talkingClip({ videoVoiceSample: 'castcut-voice.wav', videoVoiceClip: 'clip.mp4' });
    assert.ok(both.some(node => node.class_type === 'LoadVideo' && node.inputs.file === 'clip.mp4'));
    assert.ok(!both.some(node => node.class_type === 'LoadAudio'));
  });
});

describe('the voice clip’s own words are never said', () => {
  it('names what the kept clip says as words she never says; without them, as before', () => {
    const ref = (params: Record<string, unknown>) =>
      String(talkingClip(params).find(node => node.class_type === H3_REF_NODE)!.inputs.prompt);
    const told = ref({ videoVoiceClip: 'clip.mp4', videoVoiceClipWords: 'This is what I sound like.' });
    assert.match(
      told,
      /<Audio 1> is only how her voice sounds: its words \("This is what I sound like\."\) are not hers to say — she never says them\./
    );
    assert.match(ref({ videoVoiceClip: 'clip.mp4' }), /<Audio 1> is only how her voice sounds, not what she says\./);
  });
});

describe('two people talking, each in their own voice (M11 T21)', () => {
  const conversation = conversationClipPrompt({
    setting: 'rooftop ledge at night',
    line: 'The city is so bright tonight.',
    reply: 'It never sleeps.',
    lead: 'woman',
    partner: 'man',
  });
  const voices = {
    videoConversation: 'woman|man',
    videoVoiceClip: 'her-voice.mp4',
    videoVoiceClipWords: 'Hi, I am Lana.',
    videoPartnerVoiceClip: 'his-voice.mp4',
    videoPartnerVoiceClipWords: 'Hi, I am Marco.',
  };

  it('gives the line her voice and the reply his, in H3\'s two-speaker dialogue', () => {
    const nodes = talkingClip(voices, undefined, conversation);
    const ref = nodes.find(node => node.class_type === H3_REF_NODE)!;
    const prompt = String(ref.inputs.prompt);
    assert.match(prompt, /<Video 1> with its sound <Audio 1> is \(S1\), the woman, speaking/);
    assert.match(prompt, /<Video 2> with its sound <Audio 2> is \(S2\), the man, speaking/);
    assert.match(prompt, /its words \("Hi, I am Marco\."\) are not his to say — he never says them/);
    assert.match(
      prompt,
      /\(S1\), the woman, on-screen, says <d>\[English\] The city is so bright tonight\.<\/d> Then \(S2\), the man, on-screen, replies <d>\[English\] It never sleeps\.<\/d>/
    );
    assert.match(prompt, /Only \(S1\) and \(S2\) speak, one at a time/);
    // One speaker's "the person stays quiet" is not for two.
    assert.doesNotMatch(prompt, /the person stays quiet/);
    assert.deepEqual(
      nodes.filter(node => node.class_type === 'LoadVideo').map(node => node.inputs.file),
      ['her-voice.mp4', 'his-voice.mp4']
    );
    assert.ok(Object.keys(ref.inputs).includes('ref_video_audios.ref_video_audio_2'));
    // The start frame is <Picture 1> as well as pinned (both stay in frame).
    assert.match(prompt, /^<Picture 1> is the first frame/);
    const start = nodes.find(
      node => node.class_type === 'LoadImage' && node.inputs.image === 'day-still.png'
    );
    assert.ok(start && ref.inputs['ref_images.ref_image_1']);
    assert.match(prompt, /The camera never cuts or moves to either speaker[^(]*\(S1\), the woman/);
    assert.deepEqual(
      nodes.filter(node => node.class_type === H3_GUIDE_NODE).map(pin => pin.inputs.frame_idx),
      [0]
    );
  });

  it('a partner with no kept voice gets one from H3; with no voice at all, neither is pulled to hers', () => {
    const one = talkingClip({ ...voices, videoPartnerVoiceClip: undefined }, undefined, conversation);
    const prompt = String(one.find(node => node.class_type === H3_REF_NODE)!.inputs.prompt);
    assert.match(prompt, /<Video 1> with its sound <Audio 1> is \(S1\), the woman/);
    assert.doesNotMatch(prompt, /<Video 2>/);
    assert.match(prompt, /Then \(S2\), the man, on-screen, replies/);
    // No voice clips (a recorded voice's sample is not told apart): the plain model, as before.
    const none = talkingClip(
      { videoConversation: 'woman|man', videoVoiceSample: 'her.wav' },
      undefined,
      conversation
    );
    assert.ok(none.some(node => node.class_type === H3_REQUIRED_NODE));
    assert.ok(!none.some(node => node.class_type === H3_REF_NODE));
  });

  it('names two women as conversationClipPrompt does', () => {
    assert.deepEqual(conversationSpeakers('woman', 'woman'), ['woman', 'other woman']);
    assert.deepEqual(conversationSpeakers('man', 'woman'), ['man', 'woman']);
  });
});

describe('a part of a two-person talking clip (M11 T21)', () => {
  const her = { noun: 'woman', who: 'She' as const, voiceClip: 'her.mp4', clipWords: 'Hi, I am Lana.' };
  const him = { noun: 'man', who: 'He' as const, voiceClip: 'his.mp4' };
  const part =
    '5s clip, one continuous shot. He leans back. He says, "We could, if you brought the blankets." — his lips move with every word. Sound: the natural sound of the rooftop.';

  it('has the speaker say the line and the other listen', () => {
    const said = h3OneSpeaks(part, him, '(S2)', her, '(S1)')!;
    assert.match(
      said,
      /\(S2\), the man, on-screen, says <d>\[English\] We could, if you brought the blankets\.<\/d>/
    );
    assert.match(said, /\(S1\), the woman, listens and says nothing — her mouth closed/);
    assert.match(said, /Only \(S2\) speaks, in his own voice/);
    assert.doesNotMatch(said, /lips move with every word/);
    assert.match(said, /The camera never cuts or moves to either speaker/);
    assert.equal(h3OneSpeaks('No line here.', him, '(S2)', her, '(S1)'), null);
  });

  it('gives the part both voices, hers first, and the start frame as Picture 1', () => {
    const graph = talkingGraph({}, undefined, part);
    const out = withH3PartSpeaker(graph as never, {
      first: her,
      second: him,
      speaking: 'second',
      pictures: [{ image: 'face-left.png', shows: 'the face of the person on the left' }],
    })!;
    const ref = Object.values(out).find(node => node?.class_type === H3_REF_NODE)!;
    const prompt = String(ref.inputs!.prompt);
    assert.match(prompt, /^<Picture 1> is the first frame/);
    assert.match(prompt, /<Picture 2> is the face of the person on the left/);
    assert.match(prompt, /<Video 1> with its sound <Audio 1> is \(S1\), the woman/);
    assert.match(prompt, /<Video 2> with its sound <Audio 2> is \(S2\), the man/);
    assert.match(prompt, /\(S2\), the man, on-screen, says/);
  });
});

describe('a clip on the reference model is made longer on H3', () => {
  it('is replayed as the first/last-frame graph it was made from, without its voices or dialogue', () => {
    // Read as LTX before: its parts lost H3, the kept voices and the dialogue fixes.
    const conversation = conversationClipPrompt({
      setting: 'rooftop ledge at night',
      line: 'The city is so bright tonight.',
      reply: 'It never sleeps.',
      lead: 'woman',
      partner: 'man',
    });
    const graph = talkingGraph(
      { videoConversation: 'woman|man', videoVoiceClip: 'her.mp4', videoPartnerVoiceClip: 'his.mp4' },
      undefined,
      conversation
    );
    const nodes = Object.values(graph);
    const pinnedStart = nodes.find(node => node.class_type === H3_GUIDE_NODE)!.inputs.image;
    const replay = h3ReplaySource(graph)!;
    assert.ok(isH3ClipGraph(replay));
    const h3 = Object.values(replay).find(node => node?.class_type === H3_REQUIRED_NODE)!;
    assert.deepEqual(h3.inputs!.first_frame, pinnedStart);
    assert.ok(!Object.values(replay).some(node => node?.class_type === H3_GUIDE_NODE));
    assert.ok(!Object.values(replay).some(node => node?.class_type === 'LoadVideo'));
    assert.ok(
      Object.values(replay).some(
        node => node?.class_type === 'UNETLoader' && node.inputs?.unet_name === H3_FILES.transformer
      )
    );
    const prompt = String(h3.inputs!.prompt);
    assert.doesNotMatch(prompt, /<Video|<Picture|<d>|\(S1\)|overall_soundscape/);
    assert.match(prompt, /rooftop ledge at night/);
    // Every node it reads is still there.
    for (const node of Object.values(replay)) {
      for (const value of Object.values(node?.inputs ?? {})) {
        if (Array.isArray(value) && typeof value[0] === 'string') assert.ok(replay[value[0]], String(value[0]));
      }
    }
    // A first/last-frame graph is replayed as it is.
    const plain = talkingGraph({});
    assert.equal(h3ReplaySource(plain), plain);
  });
});
