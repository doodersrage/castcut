import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensurePoseGuideStyleLock,
  mergePoseGuideNegatives,
  poseGuidePromptBlock,
  promptHasPoseGuideCue,
  withPoseGuideEditPrompt,
} from './pose-guide-prompt';
import { applyQueuePromptSteering } from './queue-prompt-prep';

describe('pose-guide-prompt', () => {
  it('locks photoreal by default and anime when specified', () => {
    assert.match(poseGuidePromptBlock('realistic'), /photorealistic live-action photograph/i);
    assert.match(poseGuidePromptBlock('anime'), /finished anime\/illustration scene/i);
    assert.match(poseGuidePromptBlock('off'), /finished rendered scene/i);
  });

  it('withPoseGuideEditPrompt is idempotent and adds realism lock', () => {
    const once = withPoseGuideEditPrompt('a pier scene', true, 'realistic');
    assert.match(once, /Image 3 is a crude stick-figure/i);
    assert.match(once, /photorealistic live-action photograph/i);
    assert.match(once, /fully separate people/i);
    const twice = withPoseGuideEditPrompt(once, true, 'realistic');
    assert.equal(twice, once);
  });

  it('ensurePoseGuideStyleLock upgrades legacy short cues', () => {
    const legacy =
      'Edit the plate.\nImage 3 is a crude stick-figure pose wireframe on white — match body pose from Image 3 only; ignore Image 3 style, face, and clothing.';
    const next = ensurePoseGuideStyleLock(legacy, 'realistic');
    assert.match(next, /never draw stick figures/i);
    assert.match(next, /photorealistic live-action photograph/i);
    assert.match(next, /fully separate people/i);
    assert.equal(promptHasPoseGuideCue(next), true);
  });

  it('mergePoseGuideNegatives blocks stick figures and fused bodies', () => {
    const merged = mergePoseGuideNegatives('blurry', true);
    assert.match(merged ?? '', /stick figure/i);
    assert.match(merged ?? '', /wireframe/i);
    assert.match(merged ?? '', /merged bodies/i);
    assert.match(merged ?? '', /couple blob/i);
    assert.equal(mergePoseGuideNegatives('blurry', false), 'blurry');
  });

  it('applyQueuePromptSteering hardens pose-guide prompts for Qwen Lightning', () => {
    const positive =
      'Keep the face.\nImage 3 is a crude stick-figure pose wireframe on white — use it ONLY for body pose.';
    const result = applyQueuePromptSteering({
      positive,
      model: 'qwen-image-edit-2511-lightning-8',
      realismMode: 'realistic',
    });
    assert.match(result.positive, /photorealistic live-action photograph/i);
    assert.match(result.negative ?? '', /stick figure/i);
  });
});
