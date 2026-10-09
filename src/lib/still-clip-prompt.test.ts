import { RAPID_DUO_RECIPE_MARK } from './prompt-recipe-mark';
import assert from 'node:assert/strict';
import {
   describe, it } from 'node:test';

import {
  buildStillClipPrompt,
  isIntimateDuoStillPrompt,
  stillPromptPeople,
} from './still-clip-prompt';

describe('still clip prompt (clothed Day animate)', () => {
  it('animates the beat with a locked camera and the first frame kept', () => {
    const prompt = buildStillClipPrompt('checking a phone at golden hour, chin tilted to the screen');
    assert.match(prompt, /^4s clip, one continuous shot that starts on the first frame\./);
    assert.match(prompt, /Action: checking a phone at golden hour, chin tilted to the screen\./);
    assert.match(prompt, /locked-off static tripod shot — no camera movement, no zoom, no orbit/);
    assert.match(prompt, /place, light and clothes stay exactly as in the first frame/);
    assert.match(prompt, /no wide-open mouth/);
    assert.match(prompt, /she does not walk away/);
    assert.doesNotMatch(prompt, /dolly|glide|drift|pan/i);
  });

  it('names both people on a duo still', () => {
    const prompt = buildStillClipPrompt('high-fiving a friend', { people: 2 });
    assert.match(prompt, /both people continue this moment/);
    assert.match(prompt, /nobody walks away/);
    assert.match(prompt, /same two people/);
  });

  it('lands on the end pose words when given', () => {
    const prompt = buildStillClipPrompt('standing at the rail', {
      endPoseWords: 'she turns to face the camera, smiling.',
      durationSec: 5,
    });
    assert.match(prompt, /^5s clip/);
    assert.match(prompt, /By the end of the clip, she turns to face the camera, smiling\./);
  });

  it('drops still-prompt edit lines from the action', () => {
    const prompt = buildStillClipPrompt(
      'Image 3 is an OpenPose keypoint skeleton map. She waves at a friend.'
    );
    assert.doesNotMatch(prompt, /OpenPose|Image 3/);
    assert.match(prompt, /Action: She waves at a friend\./);
  });

  it('reads the head count from the still prompt', () => {
    assert.equal(
      stillPromptPeople('Day photo: A woman and a man together, both fully clothed, both fully in frame.'),
      2
    );
    assert.equal(stillPromptPeople('TWO PEOPLE in this photo: she and her friend'), 2);
    assert.equal(stillPromptPeople('Match their two bodies to the third image (pose map).'), 2);
    assert.equal(stillPromptPeople('Day photo: One woman alone. She kneels on the floor.'), 1);
    assert.equal(stillPromptPeople(undefined), 1);
  });
});

describe('isIntimateDuoStillPrompt', () => {
  it('is the Rapid duo recipe, or adult wording with two people — not clothed or solo stills', () => {
    assert.equal(isIntimateDuoStillPrompt(`${RAPID_DUO_RECIPE_MARK} Side view, missionary.`), true);
    assert.equal(
      isIntimateDuoStillPrompt('Explicit sex photo: both nude, the man and the woman on the bed.'),
      true
    );
    assert.equal(isIntimateDuoStillPrompt('Day photo: she walks her dog in the park.'), false);
    assert.equal(isIntimateDuoStillPrompt('Explicit solo photo: one woman alone, nude on the bed.'), false);
    assert.equal(isIntimateDuoStillPrompt(''), false);
  });
});
