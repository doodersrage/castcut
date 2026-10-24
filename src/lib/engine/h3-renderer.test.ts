import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  convertVideoWorkflowToH3,
  H3_FILES,
  h3FrameCount,
  H3_LONG_TALK_TAIL,
  H3_PART_FRAMES,
  h3PartPrompt,
  H3_STEPS,
  isH3ClipGraph,
  patchH3ReplayGraph,
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
    assert.match(part, /^5s clip, carrying straight on from the first frame\. She keeps waving\./);
    assert.match(part, /Action: she waves\./);
    assert.doesNotMatch(part, /See you soon|10s clip|stays quiet/);
    assert.match(part, /Sound: the natural sound of the sunny park/);
    const said = h3PartPrompt(clip, { beat: 'He nods.', line: 'Then we go.', speaker: 'He' });
    assert.match(said, /He says, "Then we go\." — his lips move/);
    assert.match(said, /under the voice/);
  });
});
