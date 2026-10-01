import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dayPartnerApplies,
  inventedDayPartner,
  dayPartnerBriefLine,
  dayPartnerNoun,
  scrubDayPartnerOutfitImageClaims,
  toDayPartner,
} from './day-partner';
import { buildRapidDuoRecipe, buildRapidSuggestiveDuoRecipe } from './rapid-duo-recipe';

const lana = toDayPartner({ name: 'Loose Lana', descriptor: 'white woman in her 30s athletic build' })!;
const theo = toDayPartner({ name: 'Theo', descriptor: 'a tall man in his 30s with a short beard' })!;

describe('Day partner', () => {
  it('reads the partner from the Cast descriptor', () => {
    assert.equal(lana.noun, 'woman');
    assert.equal(theo.noun, 'man');
    assert.equal(dayPartnerNoun({ descriptor: 'A slender figure with soft eyes' }), 'person');
    assert.equal(toDayPartner({ name: '  ' }), null);
  });

  it('plays two-person stills only — adult layouts only with a man', () => {
    assert.equal(dayPartnerApplies({ partner: lana, headcount: 2, adultMood: false }), true);
    assert.equal(dayPartnerApplies({ partner: lana, headcount: 1, adultMood: false }), false);
    assert.equal(dayPartnerApplies({ partner: lana, headcount: 2, adultMood: true }), false);
    assert.equal(
      dayPartnerApplies({ partner: lana, headcount: 2, adultMood: true, sameSexLayouts: true }),
      true
    );
    assert.equal(dayPartnerApplies({ partner: theo, headcount: 2, adultMood: true }), true);
    assert.equal(dayPartnerApplies({ partner: null, headcount: 2, adultMood: false }), false);
  });

  it('names the partner face in the brief and drops stale Image 2 outfit claims', () => {
    assert.match(dayPartnerBriefLine(lana), /Image 2 is the face of the woman/);
    assert.equal(
      scrubDayPartnerOutfitImageClaims(
        'invent full body matching Image 3; outfit colors from Image 2 only. wear the Keep/Image 2 outfit exactly'
      ),
      'invent full body matching Image 3. wear the day outfit exactly'
    );
  });

  it('clothed couple recipe: the partner takes the second image, the pose map the third', () => {
    const recipe = buildRapidSuggestiveDuoRecipe({
      beat: 'slow dancing with her partner on a small dance floor',
      poseGuide: 'third',
      outfit: 'cocktail dress',
      partner: { partner: lana, image: 'second' },
    })!;
    assert.match(recipe, /A woman and another woman together/);
    assert.match(recipe, /the other woman has the face from the second image/);
    assert.match(recipe, /Match their two bodies to the third image/);
    assert.doesNotMatch(recipe, /the man has his own face/);
  });

  it('two women: every layout places her girlfriend, never a man', () => {
    const beats = [
      'missionary sex on the bed',
      'riding him cowgirl on the bed',
      'reverse cowgirl on the couch',
      'doggy style bent over the bed edge',
      'spooning sex on the bed',
      'scissoring on the bed',
      'going down on her, licking her pussy on the bed',
      'giving her partner a blowjob, kneeling between his legs',
      'wall sex, partner behind her',
      'prone bone, lying flat on her stomach',
    ];
    for (const beat of beats) {
      const recipe = buildRapidDuoRecipe({
        beat,
        poseGuide: 'third',
        partner: { partner: lana, image: 'second' },
      });
      assert.ok(recipe, beat);
      assert.match(recipe!, /her girlfriend/, beat);
      assert.doesNotMatch(recipe!, /\b(?:the man|him|his|he|penis)\b/i, beat);
      assert.match(recipe!, /her girlfriend has the face from the second image/, beat);
    }
  });

  it('adult duo recipe keeps both faces', () => {
    const recipe = buildRapidDuoRecipe({
      beat: 'missionary sex on the bed',
      poseGuide: 'third',
      partner: { partner: theo, image: 'second' },
    })!;
    assert.match(recipe, /Keep her face from the first image; the man has the face from the second image/);
    assert.match(recipe, /Match the two bodies in the third image/);
  });
});

