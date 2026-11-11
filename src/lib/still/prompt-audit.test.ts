import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  auditStillPrompt,
  highestImageReference,
  normalizeStillPromptCheck,
  promptCheckSummary,
  repairStillPrompt,
  stillPromptCheckRecord,
  stillPromptIssuesLine,
} from './prompt-audit';

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

describe('repairStillPrompt', () => {
  it('drops the shoe line on a barefoot or swimming scene', () => {
    const prompt =
      'Edit Image 1: SCENE: the shoreline.\nFOOTWEAR (mandatory): on her feet she wears gold heels — exactly these, on both feet.\nVacation photo: One woman alone on vacation. She wears the outfit and the shoes shown in the second image (the same person, dressed, standing). Moment: walking barefoot on wet sand.';
    const result = repairStillPrompt(prompt, { people: 1 });
    assert.deepEqual(result.repaired.map(issue => issue.code), ['shoes-on-barefoot']);
    assert.deepEqual(result.remaining, []);
    assert.doesNotMatch(result.prompt, /FOOTWEAR|gold heels|and the shoes/);
    assert.match(result.prompt, /the outfit shown in the second image/);
    assert.match(result.prompt, /Moment: walking barefoot on wet sand\./);
  });

  it('removes "one woman alone" from a two-person still', () => {
    const prompt =
      'TWO PEOPLE in this photo: she and her partner hug.\nvacation travel still, clothes stay on, one woman alone, same face and hair as Image 1.';
    const result = repairStillPrompt(prompt, { people: 2 });
    assert.deepEqual(result.remaining, []);
    assert.match(result.prompt, /clothes stay on, same face and hair/);
  });

  it('keeps the first of a repeated line', () => {
    const prompt = 'SCENE: the harbour.\nOUTFIT (mandatory): a red dress.\nSCENE: the harbour at dusk.\nMoment: waiting.';
    const result = repairStillPrompt(prompt);
    assert.deepEqual(result.remaining, []);
    assert.equal(result.prompt.match(/SCENE:/g)?.length, 1);
    assert.match(result.prompt, /SCENE: the harbour\.\n/);
  });

  it('leaves what it cannot repair for the notice, and a clean prompt untouched', () => {
    const solo = 'Day photo: One woman alone. Pose: the two people face each other.';
    const result = repairStillPrompt(solo);
    assert.equal(result.prompt, solo);
    assert.deepEqual(result.remaining.map(issue => issue.code), ['solo-mentions-two']);
    const clean = 'Day photo: One woman alone. Moment: reading on the sofa.';
    assert.deepEqual(repairStillPrompt(clean), { prompt: clean, repaired: [], remaining: [] });
  });
});

describe('a dressed plate on a barefoot scene', () => {
  it("drops the plate's shoes, keeps its outfit", () => {
    const prompt =
      'Edit Image 1: OUTFIT (mandatory): she wears exactly the outfit and the shoes she has on in Image 1 — unchanged, fully dressed.\n' +
      'Replace the scene with her on mossy stones at dawn, the stones cool beneath her bare feet.';
    assert.deepEqual(
      auditStillPrompt(prompt, { people: 1 }).map(issue => issue.code),
      ['shoes-on-barefoot']
    );
    const fixed = repairStillPrompt(prompt, { people: 1 });
    assert.match(fixed.prompt, /exactly the outfit she has on in Image 1 — unchanged/);
    assert.doesNotMatch(fixed.prompt, /shoes/);
    assert.deepEqual(fixed.remaining, []);
  });

  it('leaves a shod scene alone', () => {
    const prompt =
      'Edit Image 1: OUTFIT (mandatory): she wears exactly the outfit and the shoes she has on in Image 1 — unchanged, fully dressed.\n' +
      'Replace the scene with her walking through the market with a coffee.';
    assert.deepEqual(auditStillPrompt(prompt, { people: 1 }), []);
  });
});

