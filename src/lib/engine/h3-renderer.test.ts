import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  convertVideoWorkflowToH3,
  H3_FILES,
  h3FrameCount,
  H3_LONG_TALK_TAIL,
  H3_PART_FRAMES,
  h3GridFrames,
  H3_LONG_PART_FRAMES,
  h3PartPrompt,
  h3TimedBlocks,
  H3_STEPS,
  isH3ClipGraph,
  patchH3ReplayGraph,
  H3_REF_FILES,
  H3_REF_NODE,
  H3_REF_STEPS,
  withH3References,
  withH3VoiceAnchor,
  H3_GUIDE_NODE,
  timedLine,
  withH3TimedLine,
} from './h3-renderer';
import { clipEngineForShot, dayClipVideoModel } from '../video/ltx25-renderer';

/** The WAN I2V graph the queue builds (scaffold + WanImageToVideo splice), tokens filled. */
function wanClipGraph(): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'wan.safetensors' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: 'she rocks her hips slowly', clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'flicker, morphing', clip: ['1', 1] } },
    '900': { class_type: 'LoadImage', inputs: { image: 'day-still.png' } },
    '901': {
      class_type: 'WanImageToVideo',
      inputs: {
        positive: ['2', 0],
        negative: ['3', 0],
        vae: ['1', 2],
        width: 960,
        height: 1280,
        length: 64,
        batch_size: 1,
        start_image: ['900', 0],
      },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: 11,
        steps: 8,
        cfg: 1,
        model: ['1', 0],
        positive: ['901', 0],
        negative: ['901', 1],
        latent_image: ['901', 2],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': {
      class_type: 'SaveAnimatedWEBP',
      inputs: { images: ['6', 0], filename_prefix: 'cc-clip', fps: 16 },
    },
  };
}

describe('MiniMax-H3 clip renderer', () => {
  // 4 s + 6 s extra at 16 fps: Day's longest Length on a motion clip (243 frames on H3).
  const longClip = () => {
    const graph = wanClipGraph();
    graph['901']!.inputs.length = 160;
    return graph;
  };
  const nodesOf = (out: ReturnType<typeof convertVideoWorkflowToH3>) =>
    Object.values(out.workflow) as Array<{ class_type: string; inputs: Record<string, unknown> }>;

  it('renders a long clip with no spoken line silent (it drifted into music)', () => {
    const nodes = nodesOf(convertVideoWorkflowToH3(longClip(), { speech: false }));
    assert.equal(nodes.find(node => node.class_type === 'MiniMaxH3ImageToVideo')!.inputs.length, 243);
    assert.ok(!nodes.some(node => node.class_type === 'VAEDecodeAudio'));
    assert.ok(!nodes.some(node => node.inputs.vae_name === H3_FILES.audioVae));
    assert.equal(nodes.find(node => node.class_type === 'CreateVideo')!.inputs.audio, undefined);
  });

  it('keeps sound on a default-length clip and on any clip with a line', () => {
    for (const [graph, speech] of [
      [wanClipGraph(), false],
      [longClip(), true],
      [longClip(), undefined],
    ] as const) {
      const nodes = nodesOf(convertVideoWorkflowToH3(graph, { speech }));
      assert.ok(nodes.some(node => node.class_type === 'VAEDecodeAudio'));
      assert.deepEqual(nodes.find(node => node.class_type === 'CreateVideo')!.inputs.audio, ['18', 0]);
    }
  });

  it('tells a long talking clip to stay quiet after its line (it babbled)', () => {
    const prompt = (graph: ReturnType<typeof wanClipGraph>, speech: boolean) =>
      String(
        nodesOf(convertVideoWorkflowToH3(graph, { speech })).find(
          node => node.class_type === 'MiniMaxH3ImageToVideo'
        )!.inputs.prompt
      );
    assert.ok(prompt(longClip(), true).endsWith(H3_LONG_TALK_TAIL));
    assert.ok(!prompt(wanClipGraph(), true).includes(H3_LONG_TALK_TAIL));
    assert.ok(!prompt(longClip(), false).includes(H3_LONG_TALK_TAIL));
  });

  it('turns the WAN clip into an H3 graph with sound, sized from the still', () => {
    const out = convertVideoWorkflowToH3(wanClipGraph());
    assert.equal(out.converted, true);
    const nodes = Object.values(out.workflow);
    const i2v = nodes.find(node => node.class_type === 'MiniMaxH3ImageToVideo')!;
    assert.equal(i2v.inputs!.prompt, 'she rocks her hips slowly');
    assert.equal(i2v.inputs!.length, 124);
    assert.ok(Array.isArray(i2v.inputs!.width));
    assert.equal(i2v.inputs!.last_frame, undefined);
    assert.ok(nodes.some(node => node.inputs?.lora_name === H3_FILES.turboLora));
    assert.ok(nodes.some(node => node.inputs?.steps === H3_STEPS));
    assert.ok(nodes.some(node => node.class_type === 'VAEDecodeAudio'));
    const save = nodes.find(node => node.class_type === 'SaveVideo')!;
    assert.equal(save.inputs!.filename_prefix, 'cc-clip');
    assert.equal(save.inputs!.format, 'mp4');
    assert.equal(nodes.find(node => node.class_type === 'RandomNoise')!.inputs!.noise_seed, 11);
  });
  it('lands on an end pose through its last frame', () => {
    const out = convertVideoWorkflowToH3(wanClipGraph(), { endImage: 'end.png' });
    const i2v = Object.values(out.workflow).find(node => node.class_type === 'MiniMaxH3ImageToVideo')!;
    const ref = i2v.inputs!.last_frame as [string, number];
    assert.equal(out.workflow[ref[0]]!.inputs!.image, 'end.png');
  });
  it('snaps lengths to the 17k+5 grid from 124 to 362 frames', () => {
    assert.equal(h3FrameCount(64, 16), 124);
    assert.equal(h3FrameCount(96, 16), 141);
    assert.equal(h3FrameCount(1000, 16), 362);
  });
  it('is picked for Day clips on request and takes every shot, two-person adult ones too', () => {
    assert.equal(dayClipVideoModel('h3', 'wan-video'), 'minimax-h3');
    assert.equal(clipEngineForShot('minimax-h3', { adultDuo: false, speaking: true }), 'minimax-h3');
    assert.equal(clipEngineForShot('minimax-h3', { adultDuo: true }), 'minimax-h3');
  });
});