describe('Day partner clips', () => {
  it('two-women clips never name a man', async () => {
    const { buildIntimateClipPrompt } = await import('./intimate-clip-prompt');
    const clip = buildIntimateClipPrompt('riding him cowgirl on the bed', 4, { twoWomen: true });
    assert.match(clip, /her girlfriend/);
    assert.doesNotMatch(clip, /\b(?:him|he|his)\b/);
  });
});

describe('Day partner: two men and a man lead', () => {
  const newMan = inventedDayPartner('new:man')!;
  const beats = [
    'missionary sex on the bed',
    'riding him cowgirl on the bed',
    'reverse cowgirl on the couch',
    'doggy style bent over the bed edge',
    'spooning sex on the bed',
    'giving her partner a blowjob, kneeling between his legs',
    'prone bone, lying flat on her stomach',
  ];

  it('two men: every layout places his boyfriend, never a woman', () => {
    for (const beat of beats) {
      const recipe = buildRapidDuoRecipe({
        beat,
        poseGuide: true,
        lead: 'man',
        partner: { partner: newMan, image: 'second' },
      });
      assert.ok(recipe, beat);
      assert.match(recipe!, /his boyfriend/, beat);
      assert.doesNotMatch(recipe!, /\b(?:woman|she|her|breasts?|vulva|pussy)\b/i, beat);
      assert.match(recipe!, /Keep his face from the first image; his boyfriend has his own face\./);
      assert.match(recipe!, /Match the two bodies in the second image/);
    }
  });

  it('a man lead with no partner keeps his face and invents the woman', () => {
    const recipe = buildRapidDuoRecipe({ beat: 'missionary sex on the bed', lead: 'man' })!;
    assert.match(recipe, /Keep the man's face from the first image; the woman has her own face\./);
  });

  it('who may partner on adult stills', () => {
    assert.equal(
      dayPartnerApplies({ partner: newMan, headcount: 2, adultMood: true, lead: 'man' }),
      false
    );
    assert.equal(
      dayPartnerApplies({
        partner: newMan,
        headcount: 2,
        adultMood: true,
        lead: 'man',
        sameSexLayouts: true,
      }),
      true
    );
    assert.equal(
      dayPartnerApplies({ partner: newMan, headcount: 2, adultMood: true, lead: 'woman' }),
      true
    );
  });

  it('two-men clips never name a woman', async () => {
    const { buildIntimateClipPrompt } = await import('./intimate-clip-prompt');
    const clip = buildIntimateClipPrompt('riding him cowgirl, her hands on his chest', 4, {
      twoMen: true,
    });
    assert.match(clip, /his boyfriend/);
    assert.doesNotMatch(clip, /\b(?:she|her)\b/);
  });
});

describe('Suggestive couple recipe for any pair', () => {
  const beat = 'straddling her partner on the couch, his hands on her waist, laughing';
  const woman = inventedDayPartner('new:woman')!;
  const man = inventedDayPartner('new:man')!;
  const recipe = (lead: 'man' | 'woman', partner?: typeof man) =>
    buildRapidSuggestiveDuoRecipe({
      beat,
      poseGuide: true,
      lead,
      ...(partner ? { partner: { partner, image: 'second' as const } } : {}),
    })!;

  it('two women never mention a man', () => {
    const text = recipe('woman', woman);
    assert.match(text, /A woman and another woman together/);
    assert.match(text, /her girlfriend's hands on her waist/);
    assert.doesNotMatch(text, /\b(?:man|he|his|him)\b/i);
    assert.match(text, /the other woman has her own face/);
  });

  it('two men never mention a woman', () => {
    const text = recipe('man', man);
    assert.match(text, /A man and another man together/);
    assert.match(text, /He wears a fitted shirt and trousers/);
    assert.doesNotMatch(text, /\b(?:woman|she|her|dress)\b/i);
  });

  it('a man lead with no partner chosen gets a woman', () => {
    const text = recipe('man');
    assert.match(text, /A man and a woman together/);
    assert.match(text, /Keep his face from the first image; the woman has her own face/);
  });

  it('the default pair is unchanged', () => {
    assert.match(recipe('woman'), /A woman and a man together/);
  });
});
