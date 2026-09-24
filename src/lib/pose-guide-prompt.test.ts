import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensurePoseGuideStyleLock,
  mergePoseGuideNegatives,
  POSE_GUIDE_NEGATIVE_EXTRA,
  poseGuideOpenPoseMultiLock,
  poseGuidePromptBlock,
  promptHasOpenPoseGuideCue,
  promptHasPoseGuideCue,
  withPoseGuideEditPrompt,
} from './pose-guide-prompt';
import { applyQueuePromptSteering } from './queue-prompt-prep';

describe('pose-guide-prompt', () => {
  it('locks photoreal by default and anime when specified', () => {
    assert.match(poseGuidePromptBlock('realistic'), /photorealistic live-action photograph/i);
    assert.match(poseGuidePromptBlock('anime'), /finished anime\/illustration scene/i);
    assert.match(poseGuidePromptBlock('off'), /finished rendered scene/i);
    assert.match(
      poseGuidePromptBlock('realistic', { style: 'legacy' }),
      /cyan\/orange = other adults/i
    );
    assert.match(
      poseGuidePromptBlock('realistic', { headcount: 1, style: 'legacy' }),
      /flesh-colored blob|pose-guide leak/i
    );
  });

  it('defaults to the OpenPose cue with position-based lead mapping', () => {
    const solo = poseGuidePromptBlock('realistic', { headcount: 1 });
    assert.match(solo, /Image 3 is an OpenPose keypoint/i);
    assert.match(solo, /one skeleton/i);
    assert.doesNotMatch(solo, /magenta|cyan|capsule|morphsuit/i);
    const duo = poseGuidePromptBlock('realistic', {
      headcount: 2,
      leadPosition: 'lower (underneath)',
    });
    assert.match(duo, /the lower \(underneath\) skeleton is the Image 1 person/i);
    assert.match(duo, /Exactly two separate people/i);
    assert.match(poseGuideOpenPoseMultiLock(3, null), /three skeletons: one skeleton is the Image 1/i);
    // Text-only still wins when Image 3 is not attached.
    assert.match(
      poseGuidePromptBlock('realistic', { imageAttached: false, headcount: 1 }),
      /Match the beat body pose/i
    );
  });

  it('withPoseGuideEditPrompt is idempotent and adds realism lock', () => {
    const once = withPoseGuideEditPrompt('a pier scene', true, 'realistic', { style: 'legacy' });
    assert.match(once, /flat SCHEMATIC|never draw (?:stick figures|mannequins|black morphsuits)/i);
    assert.match(once, /photorealistic live-action photograph/i);
    assert.match(once, /Magenta schematic = Image 1 Cast/i);
    assert.match(once, /black morphsuit|solid opaque humans|no third black|Magenta schematic/i);
    assert.match(once, /discard Image 1 standing clothes|never keep a clothed Image 1 ghost/i);
    const twice = withPoseGuideEditPrompt(once, true, 'realistic', { style: 'legacy' });
    assert.equal(twice, once);
  });

  it('OpenPose edit prompt replaces legacy cues and is idempotent', () => {
    const legacy = withPoseGuideEditPrompt('a pier scene', true, 'realistic', { style: 'legacy' });
    const options = { style: 'openpose' as const, headcount: 2, leadPosition: 'leftmost' };
    const once = withPoseGuideEditPrompt(legacy, true, 'realistic', options);
    assert.equal(promptHasOpenPoseGuideCue(once), true);
    assert.doesNotMatch(once, /Magenta schematic|flat SCHEMATIC|cyan\/orange/i);
    assert.match(once, /the leftmost skeleton is the Image 1 person/i);
    assert.match(once, /photorealistic live-action photograph/i);
    assert.equal(withPoseGuideEditPrompt(once, true, 'realistic', options), once);
    // Requeue without guide metadata keeps the existing lead mapping.
    assert.equal(withPoseGuideEditPrompt(once, true, 'realistic', { style: 'openpose' }), once);
    // Switching back to legacy art drops the keypoint cue.
    const back = withPoseGuideEditPrompt(once, true, 'realistic', { style: 'legacy' });
    assert.equal(promptHasOpenPoseGuideCue(back), false);
    assert.match(back, /Magenta schematic = Image 1 Cast/i);
  });

  it('ensurePoseGuideStyleLock never appends color locks to an OpenPose prompt', () => {
    const prompt = `Edit the plate.\n${poseGuidePromptBlock('off', { headcount: 1 })}`;
    const next = ensurePoseGuideStyleLock(prompt, 'realistic');
    assert.match(next, /photorealistic live-action photograph/i);
    assert.doesNotMatch(next, /Magenta schematic|cyan\/orange/i);
    assert.equal(ensurePoseGuideStyleLock(next, 'realistic'), next);
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
    const merged = mergePoseGuideNegatives('blurry', true, { style: 'legacy' });
    assert.match(merged ?? '', /mannequin/i);
    assert.match(merged ?? '', /ball joints|sausage limbs/i);
    assert.match(merged ?? '', /stick figure/i);
    assert.match(merged ?? '', /wireframe/i);
    assert.match(merged ?? '', /merged bodies/i);
    assert.match(merged ?? '', /couple blob/i);
    assert.match(merged ?? '', /tattoo/i);
    assert.equal(mergePoseGuideNegatives('blurry', false), 'blurry');
  });

  it('keeps OpenPose negatives short', () => {
    const merged = mergePoseGuideNegatives('blurry', true, { style: 'openpose' }) ?? '';
    assert.match(merged, /^blurry, /);
    assert.match(merged, /keypoint dots/i);
    assert.doesNotMatch(merged, /dog in archive|piano|thigh-high boots/i);
    assert.ok(merged.length < POSE_GUIDE_NEGATIVE_EXTRA.length / 5);
  });

  it('applyQueuePromptSteering leaves OpenPose cues alone on Rapid AIO and Lightning', () => {
    const positive = `A woman on a balcony.\n${poseGuidePromptBlock('realistic', { headcount: 1 })}`;
    for (const model of ['qwen-rapid-aio-edit-nsfw', 'qwen-image-edit-2511-lightning-8']) {
      const result = applyQueuePromptSteering({
        positive,
        negative: 'blurry',
        model,
        realismMode: 'realistic',
        tool: 'day',
      });
      assert.match(result.positive, /Image 3 is an OpenPose keypoint/i, model);
      assert.doesNotMatch(result.positive, /gray OUTLINE|magenta|cyan/i, model);
    }
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
