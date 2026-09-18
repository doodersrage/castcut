import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  POSE_GUIDE_CONTROLNET_STRENGTH,
  isMannequinUnsafeControlNet,
  mergePoseGuideControlNetParams,
  resolvePoseGuideControlNetExtras,
} from './pose-guide-controlnet';

describe('pose-guide-controlnet', () => {
  it('returns undefined without a pose guide', () => {
    assert.equal(
      resolvePoseGuideControlNetExtras({
        model: 'qwen-image-edit-2511-lightning-8',
        controlNetMap: { default: 'openpose.pth' },
      }),
      undefined
    );
  });

  it('returns undefined when no ControlNet model is mapped', () => {
    assert.equal(
      resolvePoseGuideControlNetExtras({
        poseGuideFilename: 'pose.png',
        model: 'qwen-image-edit-2511-lightning-8',
        controlNetMap: {},
        controlNetInventory: ['Qwen-Image-InstantX-ControlNet-Union.safetensors'],
      }),
      undefined
    );
  });

  it('does not inventory-auto InstantX onto mannequin guides (leaks)', () => {
    const extras = resolvePoseGuideControlNetExtras({
      poseGuideFilename: 'pose.png',
      model: 'qwen-rapid-aio-nsfw',
      controlNetMap: {},
      controlNetInventory: [
        'control_v11p_sd15_openpose.pth',
        'Qwen-Image-InstantX-ControlNet-Union.safetensors',
      ],
    });
    assert.equal(extras, undefined);
  });

  it('skips InstantX even when explicitly mapped for mannequin guides', () => {
    assert.equal(isMannequinUnsafeControlNet('Qwen-Image-InstantX-ControlNet-Union.safetensors'), true);
    const extras = resolvePoseGuideControlNetExtras({
      poseGuideFilename: 'pose.png',
      model: 'qwen-image-edit-2511-lightning-8',
      controlNetMap: {
        'qwen-image-edit-2511-lightning-8': 'InstantX-Qwen-Image-ControlNet-Union.safetensors',
      },
    });
    assert.equal(extras, undefined);
  });

  it('attaches pose control extras when a safe CN weight is mapped', () => {
    const extras = resolvePoseGuideControlNetExtras({
      poseGuideFilename: 'pose.png',
      poseGuideUrl: 'https://example.com/pose.png',
      model: 'flux-dev',
      controlNetMap: {
        'flux-dev': 'flux-controlnet-pose.safetensors',
      },
    });
    assert.ok(extras);
    assert.equal(extras!.controlImageFilename, 'pose.png');
    assert.equal(extras!.controlImageUrl, 'https://example.com/pose.png');
    assert.deepEqual(extras!.queueParamsBase, {
      controlNetMode: 'pose',
      controlNetStrengths: [POSE_GUIDE_CONTROLNET_STRENGTH],
      controlNetSkipPreprocessor: true,
      controlNetModelFilename: 'flux-controlnet-pose.safetensors',
    });
  });

  it('falls back to the default ControlNet map entry when safe', () => {
    const extras = resolvePoseGuideControlNetExtras({
      poseGuideFilename: 'pose.png',
      model: 'some-model',
      controlNetMap: { default: 'default_pose.pth' },
    });
    assert.equal(extras?.queueParamsBase.controlNetModelFilename, 'default_pose.pth');
  });

  it('merges ControlNet params into an existing queue base', () => {
    const extras = resolvePoseGuideControlNetExtras({
      poseGuideFilename: 'pose.png',
      model: 'm',
      controlNetMap: { default: 'cnet.safetensors' },
    });
    const merged = mergePoseGuideControlNetParams(
      { ipAdapterStrength: 0.4, denoise: 0.95 },
      extras
    );
    assert.equal((merged as { ipAdapterStrength: number }).ipAdapterStrength, 0.4);
    assert.equal((merged as { controlNetMode: string }).controlNetMode, 'pose');
    assert.equal((merged as { controlNetSkipPreprocessor: boolean }).controlNetSkipPreprocessor, true);
  });
});