describe('H3 camera words', async () => {
  const { h3CameraWords } = await import('./h3-renderer');
  it('says the framing positively and drops zoom / push-in / close-up', () => {
    const intimate = h3CameraWords(
      'Motion: slow. Camera: locked-off static tripod shot — no camera movement, no zoom, no push-in, framing stays as the first frame. Stable identity.'
    );
    assert.equal(
      intimate,
      'Motion: slow. Camera: one fixed wide shot on a tripod for the whole clip, the same framing as the first frame from start to end. Stable identity.'
    );
    const event = h3CameraWords(
      'She walks on. One continuous shot that starts on the first frame; the camera stays still and keeps the same framing — it does not move, zoom or push in. The end.'
    );
    assert.equal(event, 'She walks on. The end.');
    assert.doesNotMatch(event + intimate, /zoom|push-in|close-up/i);
  });

  it('replays a long silent clip as one ~5 s part with sound, from the last frame', () => {
    const graph = wanClipGraph();
    graph['901']!.inputs.length = 160;
    const { workflow } = convertVideoWorkflowToH3(graph, { speech: false, endImage: 'end.png' });
    assert.equal(isH3ClipGraph(workflow), true);
    assert.equal(isH3ClipGraph(wanClipGraph()), false);
    const part = patchH3ReplayGraph(workflow, {
      lastFrame: 'last.png',
      prompt: 'part prompt',
      seed: 42,
      prefix: 'Castcut-extend',
    });
    assert.ok(part);
    const nodes = Object.values(part.graph);
    const h3 = nodes.find(node => node.class_type === 'MiniMaxH3ImageToVideo')!.inputs!;
    assert.equal(h3.length, H3_PART_FRAMES);
    assert.equal(h3.prompt, 'part prompt');
    assert.equal(h3.last_frame, undefined);
    const loaders = nodes.filter(node => node.class_type === 'LoadImage');
    assert.deepEqual(loaders.map(node => node.inputs!.image), ['last.png']);
    const create = nodes.find(node => node.class_type === 'CreateVideo')!.inputs!;
    const audio = part.graph[(create.audio as [string, number])[0]]!;
    assert.equal(audio.class_type, 'VAEDecodeAudio');
    const vae = part.graph[(audio.inputs!.vae as [string, number])[0]]!;
    assert.equal(vae.inputs!.vae_name, H3_FILES.audioVae);
    assert.equal(nodes.find(node => node.class_type === 'RandomNoise')!.inputs!.noise_seed, 42);
    assert.equal(part.graph[part.saveNode]!.inputs!.filename_prefix, 'Castcut-extend');
    // The source graph is left alone.
    assert.equal(
      Object.values(workflow).find(node => node.class_type === 'MiniMaxH3ImageToVideo')!.inputs!
        .length,
      243
    );
  });

  it('a part carries the clip’s action on without its line, with the place’s sound', () => {
    const clip = `10s clip, one continuous shot. Action: she waves. She says clearly, "See you soon." Camera: one fixed wide shot on a tripod. ${H3_LONG_TALK_TAIL}`;
    const part = h3PartPrompt(clip, { beat: 'She keeps waving.', place: 'a sunny park.' });
    assert.match(
      part,
      /^5s clip, one continuous shot with no cuts, carrying straight on from the first frame to the last\. She keeps waving\./
    );
    assert.match(part, /Action: she waves\./);
    assert.doesNotMatch(part, /See you soon|10s clip|stays quiet/);
    assert.match(part, /Sound: the natural sound of the sunny park/);
    const said = h3PartPrompt(clip, { beat: 'He nods.', line: 'Then we go.', speaker: 'He' });
    assert.match(said, /He says, "Then we go\." — his lips move/);
    assert.match(said, /under the voice/);
    // Live (2026-10-31): a part froze in its end pose; sunglasses came and went.
    assert.match(part, /unhurried and fills the whole part: she makes the gesture, then settles/);
    assert.match(said, /He wears exactly what he wears in the first frame/);
    // M11 T21: two people — both kept in view, the motion theirs.
    const both = h3PartPrompt(clip, { beat: 'They laugh together.', people: 2 });
    assert.match(both, /Both people stay in the shot, in view/);
    assert.match(both, /they make the gesture, then settle back into relaxed poses/);
    assert.match(both, /The place around them/);
    assert.doesNotMatch(part, /Both people/);
  });
});

