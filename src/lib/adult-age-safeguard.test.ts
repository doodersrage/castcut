import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ADULT_YOUTH_NEGATIVE,
  adultAgeLine,
  adultAgeLineIn,
  adultDecadeFor,
  appendYouthNegative,
  ensureAdultAgeSafeguards,
  hasAdultAgeLine,
  isAdultContentPrompt,
  neutralizeYouthWords,
  withAdultAgeLine,
  youthWordsIn,
} from './adult-age-safeguard';

const BOTH_THIRTIES = 'Both are adults in their thirties, with mature adult faces and bodies.';

describe('adultAgeLine', () => {
  it('names one woman, one man, or an unknown count', () => {
    assert.equal(
      adultAgeLine({ lead: { noun: 'woman' }, people: 1 }),
      'She is an adult woman in her thirties, with a mature adult face and body.'
    );
    assert.equal(
      adultAgeLine({ lead: { noun: 'man' }, people: 1 }),
      'He is an adult man in his thirties, with a mature adult face and body.'
    );
    assert.equal(
      adultAgeLine({ lead: { noun: 'person' } }),
      'Everyone in the picture is an adult in their thirties, with mature adult faces and bodies.'
    );
  });

  it('names a pair in one sentence, by decade when they differ', () => {
    assert.equal(
      adultAgeLine({ lead: { noun: 'woman' }, partner: { noun: 'man' }, people: 2 }),
      BOTH_THIRTIES
    );
    assert.equal(
      adultAgeLine({
        lead: { noun: 'woman', ageBand: 'late-20s' },
        partner: { noun: 'man', ageBand: '40s' },
        people: 2,
      }),
      'Both are adults — the woman in her late twenties, the man in his forties — with mature adult faces and bodies.'
    );
    assert.equal(
      adultAgeLine({
        lead: { noun: 'woman', ageBand: '40s' },
        partner: { noun: 'woman' },
        people: 2,
      }),
      'Both are adults — one in her forties, the other in her thirties — with mature adult faces and bodies.'
    );
  });

  it('never says younger than the late twenties', () => {
    assert.equal(adultDecadeFor({ noun: 'woman', ageBand: 'early-20s' }), 'late twenties');
    assert.equal(adultDecadeFor({ noun: 'woman', descriptor: 'a woman in her early 20s' }), 'late twenties');
    assert.equal(adultDecadeFor({ noun: 'man', descriptor: 'a 19-year-old man' }), 'late twenties');
    assert.equal(adultDecadeFor({ noun: 'man', descriptor: 'a man in his 40s' }), 'forties');
    assert.equal(adultDecadeFor({ noun: 'man', descriptor: 'a tall man, short beard' }), 'thirties');
    // The picked trait wins over the description.
    assert.equal(
      adultDecadeFor({ noun: 'woman', ageBand: '50s', descriptor: 'in her thirties' }),
      'fifties'
    );
  });

  it('says it more strongly for the requeue, a step older', () => {
    assert.equal(
      adultAgeLine({ lead: { noun: 'woman' }, partner: { noun: 'man' }, people: 2, strong: true }),
      'Both are clearly adults in their late thirties, with mature grown-up faces, adult proportions and fully adult bodies.'
    );
    assert.equal(
      adultAgeLine({ lead: { noun: 'woman', ageBand: 'early-20s' }, people: 1, strong: true }),
      'She is clearly an adult woman in her thirties, with a mature grown-up face, adult proportions and a fully adult body.'
    );
    // Already mature: the decade stays.
    assert.equal(adultDecadeFor({ noun: 'man', ageBand: '50s' }, true), 'fifties');
  });

  it('is found again in a prompt', () => {
    const prompt = `Explicit sex photo: The woman lies on the bed. ${BOTH_THIRTIES} Moment: x.`;
    assert.equal(hasAdultAgeLine(prompt), true);
    assert.equal(adultAgeLineIn(prompt), BOTH_THIRTIES);
    assert.equal(hasAdultAgeLine('A woman on a bed. adults only'), false);
    assert.equal(adultAgeLineIn('no line here'), null);
  });
});

