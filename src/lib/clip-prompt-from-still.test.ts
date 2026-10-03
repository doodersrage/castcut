import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stripStillPromptForClip } from './clip-prompt-from-still';
import {
  POSE_GUIDE_OPENPOSE_EDIT_PROMPT_LINE,
  POSE_GUIDE_OPENPOSE_SOLO_LOCK,
} from './pose-guide-prompt';
import { buildVideoPrompt } from './video-prompt';

/** The Motion text a queued clip carried live (2026-10-03): the still's whole edit prompt. */
const STILL_PROMPT = [
  'OUTFIT (mandatory): she wears exactly the outfit and the shoes she has on in Image 1 — unchanged, fully dressed.',
  'new environment not from the reference photo, replace the reference clothing with the beat outfit, a woman in her forties with straight black hair, Nora changes clothes after a door appears — new silhouette.',
  POSE_GUIDE_OPENPOSE_EDIT_PROMPT_LINE,
  'Final still must be a photorealistic live-action photograph — not a redraw of the Image 3 mannequin or a pose-diagram overlay.',
  POSE_GUIDE_OPENPOSE_SOLO_LOCK,
].join('\n');

describe('clip prompt from a still prompt', () => {
  it('drops the pose map and image-number lines, keeps the scene', () => {
    const stripped = stripStillPromptForClip(STILL_PROMPT);
    assert.doesNotMatch(stripped, /Image\s*\d|OpenPose|skeleton|keypoint|reference/i);
    assert.equal(
      stripped,
      'a woman in her forties with straight black hair, Nora changes clothes after a door appears — new silhouette. Exactly one person in the still.'
    );
  });

  it('keeps plain motion text as is', () => {
    const motion = 'She stretches by the window, then sips her coffee. Camera holds.';
    assert.equal(stripStillPromptForClip(motion), motion);
    assert.equal(stripStillPromptForClip(undefined), '');
  });

  it('the template clip prompt never carries the still’s pose map', () => {
    const prompt = buildVideoPrompt({
      subject: 'Wardrobe change',
      motion: STILL_PROMPT,
      model: 'wan-video',
      durationSec: 4,
    });
    assert.doesNotMatch(prompt, /Image 3|OpenPose|skeleton/i);
    assert.match(prompt, /Motion: a woman in her forties/);
  });
});
