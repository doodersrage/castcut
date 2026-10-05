import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clipEngineForShot,
  convertVideoWorkflowToLtx25,
  LTX25_FILES,
  ltx25Canvas,
  ltx25FrameCount,
} from './ltx25-renderer';

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

const byClass = (workflow: Record<string, { class_type?: string; inputs?: Record<string, unknown> }>, type: string) =>
  Object.values(workflow).filter(node => node.class_type === type);

describe('LTX-2.5 clip renderer', () => {
  it('rebuilds a WAN clip as the LTX-2.5 two-pass graph with the same prompt, still and seed', () => {
    const { workflow, converted } = convertVideoWorkflowToLtx25(wanClipGraph());
    assert.equal(converted, true);
    const encodes = byClass(workflow, 'CLIPTextEncode');
    assert.equal(encodes[0]!.inputs!.text, 'she rocks her hips slowly');
    assert.match(String(encodes[1]!.inputs!.text), /flicker, morphing/);
    assert.equal(byClass(workflow, 'LoadImage')[0]!.inputs!.image, 'day-still.png');
    assert.equal(byClass(workflow, 'UNETLoader')[0]!.inputs!.unet_name, LTX25_FILES.transformer);
    assert.equal(byClass(workflow, 'SamplerCustomAdvanced').length, 2);
    assert.equal(byClass(workflow, 'RandomNoise')[0]!.inputs!.noise_seed, 11);
    // 64 frames at 16 fps = 4 s → 97 frames at 24 fps; portrait aspect kept.
    const latent = byClass(workflow, 'EmptyLTXVLatentVideo')[0]!.inputs!;
    assert.deepEqual([latent.width, latent.height, latent.length], [288, 384, 97]);
    const save = byClass(workflow, 'SaveAnimatedWEBP')[0]!.inputs!;
    assert.equal(save.filename_prefix, 'cc-clip');
    assert.equal(save.fps, 24);
    assert.equal(byClass(workflow, 'KSampler').length, 0);
  });

  it('sizes the clip from the still when asked (portrait stills were center-cropped square)', () => {
    const { workflow } = convertVideoWorkflowToLtx25(wanClipGraph(), { sizeFromStill: true });
    const scale = byClass(workflow, 'ImageScale')[0]!.inputs!;
    const latent = byClass(workflow, 'EmptyLTXVLatentVideo')[0]!.inputs!;
    assert.deepEqual([scale.width, scale.height], [['31', 1], ['32', 1]]);
    assert.deepEqual([latent.width, latent.height], [['33', 1], ['34', 1]]);
    assert.deepEqual(workflow['31']!.inputs!['values.a'], ['35', 0]);
    assert.equal(workflow['35']!.class_type, 'GetImageSize');
    assert.match(String(workflow['31']!.inputs!.expression), /768 \* a \/ max\(a, b\)/);
  });

  it('pins the last frame to an end pose on both passes and crops the guide off', () => {
    const { workflow } = convertVideoWorkflowToLtx25(wanClipGraph(), {
      sizeFromStill: true,
      endImage: 'end-pose.png',
    });
    const loads = byClass(workflow, 'LoadImage').map(node => node.inputs!.image);
    assert.deepEqual(loads, ['day-still.png', 'end-pose.png']);
    // The end still is scaled like the start (same size refs).
    assert.deepEqual(workflow['41']!.inputs!.width, workflow['9']!.inputs!.width);
    const guides = byClass(workflow, 'LTXVAddGuide');
    assert.equal(guides.length, 2);
    for (const guide of guides) {
      assert.equal(guide.inputs!.frame_idx, -1);
      assert.equal(guide.inputs!.strength, 1);
      assert.deepEqual(guide.inputs!.image, ['42', 0]);
    }
    assert.deepEqual(workflow['43']!.inputs!.latent, ['12', 0]);
    assert.deepEqual(workflow['14']!.inputs!.video_latent, ['43', 2]);
    assert.deepEqual(workflow['15']!.inputs!.positive, ['43', 0]);
    // Crop after each separate: before the upsampler and before the decode.
    assert.deepEqual(workflow['44']!.inputs!.latent, ['20', 0]);
    assert.deepEqual(workflow['22']!.inputs!.samples, ['44', 2]);
    assert.deepEqual(workflow['45']!.inputs!.positive, ['44', 0]);
    assert.deepEqual(workflow['45']!.inputs!.latent, ['23', 0]);
    assert.deepEqual(workflow['24']!.inputs!.video_latent, ['45', 2]);
    // Pass 2 has its own guider on the second guide's conditioning.
    assert.deepEqual(workflow['27']!.inputs!.guider, ['46', 0]);
    assert.deepEqual(workflow['46']!.inputs!.positive, ['45', 0]);
    assert.deepEqual(workflow['47']!.inputs!.latent, ['28', 0]);
    assert.deepEqual(workflow['29']!.inputs!.samples, ['47', 2]);
  });

  it('reads the end pose off a WAN first+last-frame graph', () => {
    const graph = wanClipGraph();
    graph['902'] = { class_type: 'LoadImage', inputs: { image: 'end-pose.png' } };
    graph['901']!.class_type = 'WanFirstLastFrameToVideo';
    graph['901']!.inputs.end_image = ['902', 0];
    const { workflow, converted } = convertVideoWorkflowToLtx25(graph);
    assert.equal(converted, true);
    assert.equal(workflow['8']!.inputs!.image, 'day-still.png');
    assert.equal(workflow['40']!.inputs!.image, 'end-pose.png');
    assert.equal(byClass(workflow, 'LTXVCropGuides').length, 2);
  });

  it('builds the same graph as before when no end pose is set', () => {
    const plain = convertVideoWorkflowToLtx25(wanClipGraph(), { sizeFromStill: true });
    const blank = convertVideoWorkflowToLtx25(wanClipGraph(), { sizeFromStill: true, endImage: ' ' });
    assert.deepEqual(blank.workflow, plain.workflow);
    assert.equal(byClass(plain.workflow, 'LTXVAddGuide').length, 0);
    assert.deepEqual(plain.workflow['15']!.inputs!.positive, ['7', 0]);
    assert.deepEqual(plain.workflow['27']!.inputs!.guider, ['15', 0]);
    assert.deepEqual(plain.workflow['29']!.inputs!.samples, ['28', 0]);
  });

  it('leaves graphs without a start still or a video save alone', () => {
    const noStill = wanClipGraph();
    delete noStill['900'];
    assert.equal(convertVideoWorkflowToLtx25(noStill).converted, false);
    const placeholder = wanClipGraph();
    placeholder['900']!.inputs.image = '{{INIT_IMAGE}}';
    assert.equal(convertVideoWorkflowToLtx25(placeholder).converted, false);
    const still = wanClipGraph();
    still['7'] = { class_type: 'SaveImage', inputs: { images: ['6', 0] } };
    assert.equal(convertVideoWorkflowToLtx25(still).converted, false);
  });

  it('sizes and lengths', () => {
    assert.deepEqual(ltx25Canvas(960, 1280), { width: 576, height: 768 });
    assert.deepEqual(ltx25Canvas(768, 768), { width: 768, height: 768 });
    assert.deepEqual(ltx25Canvas(1280, 720), { width: 768, height: 448 });
    assert.equal(ltx25FrameCount(64, 16), 97);
    assert.equal(ltx25FrameCount(81, 16), 121);
    assert.equal(ltx25FrameCount(0, 0), 97);
  });

  it('two-person adult clips stay on WAN', () => {
    assert.equal(clipEngineForShot('ltx-video-2.5', { adultDuo: true }), 'wan-video');
    assert.equal(clipEngineForShot('ltx-video-2.5', { adultDuo: false }), 'ltx-video-2.5');
    // Clothed one-person clips keep the face on WAN unless the player keeps LTX for them.
    assert.equal(clipEngineForShot('ltx-video-2.5', { adultDuo: false, clothedSolo: true }), 'wan-video');
    assert.equal(
      clipEngineForShot('ltx-video-2.5', {
        adultDuo: false,
        clothedSolo: true,
        keepLtxForClothedSolo: true,
      }),
      'ltx-video-2.5'
    );
    assert.equal(clipEngineForShot('wan-video', { adultDuo: false, clothedSolo: true }), 'wan-video');
    assert.equal(clipEngineForShot('wan-video-rapid-aio', { adultDuo: true }), 'wan-video-rapid-aio');
  });
});
