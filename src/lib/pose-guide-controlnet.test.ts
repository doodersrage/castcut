import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isMannequinUnsafeControlNet,
  mergePoseGuideControlNetParams,
  resolvePoseGuideControlNetExtras,
} from './pose-guide-controlnet';

describe('pose-guide-controlnet', () => {
  it('never attaches ControlNet for filled mannequin pose guides', () => {
    assert.equal(
      resolvePoseGuideControlNetExtras({
        poseGuideFilename: 'pose.png',
        poseGuideUrl: 'https://example.com/pose.png',
        model: 'flux-dev',
        controlNetMap: {
          'flux-dev': 'flux-controlnet-pose.safetensors',
        },
      }),
      undefined
    );
    assert.equal(
      resolvePoseGuideControlNetExtras({
        poseGuideFilename: 'pose.png',
        model: 'qwen-image-edit-2511-lightning-8',
        controlNetMap: {
          'qwen-image-edit-2511-lightning-8': 'InstantX-Qwen-Image-ControlNet-Union.safetensors',
        },
        controlNetInventory: ['Qwen-Image-InstantX-ControlNet-Union.safetensors'],
      }),
      undefined
    );
  });

  it('returns undefined without a pose guide', () => {
    assert.equal(
      resolvePoseGuideControlNetExtras({
        model: 'qwen-image-edit-2511-lightning-8',
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
