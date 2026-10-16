import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildClipFinishGraph,
  CLIP_FINISH_SAVE_NODE,
  clipFinishPlan,
} from './clip-finish';
import { readClipStream } from './clip-finish-server';
import { isGpuMemoryError } from './heavy-graph-server';
import { buildLipSyncGraph, lipSyncFrames, lipSyncSegmentCount, lipSyncSize } from './lip-sync';
import { readDurationSeconds, readPictureSize } from './lip-sync-server';
import {
  buildMotionTransferGraph,
  MOTION_MAX_FRAMES,
  motionSegmentCount,
  motionTransferSize,
} from './motion-transfer';
import { buildRelightGraph, RELIGHT_LORA, relightPrompt, relightSize } from './relight';
import { pickRelightCheckpoint } from './relight-server';

type Node = { class_type: string; inputs: Record<string, unknown> };
const nodes = (graph: Record<string, unknown>) => Object.values(graph) as Node[];
const ofType = (graph: Record<string, unknown>, type: string) =>
  nodes(graph).filter(node => node.class_type === type);

describe('Finish clip', () => {
  it('upscales a WAN clip to 1280 on the long side and doubles its 16 fps', () => {
    assert.deepEqual(clipFinishPlan({ width: 672, height: 880, fps: 16.13 }), {
      scale: 1.455,
      multiplier: 2,
      width: 978,
      height: 1280,
      fps: 32,
    });
  });

  it('keeps a 24 fps clip at its rate and a full-size smooth clip is left alone', () => {
    assert.equal(clipFinishPlan({ width: 768, height: 1024, fps: 24 })?.multiplier, 1);
    assert.equal(clipFinishPlan({ width: 1080, height: 1920, fps: 30 }), null);
  });

  it('builds SeedVR2 then RIFE, passing the sound through', () => {
    const plan = clipFinishPlan({ width: 480, height: 832, fps: 16 })!;
    const graph = buildClipFinishGraph({ video: 'in.mp4', plan, seed: 1, prefix: 'x' });
    assert.equal(ofType(graph, 'SeedVR2Conditioning').length, 1);
    assert.equal(ofType(graph, 'FrameInterpolate')[0]?.inputs.multiplier, 2);
    const create = ofType(graph, 'CreateVideo')[0]!;
    assert.deepEqual(create.inputs.audio, ['2', 1]);
    assert.equal(create.inputs.fps, 32);
    assert.equal((graph[CLIP_FINISH_SAVE_NODE] as Node).class_type, 'SaveVideo');
  });

  it('reads the size and rate from ffmpeg', () => {
    assert.deepEqual(
      readClipStream(
        '  Stream #0:0: Video: h264 (High), yuv420p(progressive), 672x880, 16.13 fps, 16.13 tbr'
      ),
      { width: 672, height: 880, fps: 16.13 }
    );
  });
});

describe('Copy moves (Wan Animate 2)', () => {
  it('chains 81-frame segments that continue from each other, up to about 30 s', () => {
    assert.equal(motionSegmentCount(81), 1);
    assert.equal(motionSegmentCount(82), 2);
    assert.equal(motionSegmentCount(161), 2);
    assert.equal(motionSegmentCount(10_000), (MOTION_MAX_FRAMES - 1) / 80);
    const graph = buildMotionTransferGraph({
      reference: 'still.png',
      video: 'drive.mp4',
      prompt: 'p',
      motion: 'm',
      width: 464,
      height: 832,
      frames: 161,
      seed: 3,
      prefix: 'x',
    });
    const segments = ofType(graph, 'WanAnimate2ToVideo');
    assert.equal(segments.length, 2);
    assert.equal(segments[0]!.inputs.video_frame_offset, 0);
    assert.ok(Array.isArray(segments[1]!.inputs.video_frame_offset));
    assert.ok(segments[1]!.inputs.continue_motion);
    assert.equal(ofType(graph, 'BatchImagesNode').length, 1);
  });

  it('a short video renders only what it covers, cut to its length', () => {
    const graph = buildMotionTransferGraph({
      reference: 'still.png',
      video: 'drive.mp4',
      prompt: 'p',
      motion: 'm',
      width: 464,
      height: 832,
      frames: 32,
      seed: 3,
      prefix: 'x',
    });
    assert.equal(ofType(graph, 'WanAnimate2ToVideo')[0]?.inputs.length, 33);
    const cut = ofType(graph, 'ImageFromBatch').find(node => node.inputs.batch_index === 0 && node.inputs.length === 32);
    assert.ok(cut);
  });

  it('sizes the output from the driving video near 480p in multiples of 16', () => {
    assert.deepEqual(motionTransferSize(720, 1280), { width: 464, height: 832 });
  });
});