// M11: a part on H3's reference model — the start frame as <Picture 1>, the Cast's pictures after.
describe('withH3References', () => {
  const replay = () => ({
    '1': { class_type: 'UNETLoader', inputs: { unet_name: H3_FILES.transformer } },
    '2': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: H3_FILES.turboLora } },
    '3': { class_type: 'CLIPLoader', inputs: {} },
    '4': { class_type: 'VAELoader', inputs: { vae_name: H3_FILES.videoVae } },
    '5': { class_type: 'VAELoader', inputs: { vae_name: H3_FILES.audioVae } },
    '6': { class_type: 'LoadImage', inputs: { image: 'start.png' } },
    '7': { class_type: 'GetImageSize', inputs: { image: ['6', 0] } },
    '10': {
      class_type: 'MiniMaxH3ImageToVideo',
      inputs: { clip: ['3', 0], vae: ['4', 0], width: ['8', 1], height: ['9', 1], length: 124, first_frame: ['6', 0], prompt: 'Action: she smiles.' },
    },
    '14': { class_type: 'BasicScheduler', inputs: { steps: 6 } },
  });

  it('moves the part to the reference model with its pictures named and her look said', () => {
    const graph = withH3References(replay(), {
      pictures: [
        { image: 'start.png', shows: 'the first frame' },
        { image: 'plate.png', shows: 'her whole body' },
      ],
      look: 'She has long blonde hair and an orange bikini.',
    })!;
    assert.equal(graph['1']!.inputs!.unet_name, H3_REF_FILES.transformer);
    assert.equal(graph['2']!.inputs!.lora_name, H3_REF_FILES.turboLora);
    assert.equal(graph['14']!.inputs!.steps, H3_REF_STEPS);
    const h3 = graph['10']!;
    assert.equal(h3.class_type, H3_REF_NODE);
    // The start frame's own loader (its size sets the video's) is <Picture 1>.
    assert.deepEqual(h3.inputs!['ref_images.ref_image_1'], ['6', 0]);
    assert.equal(graph['6']!.inputs!.image, 'start.png');
    assert.equal(graph[String((h3.inputs!['ref_images.ref_image_2'] as [string, number])[0])]!.inputs!.image, 'plate.png');
    assert.deepEqual(h3.inputs!.audio_vae, ['5', 0]);
    assert.equal(
      h3.inputs!.prompt,
      '<Picture 1> is the first frame. <Picture 2> is her whole body. She has long blonde hair and an orange bikini. Action: she smiles.'
    );
    assert.equal(h3.inputs!.first_frame, undefined);
  });

  it('is null for a graph that is not H3, or with no pictures', () => {
    assert.equal(withH3References({ '1': { class_type: 'UNETLoader', inputs: {} } }, { pictures: [{ image: 'a', shows: 'b' }] }), null);
    assert.equal(withH3References(replay(), { pictures: [] }), null);
  });
});

