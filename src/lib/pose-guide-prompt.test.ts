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
    assert.match(poseGuidePromptBlock('realistic'), /cyan\/orange = other adults/i);
    assert.match(poseGuidePromptBlock('realistic', { headcount: 1 }), /flesh-colored blob|pose-guide leak/i);
  });

  it('withPoseGuideEditPrompt is idempotent and adds realism lock', () => {
    const once = withPoseGuideEditPrompt('a pier scene', true, 'realistic');
    assert.match(once, /flat SCHEMATIC|never draw (?:stick figures|mannequins|black morphsuits)/i);
    assert.match(once, /photorealistic live-action photograph/i);
    assert.match(once, /Magenta schematic = Image 1 Cast/i);
    assert.match(once, /black morphsuit|solid opaque humans|no third black|Magenta schematic/i);
    assert.match(once, /discard Image 1 standing clothes|never keep a clothed Image 1 ghost/i);
    const twice = withPoseGuideEditPrompt(once, true, 'realistic');
    assert.equal(twice, once);
  });

  it('ensurePoseGuideStyleLock upgrades legacy short cues', () => {
    const legacy =
      'Edit the plate.\nImage 3 is a crude stick-figure pose wireframe on white — match body pose from Image 3 only; ignore Image 3 style, face, and clothing.';
    const next = ensurePoseGuideStyleLock(legacy, 'realistic');
    assert.match(next, /flat SCHEMATIC|never draw (?:stick figures|mannequins|black morphsuits)/i);
    assert.match(next, /photorealistic live-action photograph/i);
    assert.match(next, /Magenta schematic = Image 1 Cast/i);
    assert.equal(promptHasPoseGuideCue(next), true);
  });

  it('mergePoseGuideNegatives blocks mannequins, stick figures and fused bodies', () => {
    const merged = mergePoseGuideNegatives('blurry', true);
    assert.match(merged ?? '', /mannequin/i);
    assert.match(merged ?? '', /ball joints|sausage limbs/i);
    assert.match(merged ?? '', /stick figure/i);
    assert.match(merged ?? '', /wireframe/i);
    assert.match(merged ?? '', /merged bodies/i);
    assert.match(merged ?? '', /couple blob/i);
    assert.match(merged ?? '', /tattoo/i);
    assert.equal(mergePoseGuideNegatives('blurry', false), 'blurry');
  });

  it('applyQueuePromptSteering hardens pose-guide prompts for Qwen Lightning', () => {
    const positive =
      'Keep the face.\nImage 3 is a flat mannequin pose guide on white (simple filled limbs, no face or clothes) — use it ONLY for body pose.';
    const result = applyQueuePromptSteering({
      positive,
      model: 'qwen-image-edit-2511-lightning-8',
      realismMode: 'realistic',
    });
    assert.match(result.positive, /photorealistic live-action photograph|gray OUTLINE pose guide on white/i);
    assert.match(result.positive, /gray OUTLINE pose guide on white/i);
    assert.doesNotMatch(result.positive, /magenta schematic|filled limbs|dark charcoal/i);
    assert.match(result.negative ?? '', /mannequin|stick figure|magenta|neon capsule/i);
  });
});
