import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { convertVideoWorkflowToH3, H3_FILES, h3FrameCount, H3_STEPS } from './h3-renderer';
import { clipEngineForShot, dayClipVideoModel } from './ltx25-renderer';

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
