import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_FAL_EXTEND_MODEL,
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_T2V_MODEL,
  DEFAULT_REPLICATE_I2V_MODEL,
  DEFAULT_REPLICATE_T2V_MODEL,
  FAL_EXTEND_MODEL_PRESETS,
  FAL_I2V_MODEL_PRESETS,
  FAL_MODEL_PRESETS,
  FAL_T2V_MODEL_PRESETS,
  REPLICATE_I2V_MODEL_PRESETS,
  REPLICATE_T2V_MODEL_PRESETS,
} from './engine/capabilities';
import {
  canFalExtendFromParentUrl,
  cloudContinueUsesLastFrameI2v,
  cloudNativeExtendEngines,
  continueClipActionLabel,
  continueClipPathRanMessage,
  engineCanQueueClips,
  falExtendQueueFields,
  falVideoDurationPayload,
  falVideoRequiresFirstFrame,
  falVideoRequiresParentClip,
  inferVideoClipMode,
  normalizeVideoClipMode,
  replicateUsesLastFrameI2v,
  replicateVideoDurationPayload,
  resolveFalVideoModel,
  resolveReplicateVideoModel,
  resolveVideoContinuePath,
  snapFalVideoDurationSec,
} from './video-clip-mode';

describe('video clip mode', () => {
  it('normalizes aliases and defaults to T2V', () => {
    assert.equal(normalizeVideoClipMode('I2V'), 'i2v');
    assert.equal(normalizeVideoClipMode('image-to-video'), 'i2v');
    assert.equal(normalizeVideoClipMode('extend'), 'extend');
    assert.equal(normalizeVideoClipMode('continue'), 'i2v');
    assert.equal(normalizeVideoClipMode('t2v'), 't2v');
    assert.equal(normalizeVideoClipMode(''), 't2v');
  });

  it('infers I2V from a first frame only when mode is unset', () => {
    assert.equal(inferVideoClipMode({ hasInitImage: true }), 'i2v');
    assert.equal(inferVideoClipMode({ hasInitImage: false }), 't2v');
    assert.equal(inferVideoClipMode({ clipMode: 't2v', hasInitImage: true }), 't2v');
    assert.equal(inferVideoClipMode({ clipMode: 'extend', hasInitImage: false }), 'extend');
  });

  it('picks Fal T2V vs I2V model ids', () => {
    assert.equal(
      resolveFalVideoModel({ clipMode: 'i2v' }),
      DEFAULT_FAL_I2V_MODEL
    );
    assert.equal(
      resolveFalVideoModel({ clipMode: 't2v' }),
      DEFAULT_FAL_T2V_MODEL
    );
    assert.equal(
      resolveFalVideoModel({
        clipMode: 't2v',
        t2vModel: 'fal-ai/wan/v2.7/text-to-video',
      }),
      'fal-ai/wan/v2.7/text-to-video'
    );
    assert.equal(falVideoRequiresFirstFrame('i2v'), true);
    assert.equal(falVideoRequiresFirstFrame('t2v'), false);
    assert.equal(falVideoRequiresFirstFrame('extend'), false);
    assert.equal(falVideoRequiresParentClip('extend'), true);
    assert.equal(
      resolveFalVideoModel({ clipMode: 'extend' }),
      DEFAULT_FAL_EXTEND_MODEL
    );
    assert.equal(
      canFalExtendFromParentUrl('https://v3b.fal.media/files/clip.mp4'),
      true
    );
    assert.equal(canFalExtendFromParentUrl('/api/comfyui/view?filename=clip.mp4'), false);
  });

  it('picks Replicate T2V vs I2V model ids', () => {
    assert.equal(
      resolveReplicateVideoModel({ clipMode: 'i2v' }),
      DEFAULT_REPLICATE_I2V_MODEL
    );
    assert.equal(
      resolveReplicateVideoModel({ clipMode: 't2v' }),
      DEFAULT_REPLICATE_T2V_MODEL
    );
    assert.equal(
      resolveReplicateVideoModel({
        clipMode: 't2v',
        t2vModel: 'wan-video/wan-2.2-t2v-fast',
      }),
      'wan-video/wan-2.2-t2v-fast'
    );
  });

  it('snaps Fal clip length to 5s or 10s', () => {
    assert.equal(snapFalVideoDurationSec(undefined), 5);
    assert.equal(snapFalVideoDurationSec(4), 5);
    assert.equal(snapFalVideoDurationSec(7.9), 5);
    assert.equal(snapFalVideoDurationSec(8), 10);
    assert.equal(snapFalVideoDurationSec(16), 10);
  });

  it('shapes Fal duration for Kling, LTX, Grok, and Veo', () => {
    assert.equal(falVideoDurationPayload('fal-ai/kling-video/v3/standard/image-to-video', 5), '5');
    assert.equal(falVideoDurationPayload('fal-ai/kling-video/v3/standard/image-to-video', 10), '10');
    assert.equal(falVideoDurationPayload('fal-ai/ltx-2.3/image-to-video', 5), 6);
    assert.equal(falVideoDurationPayload('fal-ai/ltx-2.3/text-to-video', 10), 10);
    assert.equal(falVideoDurationPayload('xai/grok-imagine-video/v1.5/image-to-video', 5), 6);
    assert.equal(falVideoDurationPayload('fal-ai/veo3.1/image-to-video', 5), '6s');
    assert.equal(falVideoDurationPayload('fal-ai/veo3.1', 10), '8s');
    assert.equal(falVideoDurationPayload('fal-ai/ltx-2.3/extend-video', 5), 5);
    assert.equal(falVideoDurationPayload('fal-ai/ltx-2.3/extend-video', 10), 10);
  });

  it('lists documented Fal LTX, Seedance, Grok Imagine, and Veo clip presets', () => {
    const i2v = FAL_I2V_MODEL_PRESETS.map(preset => preset.id);
    const t2v = FAL_T2V_MODEL_PRESETS.map(preset => preset.id);
    assert.ok(i2v.includes('fal-ai/ltx-2.3/image-to-video'));
    assert.ok(t2v.includes('fal-ai/ltx-2.3/text-to-video'));
    assert.ok(i2v.includes('bytedance/seedance-2.0/image-to-video'));
    assert.ok(t2v.includes('bytedance/seedance-2.0/text-to-video'));
    assert.ok(i2v.includes('bytedance/seedance-2.5/image-to-video'));
    assert.ok(t2v.includes('bytedance/seedance-2.5/text-to-video'));
    assert.ok(i2v.includes('xai/grok-imagine-video/v1.5/image-to-video'));
    assert.ok(t2v.includes('xai/grok-imagine-video/v1.5/text-to-video'));
    assert.ok(i2v.includes('fal-ai/kling-video/o3/standard/image-to-video'));
    assert.ok(t2v.includes('fal-ai/kling-video/o3/standard/text-to-video'));
    assert.ok(i2v.includes('fal-ai/veo3.1/image-to-video'));
    assert.ok(t2v.includes('fal-ai/veo3.1'));
    assert.ok(FAL_EXTEND_MODEL_PRESETS.some(preset => preset.id === DEFAULT_FAL_EXTEND_MODEL));
    assert.ok(REPLICATE_I2V_MODEL_PRESETS.some(preset => preset.id === 'lightricks/ltx-2.3-fast'));
    assert.ok(REPLICATE_T2V_MODEL_PRESETS.some(preset => preset.id === 'lightricks/ltx-2.3-fast'));
    assert.ok(REPLICATE_I2V_MODEL_PRESETS.some(preset => preset.id === 'bytedance/seedance-2.0'));
    assert.ok(FAL_MODEL_PRESETS.some(preset => preset.id === 'fal-ai/flux-2/klein/9b'));
    assert.ok(FAL_MODEL_PRESETS.some(preset => preset.id === 'fal-ai/flux-2-pro'));
  });

  it('builds the documented Fal LTX extend-video payload', () => {
    assert.deepEqual(falExtendQueueFields('https://v3b.fal.media/files/clip.mp4', 5), {
      video_url: 'https://v3b.fal.media/files/clip.mp4',
      mode: 'end',
      duration: 5,
    });
    assert.equal(falExtendQueueFields('https://v3b.fal.media/files/clip.mp4', 10).duration, 10);
  });

  it('shapes Replicate LTX duration and maps extend to I2V', () => {
    assert.equal(replicateVideoDurationPayload('lightricks/ltx-2.3-fast', 5), 6);
    assert.equal(replicateVideoDurationPayload('lightricks/ltx-2.3-fast', 10), 10);
    assert.equal(replicateVideoDurationPayload('kwaivgi/kling-v3-video', 5), 5);
    assert.equal(
      resolveReplicateVideoModel({ clipMode: 'extend' }),
      DEFAULT_REPLICATE_I2V_MODEL
    );
  });

  it('labels Gallery continue as Extend / last-frame / Stitch', () => {
    assert.equal(
      continueClipActionLabel({
        engine: 'fal',
        parentUrl: 'https://v3b.fal.media/files/clip.mp4',
      }),
      'Extend clip'
    );
    assert.equal(
      continueClipActionLabel({
        engine: 'fal',
        parentUrl: '/api/comfyui/view?filename=clip.mp4',
      }),
      'Continue from last frame'
    );
    assert.equal(
      continueClipActionLabel({
        engine: 'replicate',
        parentUrl: 'https://v3b.fal.media/files/clip.mp4',
      }),
      'Continue from last frame'
    );
    assert.equal(
      continueClipActionLabel({
        engine: 'grok',
        parentUrl: '/api/comfyui/view?filename=clip.mp4',
      }),
      'Extend clip'
    );
    assert.equal(
      continueClipActionLabel({
        engine: 'gemini',
        parentUrl: '/api/comfyui/view?filename=clip.mp4',
      }),
      'Stitch continue'
    );
    assert.equal(
      continueClipActionLabel({
        engine: 'runway',
        parentUrl: '/api/comfyui/view?filename=clip.mp4',
      }),
      'Extend clip'
    );
    assert.equal(
      resolveVideoContinuePath({
        engine: 'gemini',
        parentUrl: 'https://example.com/a.mp4',
      }),
      'stitch'
    );
    assert.equal(
      resolveVideoContinuePath({
        engine: 'replicate',
        parentUrl: 'https://example.com/a.mp4',
      }),
      'last-frame'
    );
    assert.equal(
      resolveVideoContinuePath({
        engine: 'runway',
        parentUrl: 'https://example.com/a.mp4',
      }),
      'extend'
    );
    assert.equal(continueClipPathRanMessage('extend'), 'Queued with native Extend.');
    assert.equal(replicateUsesLastFrameI2v('extend'), true);
    assert.equal(cloudNativeExtendEngines('fal'), true);
    assert.equal(cloudNativeExtendEngines('grok'), true);
    assert.equal(cloudNativeExtendEngines('runway'), true);
    assert.equal(cloudNativeExtendEngines('replicate'), false);
    assert.equal(cloudContinueUsesLastFrameI2v('replicate', 'extend'), true);
    assert.equal(cloudContinueUsesLastFrameI2v('fal', 'extend'), false);
    assert.equal(cloudContinueUsesLastFrameI2v('runway', 'extend'), false);
  });

  it('allows only engines that actually queue clips', () => {
    assert.equal(engineCanQueueClips('fal'), true);
    assert.equal(engineCanQueueClips('replicate'), true);
    assert.equal(engineCanQueueClips('grok'), true);
    assert.equal(engineCanQueueClips('gemini'), true);
    assert.equal(engineCanQueueClips('runway'), true);
    assert.equal(engineCanQueueClips('luma'), true);
    assert.equal(engineCanQueueClips('openai'), false);
    assert.equal(engineCanQueueClips('comfyui'), false);
  });
});
