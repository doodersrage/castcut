import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withThirdPerson } from './day-group';
import { inSpokenLanguage, parseDubReply } from './day-dub';

const DUO =
  'Edit Image 1: SCENE: a café.\nFOOTWEAR (mandatory): on her own feet (the person from the first image) she wears silver heels — exactly these, on both feet; the other person wears plain white sneakers — never the same pair.\n' +
  'Day photo: A woman and a man together, both fully clothed, both fully in frame. Moment: seated at a brunch table, both mid-laugh. She wears a red dress; he wears a shirt. Keep her face from the first image; the man has the face from the second image. Match their two bodies to the third image (pose map). Place: a café. Photorealistic photograph.';

describe('withThirdPerson', () => {
  it('names all three by their image, says their face and clothes, drops the pose map', () => {
    const out = withThirdPerson(DUO, { noun: 'woman', descriptor: 'long black hair.' });
    assert.match(
      out,
      /Three people together — exactly three, .* the woman from the first image, the man from the second image, and the woman from the third image\./
    );
    assert.match(out, /Moment: seated at a brunch table, all three mid-laugh\./);
    assert.match(out, /The woman from the third image has that face \(long black hair\)\./);
    assert.match(out, /the others wear their own shoes\./);
    assert.match(
      out,
      /She wears a red dress; he wears a shirt; the woman from the third image wears a blue linen shirt, dark jeans and white sneakers, not the same clothes/
    );
    assert.doesNotMatch(out, /pose map|both fully/);
  });

  it('drops the pose map from the POSE FIRST line too (Image 3 is the third face)', () => {
    const out = withThirdPerson(
      'Edit Image 1: POSE FIRST: the two people — walking along the path, all laughing, exactly as the pose map in Image 3 shows.\n' +
        DUO.replace('Edit Image 1: ', ''),
      { noun: 'woman' }
    );
    assert.match(out, /POSE FIRST: all three people — walking along the path, all laughing\./);
    assert.doesNotMatch(out, /pose map/);
  });

  it('two women; a man third', () => {
    const out = withThirdPerson(DUO.replace('A woman and a man', 'Two women'), { noun: 'man' });
    assert.match(out, /the woman from the first image, the woman from the second image, and the man from the third image/);
    assert.match(out, /wears a grey crew-neck t-shirt/);
  });

  it('leaves other prompts alone (adult, solo)', () => {
    const solo = 'Day photo: A woman alone in a café. Place: a café.';
    assert.equal(withThirdPerson(solo, { noun: 'man' }), solo);
  });
});

describe('Dub', () => {
  it('says every quoted line in the language', () => {
    const talk = 'She says clearly, "Hola." The man answers, "Qué tal." Camera: locked.';
    assert.equal(
      inSpokenLanguage(talk, 'spanish'),
      'She says clearly in Spanish, "Hola." The man answers in Spanish, "Qué tal." Camera: locked. All speech is in Spanish, with a native Spanish accent.'
    );
    assert.equal(inSpokenLanguage(talk, undefined), talk);
    assert.equal(inSpokenLanguage('No words here.', 'French'), 'No words here.');
  });

  it('reads the numbered translations back in order', () => {
    assert.deepEqual(parseDubReply('2. Deux\n1) "Un"\nnote', 2), ['Un', 'Deux']);
    assert.equal(parseDubReply('1. Un', 2), null);
  });
});

describe('withThirdPerson: busy groups (Qwen-Image 2.1)', () => {
  const cooking =
    'Edit Image 1: POSE FIRST: the two people — cooking lunch together with her partner and a friend, exactly as the pose map in Image 3 shows.\n' +
    DUO.replace('Edit Image 1: ', '');

  it('gives each of the three a job for a cooking moment', () => {
    const out = withThirdPerson(cooking, { noun: 'woman', busy: true });
    assert.match(
      out,
      /POSE FIRST: all three people — cooking lunch together with her partner and a friend — the woman from the first image stirs a pan at the stove, the man from the second image chops vegetables on a board, the woman from the third image leans in tasting from a wooden spoon, caught mid-moment, .* not lined up facing the camera\./
    );
    assert.doesNotMatch(out, /pose map/);
  });

  it('only the busy words for a moment with no task list; nothing without busy', () => {
    const walking = cooking.replace('cooking lunch together', 'walking along the path');
    const out = withThirdPerson(walking, { noun: 'woman', busy: true });
    assert.match(out, /walking along the path with her partner and a friend — caught mid-moment/);
    assert.doesNotMatch(out, /stirs|dice/);
    assert.doesNotMatch(withThirdPerson(cooking, { noun: 'woman' }), /stirs|mid-moment/);
  });

  it('baking beats cooking; games get dice and cards', async () => {
    const { groupBusyLine } = await import('./day-group');
    assert.match(groupBusyLine('baking and cooking cookies', ['woman', 'man', 'woman']), /rolls out dough/);
    assert.match(groupBusyLine('a board game night', ['woman', 'man', 'man']), /the man from the third image laughs, holding a card/);
  });
});