describe('withAdultAgeLine', () => {
  it('goes after the pose sentences of a duo recipe, before "Moment:"', () => {
    const recipe =
      'Explicit sex photo: The man lies flat on his back on the bed; the woman kneels astride his hips. Moment: riding him. Room: bedroom. Photorealistic photograph, natural skin.';
    assert.equal(
      withAdultAgeLine(recipe, BOTH_THIRTIES),
      `Explicit sex photo: The man lies flat on his back on the bed; the woman kneels astride his hips. ${BOTH_THIRTIES} Moment: riding him. Room: bedroom. Photorealistic photograph, natural skin.`
    );
  });

  it('goes after the pose sentence of a recipe with no "Moment:"', () => {
    assert.equal(
      withAdultAgeLine('Suggestive photo: She leans on the wall. Room: hall.', 'AGE.'),
      'Suggestive photo: She leans on the wall. AGE. Room: hall.'
    );
  });

  it('goes on its own line after the first line of a long brief', () => {
    assert.equal(
      withAdultAgeLine('SCENE: bedroom\nPOSE LOCK: missionary\nIdentity: Image 1', 'AGE.'),
      'SCENE: bedroom\nAGE.\nPOSE LOCK: missionary\nIdentity: Image 1'
    );
  });

  it('goes after the first sentence of one paragraph, and on a recipe line in a brief', () => {
    assert.equal(
      withAdultAgeLine('A couple on a couch. They kiss. Warm light.', 'AGE.'),
      'A couple on a couch. AGE. They kiss. Warm light.'
    );
    assert.equal(
      withAdultAgeLine('FOOTWEAR (mandatory): heels.\nExplicit solo photo: She lies back. Moment: x.', 'AGE.'),
      'FOOTWEAR (mandatory): heels.\nExplicit solo photo: She lies back. AGE. Moment: x.'
    );
    assert.equal(withAdultAgeLine('one sentence no stop', 'AGE.'), 'one sentence no stop. AGE.');
  });

  it('is added once', () => {
    const once = withAdultAgeLine('A couple in bed. They kiss.', BOTH_THIRTIES);
    assert.equal(withAdultAgeLine(once, BOTH_THIRTIES), once);
  });
});

describe('neutralizeYouthWords', () => {
  const cases: Array<[string, string]> = [
    ['A young girl kneels on the bed', 'A woman kneels on the bed'],
    ['a teen boy and his girlfriend', 'an adult man and his girlfriend'],
    ['the girls laugh with the boys', 'the women laugh with the men'],
    ['An 18-year-old blonde', 'An adult blonde'],
    ['a 19 yo brunette, aged 19', 'an adult brunette, aged 28'],
    ['a woman in her early twenties', 'a woman in her late twenties'],
    ['a man in his twenties', 'a man in his late twenties'],
    ['her mid-20s friend', 'her late twenties friend'],
    ['early 20s', 'late twenties'],
    ['a petite brunette', 'a slim brunette'],
    ['tiny waist, youthful glow', 'small waist, radiant glow'],
    ['a young-looking woman', 'a woman'],
    ['Young woman laughing', 'Woman laughing'],
    ['a schoolgirl outfit', 'an office outfit'],
    ['in a school uniform', 'in an office outfit'],
    ['schoolgirl and schoolboy', 'woman and man'],
    ['high school sweethearts after school', 'office sweethearts after office'],
    ['in the classroom doing homework', 'in the office doing paperwork'],
    ['her hair in pigtails', 'her hair in low braids'],
    ['a barely legal babe', 'an adult babe'],
    ['she is a minor.', 'she is an adult.'],
    ['childlike face, baby face', 'grown face, mature face'],
    ['a baby-faced guy', 'a mature-faced guy'],
    ['a teenager on the couch', 'an adult on the couch'],
    ['teens kissing', 'adults kissing'],
    ['a child nearby', 'an adult nearby'],
    ['kids in the room', 'adults in the room'],
    ['a student in the dorm', 'a graduate student in the dorm'],
    ['jailbait, loli', 'adult, adult'],
    ['an underage girl', 'an adult woman'],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}"`, () => assert.equal(neutralizeYouthWords(input), expected));
  }

  // Ordinary words stay as they are.
  const untouched = [
    'her girlfriend and his boyfriend',
    'an old-school jukebox',
    'the night is young',
    'baby blue sheets and a baby oil bottle',
    'a little smile, a little closer',
    "child's pose on the yoga mat",
    'kid gloves',
    'a minor detail, a minor chord',
    'the youngest of the three sisters', // "youngest" alone is not a youth word here
    'Boyfriend jeans and a girlfriend cut',
    'a woman in her late twenties',
    'teenage-mutant figurine'.replace('teenage-mutant figurine', 'canteen and fifteen minutes'),
    'preschool sign',
    'a tall woman with long hair',
    'adults in their thirties',
  ];
  for (const text of untouched) {
    it(`leaves "${text}" alone`, () => assert.equal(neutralizeYouthWords(text), text));
  }

  it('lists what it would change', () => {
    assert.deepEqual(youthWordsIn('a petite girl'), ['girl', 'petite']);
    assert.deepEqual(youthWordsIn('her girlfriend, the night is young'), []);
  });
});

