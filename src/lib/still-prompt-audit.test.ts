import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditStillPrompt, highestImageReference, stillPromptIssuesLine } from './still-prompt-audit';

const codes = (prompt: string, context?: Parameters<typeof auditStillPrompt>[1]) =>
  auditStillPrompt(prompt, context).map(issue => issue.code);

describe('auditStillPrompt', () => {
  it('a one-person still that describes two people (she danced with a copy of herself)', () => {
    const prompt =
      'Edit Image 1: Day photo: One woman alone. She dances. Moment: dancing under club lights. Pose: the two people face each other, one hand joined and held out. Place: nightclub.';
    assert.deepEqual(codes(prompt), ['solo-mentions-two']);
    // The planner's count is enough when the text does not say "alone".
    assert.deepEqual(codes('She dances. Pose: the two people face each other.', { people: 1 }), [
      'solo-mentions-two',
    ]);
    // A guard sentence is not a contradiction; nor is a two-person still.
    assert.deepEqual(codes('One woman alone. Never show the two people from the poster.'), []);
    assert.deepEqual(
      codes('TWO PEOPLE in this photo: she and her partner. The two people face each other.'),
      []
    );
  });

  it('a two-person still that also says she is alone', () => {
    assert.deepEqual(
      codes('TWO PEOPLE in this photo: she and her partner hug. Day photo: One woman alone.'),
      ['duo-says-alone']
    );
  });

  it('an image the prompt refers to is not attached', () => {
    const prompt = 'Keep her face from the first image. Match her body to the third image (pose map).';
    assert.equal(highestImageReference(prompt), 3);
    assert.deepEqual(codes(prompt, { imageCount: 2 }), ['image-not-attached']);
    assert.deepEqual(codes(prompt, { imageCount: 3 }), []);
    // Unknown attachment count: the rule is skipped.
    assert.deepEqual(codes(prompt), []);
  });

  it('shoes ordered on a barefoot or swimming scene', () => {
    const shoes =
      'FOOTWEAR (mandatory): on her feet she wears gold stiletto heels — exactly these, on both feet.';
    assert.deepEqual(codes(`${shoes}\nMoment: walking barefoot on wet sand.`), [
      'shoes-on-barefoot',
    ]);
    assert.deepEqual(codes(`${shoes}\nMoment: swimming freestyle in the resort pool.`), [
      'shoes-in-water',
    ]);
    // A barefoot footwear line is consistent with a barefoot beat; a kayak or pool-side lounge
    // is not a swimming scene.
    assert.deepEqual(
      codes('FOOTWEAR (mandatory): she is barefoot.\nMoment: walking barefoot on wet sand.'),
      []
    );
    assert.deepEqual(codes(`${shoes}\nMoment: paddling a kayak, harbor water flashing.`), []);
    assert.deepEqual(codes(`${shoes}\nMoment: on a pool lounge facing underwater lights.`), []);
  });

  it('places and counts that only sound like a contradiction', () => {
    const shoes = 'FOOTWEAR (mandatory): on her feet she wears white sneakers — exactly these.';
    assert.deepEqual(codes(`${shoes}\nMoment: reading on a lounger beside the swimming pool.`), []);
    assert.deepEqual(codes(`${shoes}\nMoment: she swims a length of the pool.`), ['shoes-in-water']);
    // The planner's count wins over wording.
    assert.deepEqual(
      codes('Vacation photo: One woman alone. Moment: SEATED at a beach bar with a couple of cocktails.', {
        people: 1,
      }),
      []
    );
    assert.deepEqual(
      codes('Day photo: One woman alone. Moment: waving to a friend, with her partner off-frame.', {
        people: 1,
      }),
      []
    );
    // A heading followed by its text on the next line is not an empty slot.
    assert.deepEqual(codes('SCENE:\nthe harbour at dusk.'), []);
  });

  it('repeated lines, two outfit sources, placeholders and empty slots', () => {
    assert.deepEqual(codes('Pose: seated. Moment: reading. Pose: standing.'), ['repeated-line']);
    assert.deepEqual(
      codes('She wears the outfit from the first image. She wears the outfit from the second image.'),
      ['outfit-two-sources']
    );
    assert.deepEqual(codes('Place: {{location}}.'), ['template-leftover']);
    assert.deepEqual(codes('Moment: reading. Place: .'), ['empty-slot']);
  });

  it('a clean prompt has no issues, and the notice line names the still', () => {
    const clean =
      'Edit Image 1: Vacation photo: One woman alone on vacation. She walks mid-step. She wears the outfit from the second image. Moment: walking the promenade. Place: harbour. Keep her face from the first image. Match her body to the third image (pose map).';
    assert.deepEqual(auditStillPrompt(clean, { people: 1, imageCount: 3 }), []);
    assert.equal(stillPromptIssuesLine([]), '');
    assert.match(
      stillPromptIssuesLine(auditStillPrompt('One woman alone. The two people hug.'), 'evening'),
      /^Prompt check \(evening\): A one-person still describes two people/
    );
  });
});