describe('Lip-sync (InfiniteTalk)', () => {
  it('covers the recording at 25 fps and cuts the picture to its length', () => {
    assert.equal(lipSyncFrames(5.17), 130);
    assert.equal(lipSyncSegmentCount(3), 1);
    assert.equal(lipSyncSegmentCount(5.17), 2);
    assert.equal(lipSyncSegmentCount(120), lipSyncSegmentCount(30));
    const graph = buildLipSyncGraph({
      image: 'still.png',
      audio: 'voice.wav',
      prompt: 'talking',
      ...lipSyncSize(1104, 1472),
      seconds: 5.17,
      seed: 1,
      prefix: 'x',
    });
    assert.equal(ofType(graph, 'WanInfiniteTalkToVideo').length, 2);
    const cut = ofType(graph, 'ImageFromBatch').find(node => node.inputs.batch_index === 0);
    assert.equal(cut?.inputs.length, 130);
  });

  it('reads durations and picture sizes from ffmpeg', () => {
    assert.equal(readDurationSeconds('  Duration: 00:00:07.48, start: 0'), 7.48);
    assert.deepEqual(readPictureSize('  Stream #0:0: Video: png, rgb24(pc), 1104x1472, 25 tbr'), {
      width: 1104,
      height: 1472,
    });
  });
});

describe('Relight', () => {
  it('uses the trigger word and keeps everything but the light', () => {
    const prompt = relightPrompt('golden');
    assert.match(prompt, /^重新照明, relight the image using low golden-hour sunlight/);
    assert.match(prompt, /only the light changes/);
    assert.match(relightPrompt('soft blue moonlight'), /using soft blue moonlight\./);
  });

  it('runs on a Rapid AIO checkpoint with the Relight LoRA, near 1 MP', () => {
    assert.equal(
      pickRelightCheckpoint(['x.safetensors', 'Qwen-Rapid-AIO-SFW-v23.safetensors', 'Qwen-Rapid-AIO-NSFW-v23.safetensors']),
      'Qwen-Rapid-AIO-NSFW-v23.safetensors'
    );
    assert.equal(pickRelightCheckpoint(['flux.safetensors']), null);
    const size = relightSize(960, 1280);
    assert.ok(Math.abs(size.width * size.height - 1024 * 1024) < 60_000);
    const graph = buildRelightGraph({
      checkpoint: 'c',
      image: 'i',
      prompt: 'p',
      ...size,
      seed: 1,
      prefix: 'x',
    });
    assert.equal(ofType(graph, 'LoraLoaderModelOnly')[0]?.inputs.lora_name, RELIGHT_LORA);
  });
});

describe('heavy jobs retry after freeing GPU memory', () => {
  it('knows ComfyUI allocation failures', () => {
    assert.equal(
      isGpuMemoryError(
        'copy-moves failed in ComfyUI — Allocation on device Requested : 323.98 MiB Device limit : 23.59 GiB'
      ),
      true
    );
    assert.equal(isGpuMemoryError('copy-moves failed in ComfyUI — missing node'), false);
  });
});
