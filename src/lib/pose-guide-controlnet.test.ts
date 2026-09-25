import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isMannequinUnsafeControlNet,
  mergePoseGuideControlNetParams,
  POSE_GUIDE_CONTROLNET_STRENGTH,
  resolvePoseGuideControlNetExtras,
} from './pose-guide-controlnet';

describe('pose-guide-controlnet', () => {
  it('stays off unless switched on, and never for the filled mannequin', () => {
    const input = {
      poseGuideFilename: 'pose.png',
      poseGuideUrl: 'https://example.com/pose.png',
      model: 'flux-dev',
      controlNetMap: { 'flux-dev': 'flux-controlnet-pose.safetensors' },
    };
    // Off by default.
    assert.equal(resolvePoseGuideControlNetExtras({ ...input, style: 'openpose' }), undefined);
    // On, but a legacy mannequin guide is not a pose map.
    assert.equal(
      resolvePoseGuideControlNetExtras({ ...input, style: 'legacy', enabled: true }),
      undefined
    );
    assert.equal(resolvePoseGuideControlNetExtras({ ...input, enabled: true }), undefined);
  });

  it('sends an OpenPose guide through the mapped ControlNet at a soft strength', () => {
    const extras = resolvePoseGuideControlNetExtras({
      poseGuideFilename: 'pose.png',
      poseGuideUrl: 'https://example.com/pose.png',
      model: 'qwen-image-edit-2511-lightning-8',
      style: 'openpose',
      enabled: true,
      controlNetMap: {
        'qwen-image-edit-2511-lightning-8': 'InstantX-Qwen-Image-ControlNet-Union.safetensors',
      },
    });
    assert.deepEqual(extras, {
      controlImageFilename: 'pose.png',
      controlImageUrl: 'https://example.com/pose.png',
      queueParamsBase: {
        controlNetMode: 'pose',
        controlNetStrengths: [POSE_GUIDE_CONTROLNET_STRENGTH],
        controlNetSkipPreprocessor: true,
        controlNetModelFilename: 'InstantX-Qwen-Image-ControlNet-Union.safetensors',
      },
    });
    assert.deepEqual(mergePoseGuideControlNetParams({ denoise: 0.9 }, extras), {
      denoise: 0.9,
      ...extras!.queueParamsBase,
    });
  });

  it('needs a ControlNet mapped for the model', () => {
    assert.equal(
      resolvePoseGuideControlNetExtras({
        poseGuideFilename: 'pose.png',
        model: 'qwen-image-edit-2511-lightning-8',
        style: 'openpose-hands',
        enabled: true,
        controlNetMap: {},
      }),
      undefined
    );
  });

  it('returns undefined without a pose guide', () => {
    assert.equal(
      resolvePoseGuideControlNetExtras({
        model: 'qwen-image-edit-2511-lightning-8',
        style: 'openpose',
        enabled: true,
        controlNetMap: { default: 'openpose.pth' },
      }),
      undefined
    );
  });

  it('flags InstantX / Qwen Union as mannequin-unsafe', () => {
    assert.equal(isMannequinUnsafeControlNet('Qwen-Image-InstantX-ControlNet-Union.safetensors'), true);
    assert.equal(isMannequinUnsafeControlNet('flux-controlnet-pose.safetensors'), false);
  });

  it('merge is a no-op when extras are undefined', () => {
    const base = { ipAdapterStrength: 0.4, denoise: 0.95 };
    assert.deepEqual(mergePoseGuideControlNetParams(base, undefined), base);
  });
});