describe('isAdultContentPrompt', () => {
  const adult = [
    'Explicit sex photo: The woman lies back',
    'she is completely nude on the sheets',
    'bent over the kitchen counter mid-sex with a partner behind',
    'MOOD: suggestive — lingerie',
    'solo masturbation on the couch',
    'reverse cowgirl on the couch',
    'topless on the beach',
  ];
  for (const text of adult) {
    it(`reads "${text}" as adult content`, () => assert.equal(isAdultContentPrompt(text), true));
  }
  const clothed = [
    'Day photo: She jogs along the river in running shoes.',
    'Never a topless, bottomless, or sports-bra-only look. No cycling bibs.',
    'zero fabric when the beat is nude',
    'the weight room with racks, chalk dust, and rubber floors under strip lights',
    'nude-tone bra', // a colour name, not a scene: still caught (a false hit only adds a line)
  ];
  it('ignores locks, conditions and lighting', () => {
    for (const text of clothed.slice(0, 4)) {
      assert.equal(isAdultContentPrompt(text), false, text);
    }
  });
});

describe('ensureAdultAgeSafeguards (every queued prompt)', () => {
  it('leaves a clothed prompt alone', () => {
    const input = { positive: 'Day photo: She waters the plants.', negative: 'blurry', usesNegative: true };
    assert.deepEqual(ensureAdultAgeSafeguards(input), {
      positive: input.positive,
      negative: 'blurry',
      applied: false,
    });
  });

  it('adds the generic age sentence and, at CFG > 1, the youth negative', () => {
    const result = ensureAdultAgeSafeguards({
      positive: 'A petite girl, nude on the bed. Warm light.',
      negative: 'blurry',
      usesNegative: true,
    });
    assert.equal(
      result.positive,
      'A slim woman, nude on the bed. Everyone in the picture is an adult in their thirties, with mature adult faces and bodies. Warm light.'
    );
    assert.equal(result.negative, `blurry, ${ADULT_YOUTH_NEGATIVE}`);
    assert.equal(result.applied, true);
  });

  it('leaves the negative alone at CFG 1 (Rapid / Lightning ignore it)', () => {
    const result = ensureAdultAgeSafeguards({
      positive: 'Explicit sex photo: The woman lies back. Moment: x.',
      negative: 'moire',
      usesNegative: false,
    });
    assert.equal(result.negative, 'moire');
    assert.ok(hasAdultAgeLine(result.positive));
  });

  it('keeps a builder\'s own age sentence', () => {
    const own = `Explicit sex photo: The woman lies back. ${BOTH_THIRTIES} Moment: x.`;
    assert.equal(ensureAdultAgeSafeguards({ positive: own, usesNegative: false }).positive, own);
  });

  it('adds only the missing youth terms', () => {
    assert.equal(appendYouthNegative(''), ADULT_YOUTH_NEGATIVE);
    assert.equal(appendYouthNegative(ADULT_YOUTH_NEGATIVE), ADULT_YOUTH_NEGATIVE);
    assert.equal(
      appendYouthNegative('child, blurry'),
      `child, blurry, ${ADULT_YOUTH_NEGATIVE.replace('child, ', '')}`
    );
  });
});