describe('MiniMax-H3 longer clips without the build-up (M11 T13–T14)', () => {
  it('snaps a part to H3’s frame grid, at most its longest', () => {
    assert.equal(h3GridFrames(60), 124);
    assert.equal(h3GridFrames(124), 124);
    assert.equal(h3GridFrames(125), 141);
    assert.equal(h3GridFrames(361), 362);
    assert.equal(h3GridFrames(900), H3_LONG_PART_FRAMES);
  });

  it('times a long part’s action in blocks, one continuous shot, no sound asked for', () => {
    const blocks = [
      { beat: 'She shifts on the towel.', seconds: 5 },
      { beat: 'she adjusts her hat', seconds: 5 },
      { beat: 'she lies back', seconds: 3 },
    ];
    assert.equal(
      h3TimedBlocks(blocks),
      '0–5s: She shifts on the towel. 5–10s: she adjusts her hat. 10–13s: she lies back.'
    );
    const prompt = h3PartPrompt('4s clip. Action: relaxing.', { beat: '', blocks, place: 'beach' });
    assert.match(prompt, /^13s clip, one continuous shot, no cuts/);
    assert.match(prompt, /0–5s: She shifts on the towel\./);
    assert.match(prompt, /no new shot/);
    assert.doesNotMatch(prompt, /Sound:/);
  });

  it('replays a part long and silent, or ending on a keyframe', () => {
    const { workflow } = convertVideoWorkflowToH3(wanClipGraph(), { speech: false });
    const long = patchH3ReplayGraph(workflow, {
      lastFrame: 'last.png',
      prompt: 'p',
      seed: 1,
      prefix: 'x',
      frames: 300,
      silent: true,
    })!;
    const h3 = (graph: Record<string, { class_type?: string; inputs?: Record<string, unknown> }>) =>
      Object.values(graph).find(node => node.class_type === 'MiniMaxH3ImageToVideo')!.inputs!;
    assert.equal(h3(long.graph).length, h3GridFrames(300));
    const create = Object.values(long.graph).find(node => node.class_type === 'CreateVideo')!;
    assert.equal(create.inputs!.audio, undefined);
    const keyed = patchH3ReplayGraph(workflow, {
      lastFrame: 'last.png',
      prompt: 'p',
      seed: 1,
      prefix: 'x',
      endFrame: 'key.png',
    })!;
    const end = h3(keyed.graph).last_frame as [string, number];
    assert.equal(keyed.graph[end[0]]!.inputs!.image, 'key.png');
    assert.equal(h3(keyed.graph).length, H3_PART_FRAMES);
  });
});

describe('MiniMax-H3 parts keep what she holds', () => {
  it('says it is held the whole time', () => {
    const prompt = h3PartPrompt('5s clip. Action: waits.', {
      beat: 'She looks out at the city.',
      held: ['a phone in her left hand'],
    });
    assert.match(prompt, /She keeps holding a phone in her left hand the whole time\./);
    assert.doesNotMatch(h3PartPrompt('x', { beat: 'She waits.' }), /keeps holding/);
  });
});