describe('the prompt check kept on the card', () => {
  it('records the messages of what was fixed and what is left', () => {
    const prompt =
      'Edit Image 1: OUTFIT (mandatory): she wears exactly the outfit and the shoes she has on in Image 1 — unchanged.\n' +
      'Pose: the two people face each other on the sand, barefoot.';
    const check = stillPromptCheckRecord(repairStillPrompt(prompt, { people: 1 }));
    assert.deepEqual(check, {
      repaired: ['Shoes are ordered on a barefoot scene.'],
      remaining: ['A one-person still describes two people — it may render her twice.'],
    });
    assert.deepEqual(promptCheckSummary(check), {
      label: 'Prompt check: 1 problem, fixed 1',
      tone: 'warning',
    });
  });

  it('nothing to say on a clean prompt', () => {
    const clean = repairStillPrompt('Day photo: One woman alone. Moment: reading on the sofa.');
    assert.equal(stillPromptCheckRecord(clean), undefined);
    assert.equal(promptCheckSummary(undefined), null);
    assert.equal(promptCheckSummary({ repaired: [], remaining: [] }), null);
  });

  it('a fix alone is quiet; counts are plural', () => {
    assert.deepEqual(promptCheckSummary({ repaired: ['a', 'b'], remaining: [] }), {
      label: 'Prompt check: fixed 2',
      tone: 'muted',
    });
    assert.equal(
      promptCheckSummary({ repaired: [], remaining: ['a', 'b'] })?.label,
      'Prompt check: 2 problems'
    );
  });

  it('tidies a stored record and drops junk', () => {
    assert.equal(normalizeStillPromptCheck(null), undefined);
    assert.equal(normalizeStillPromptCheck('fixed'), undefined);
    assert.equal(normalizeStillPromptCheck({ repaired: [' ', 3], remaining: 'x' }), undefined);
    assert.deepEqual(
      normalizeStillPromptCheck({ repaired: [' Fixed it. ', null], remaining: undefined }),
      { repaired: ['Fixed it.'], remaining: [] }
    );
    const long = normalizeStillPromptCheck({ remaining: Array(20).fill('x'.repeat(500)) });
    assert.equal(long?.remaining.length, 8);
    assert.equal(long?.remaining[0]?.length, 200);
  });
});

describe('a close or medium shot orders no shoes or legs (2026-11-11 live run)', () => {
  const prompt = [
    'Edit Image 1: POSE FIRST: the two people — Slyne stirs her coffee, exactly as the pose map in Image 2 shows.',
    'OUTFIT (mandatory): she wears an oversized forest green slip dress.',
    'FOOTWEAR (mandatory): on her own feet (the person from the first image) she wears strappy heeled sandals — exactly these, on both feet; the other person wears dark brown leather shoes — never the same pair.',
    'Day photo: A woman and a man together. Camera: head-and-shoulders close-up.',
    'QUALITY FIX: Match the Image 3 skeleton exactly — torso angle, both arms and both legs; do not keep the Image 1 standing pose.',
  ].join('\n');

  it('drops them from a head or waist shot, and keeps the rest', () => {
    const out = repairStillPrompt(prompt, { framing: 'head' });
    assert.doesNotMatch(out.prompt, /FOOTWEAR|both legs/);
    assert.match(out.prompt, /torso angle and both arms;/);
    assert.match(out.prompt, /OUTFIT \(mandatory\)/);
    assert.deepEqual(out.repaired.map(issue => issue.code), ['feet-out-of-frame']);
    assert.doesNotMatch(repairStillPrompt(prompt, { framing: 'waist' }).prompt, /FOOTWEAR/);
  });

  it('leaves a wide shot, or a still with no framing, as it was', () => {
    assert.equal(repairStillPrompt(prompt, { framing: 'full' }).prompt, prompt);
    assert.equal(repairStillPrompt(prompt, { framing: 'knees' }).prompt, prompt);
    assert.equal(repairStillPrompt(prompt).prompt, prompt);
  });
});

describe('a spoken line is heard, never drawn (2026-11-11 live run)', () => {
  // The bookshop shot 2F's prompt: the model painted the line as a sign behind her.
  const prompt = [
    'Edit Image 1: POSE FIRST: she is She moves on, stopping at the art section this time, exactly as the pose map in Image 2 shows.',
    'Day photo: One woman alone. Camera: head-and-shoulders close-up. Moment: She moves on, stopping at the art section this time. Lou says: “I thought we were just grabbing lunch?” Lou is heard, not seen. Lou, amused. Place: cozy bookshop.',
  ].join('\n');

  it('takes the words out and keeps who speaks', () => {
    const out = repairStillPrompt(prompt);
    assert.doesNotMatch(out.prompt, /grabbing lunch|“/);
    assert.match(out.prompt, /this time\. Lou speaks\. Lou is heard, not seen\. Lou, amused\./);
    assert.deepEqual(out.repaired.map(issue => issue.code), ['spoken-words']);
    assert.deepEqual(out.remaining, []);
  });

  it('leaves a prompt with no line alone', () => {
    const plain = 'Day photo: One woman alone. Moment: She reads. Place: cozy bookshop.';
    assert.equal(repairStillPrompt(plain).prompt, plain);
  });
});