describe('a talking part keeps her voice (M11 T16)', () => {
  it('runs on the reference model with her speaking clip, its first and last frames pinned', () => {
    const { workflow } = convertVideoWorkflowToH3(wanClipGraph(), { speech: true });
    const part = patchH3ReplayGraph(workflow, {
      lastFrame: 'start.png',
      prompt: 'She says, "Hi."',
      seed: 1,
      prefix: 'x',
      endFrame: 'key.png',
    })!;
    const graph = withH3VoiceAnchor(part.graph, {
      voiceClip: 'voice.mp4',
      pictures: [{ image: 'face.png', shows: 'her face' }],
      look: 'Short red hair.',
    })!;
    const nodes = Object.values(graph);
    const ref = nodes.find(node => node.class_type === H3_REF_NODE)!.inputs!;
    assert.match(String(ref.prompt), /^<Picture 1> is her face\. <Video 1> with its sound <Audio 1> is her, speaking/);
    assert.match(String(ref.prompt), /Short red hair\. .*She says, "Hi\."/);
    assert.deepEqual(ref['ref_videos.ref_video_1'], ['h3voiceparts', 0]);
    assert.deepEqual(ref['ref_video_audios.ref_video_audio_1'], ['h3voiceparts', 1]);
    assert.equal(graph.h3voice!.inputs!.file, 'voice.mp4');
    assert.equal(graph[(ref['ref_images.ref_image_1'] as [string, number])[0]]!.inputs!.image, 'face.png');
    // Pinned: the start frame at 0, the keyframe last; the guider reads the pinned conditioning.
    const pins = nodes.filter(node => node.class_type === H3_GUIDE_NODE);
    assert.deepEqual(pins.map(pin => pin.inputs!.frame_idx), [0, -1]);
    const image = (pin: (typeof pins)[number]) =>
      graph[(pin.inputs!.image as [string, number])[0]]!.inputs!.image;
    assert.deepEqual(pins.map(image), ['start.png', 'key.png']);
    const guider = nodes.find(node => node.class_type === 'BasicGuider' || node.class_type === 'CFGGuider')!;
    assert.deepEqual(guider.inputs!.conditioning ?? guider.inputs!.positive, ['h3pin2', 0]);
    assert.equal(nodes.find(node => node.class_type === 'UNETLoader')!.inputs!.unet_name, H3_REF_FILES.transformer);
    // Not an H3 first/last-frame graph: nothing to anchor.
    assert.equal(withH3VoiceAnchor(wanClipGraph(), { voiceClip: 'v.mp4' }), null);
  });
});

describe('a talking part says its line once (M11 T16)', () => {
  it('gives the line its window and silence after', () => {
    const timed = timedLine('She says, "We could stay until the sun goes down." Her lips move.', 124 / 24);
    assert.equal(
      timed,
      'Timing: 0–3.9s: she says "We could stay until the sun goes down." once. 3.9–5.2s: she stops talking, closes her mouth and listens — silence from her, only the sound of the place.'
    );
    assert.match(timedLine('He says "Hi."', 5, 'He'), /^Timing: 0–2s: he says "Hi\." once\. 2–5s: he stops talking, closes his mouth/);
    assert.match(timedLine('She stays put and says clearly, "Want my towel?" Her lips move.', 5), /says "Want my towel\?" once/);
    assert.equal(timedLine('She waves.', 5), '');
  });
});

describe('a wordless part of a talking clip stays wordless', () => {
  it('says outright that nobody speaks', () => {
    assert.match(h3PartPrompt('x', { beat: 'She looks out.', wordless: true }), /Nobody speaks in this part/);
    assert.doesNotMatch(h3PartPrompt('x', { beat: 'She looks out.' }), /Nobody speaks/);
    assert.doesNotMatch(h3PartPrompt('x', { beat: 'b', line: 'Hi.', wordless: true }), /Nobody speaks/);
  });
});

describe('a talking H3 part with no voice to keep gets its line timed', () => {
  it('adds the timing to the plain model once, and leaves a wordless part alone', () => {
    const graph = {
      '1': {
        class_type: 'MiniMaxH3ImageToVideo',
        inputs: { prompt: 'She says, "I really need to get back to reading my book."', length: 124 },
      },
    };
    const timed = withH3TimedLine(graph);
    assert.match(String(timed['1']!.inputs.prompt), /Timing: 0–[\d.]+s: she says "I really need/);
    assert.equal(graph['1'].inputs.prompt.includes('Timing'), false);
    assert.equal(withH3TimedLine(timed), timed);
    const wordless = { '1': { class_type: 'MiniMaxH3ImageToVideo', inputs: { prompt: 'She reads.', length: 124 } } };
    assert.equal(withH3TimedLine(wordless), wordless);
  });
});
