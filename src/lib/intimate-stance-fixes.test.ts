import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRapidDuoRecipe, buildRapidSoloRecipe } from './rapid-duo-recipe';

// Live replays 2026-10-07: each fix 3/3 where the old line failed 3/3.
const solo = (beat: string) => buildRapidSoloRecipe({ beat } as never) ?? '';

describe('intimate stance fixes', () => {
  it('face-down on laundry says back and buttocks up', () => {
    assert.match(
      solo('alone naked face-down on a pile of clean laundry grinding into the towels, one hand between her thighs'),
      /flat on her stomach on a pile of clean laundry .*her bare back and buttocks up/
    );
  });

  it('ankles near her shoulders raise both legs, like the guide', () => {
    assert.match(
      solo('alone naked on her back in the dark with ankles near her shoulders masturbating'),
      /both knees pulled up toward her chest, feet in the air/
    );
    assert.match(
      solo('solo masturbation lying in late-morning sheets, one knee raised, hand between her thighs'),
      /one knee drawn up toward her chest and the other leg bent out/
    );
  });

  it('on her back, the Moment drops leg-spread words the stance line already settles', () => {
    const recipe = solo(
      'solo masturbation lying in the dark with the covers kicked off, knees apart, hand between her thighs — alone'
    );
    assert.match(recipe, /Moment: solo masturbation lying in the dark with the covers kicked off, hand between her thighs/);
    assert.match(recipe, /two legs only/);
    // Other stances keep the words.
    assert.match(solo('solo masturbation sitting on the windowsill, knees apart, hand between her thighs'), /knees apart/);
  });

  it('a nude duo beat drops the clothes it names; accessories stay', () => {
    const moment = (beat: string) => (buildRapidDuoRecipe({ beat }) ?? '').match(/Moment: [^.]*\./)?.[0] ?? '';
    assert.equal(
      moment('bent over the hotel desk mid-sex with a partner behind, cocktail dress around her waist'),
      'Moment: bent over the hotel desk mid-sex with a partner behind.'
    );
    assert.doesNotMatch(moment('straddling a partner on the couch after dinner, dress pushed up, mid-kiss'), /dress/);
    assert.match(moment('oral sex on the bed after a night out, heels still on'), /heels still on/);
  });
});

describe('walking hand in hand (Edit 2511)', () => {
  const beat = 'walking hand in hand with her partner to the restaurant, both dressed up';
  it('skips the standing hold-hands map on 2511 only', async () => {
    const { dayWalkingDuoSkipsPoseGuide } = await import('./rapid-duo-recipe');
    assert.equal(dayWalkingDuoSkipsPoseGuide('qwen-image-edit-2511-lightning-8', beat), true);
    assert.equal(dayWalkingDuoSkipsPoseGuide('qwen-rapid-aio-edit-nsfw', beat), false);
    assert.equal(dayWalkingDuoSkipsPoseGuide('qwen-image-edit-2511-lightning-8', 'standing hand in hand at the altar'), false);
  });
  it('adds the stride line only when no map is attached', async () => {
    const { buildCompactDayDuoRecipe } = await import('./rapid-duo-recipe');
    assert.match(buildCompactDayDuoRecipe({ beat }) ?? '', /both mid-stride — one foot lifted/);
    assert.doesNotMatch(buildCompactDayDuoRecipe({ beat, poseGuide: 'third' }) ?? '', /mid-stride/);
  });
});

describe('adult spooning on Rapid', () => {
  it('skips the flat spoon drawing on Rapid adult stills only', async () => {
    const { rapidAdultSkipsPoseGuide } = await import('./rapid-duo-recipe');
    const beat = 'spooning sex in bed as the light fades';
    assert.equal(rapidAdultSkipsPoseGuide({ model: 'qwen-rapid-aio-edit-nsfw', adultMood: true, beat }), true);
    assert.equal(rapidAdultSkipsPoseGuide({ model: 'qwen-rapid-aio-edit-nsfw', adultMood: false, beat }), false);
    assert.equal(rapidAdultSkipsPoseGuide({ model: 'flux-2-klein-9b', adultMood: true, beat }), false);
    assert.equal(
      rapidAdultSkipsPoseGuide({ model: 'qwen-rapid-aio-edit-nsfw', adultMood: true, beat: 'missionary on the couch' }),
      false
    );
    const rapid = { model: 'qwen-rapid-aio-edit-nsfw', adultMood: true };
    assert.equal(rapidAdultSkipsPoseGuide({ ...rapid, beat: 'lying face-down on the sheets mid-sex with a partner stretched along her back' }), true);
    assert.equal(rapidAdultSkipsPoseGuide({ ...rapid, beat: 'against the bedroom wall mid-sex with a partner' }), true);
    // Same-sex wall pairs keep the map (only man–woman was tested without it).
    assert.equal(rapidAdultSkipsPoseGuide({ ...rapid, beat: 'against the bedroom wall mid-sex with a partner', sameSex: true }), false);
  });
  it('the recipe names no pose map when none is attached', async () => {
    const { buildRapidDuoRecipe } = await import('./rapid-duo-recipe');
    const recipe = buildRapidDuoRecipe({ beat: 'spooning sex in bed as the light fades' }) ?? '';
    assert.match(recipe, /Spooning, seen from the front/);
    assert.doesNotMatch(recipe, /pose map/);
  });
});

describe('clothes on an Intimate mixed Day', () => {
  it('a solo masturbation beat drops the outfit on every adult mix', async () => {
    const { dayBeatOmitsGarmentPackshot } = await import('./day-planner');
    // "masturbat\b" never matched "masturbation": on a mixed Day this beat kept the outfit and
    // came out fully dressed (03068, 2026-10-07).
    const blurb =
      'solo masturbation lying across the bed in lingerie after dinner, one hand between her thighs — Cast alone';
    for (const intimateMix of ['solo', 'duo', 'mixed'] as const) {
      assert.equal(dayBeatOmitsGarmentPackshot({ blurb, dayMood: 'intimate', intimateMix }), true, intimateMix);
    }
    assert.equal(
      dayBeatOmitsGarmentPackshot({ blurb: 'self-pleasure on the couch at dusk', dayMood: 'intimate', intimateMix: 'mixed' }),
      true
    );
  });
});

describe('round 4 (2026-10-07)', () => {
  it('a nude solo Moment drops what she wears and meal times; the clothed route keeps them', () => {
    const beat = 'solo masturbation lying across the bed in lingerie after dinner, one hand between her thighs — alone';
    assert.match(solo(beat), /Moment: solo masturbation lying across the bed, one hand between her thighs/);
    const clothed = buildRapidSoloRecipe({ beat, clothedOutfit: 'a black slip' } as never) ?? '';
    assert.match(clothed, /in lingerie/);
  });

  it('a nude duo Moment drops "after dinner"', () => {
    const recipe = buildRapidDuoRecipe({ beat: 'she kneels between his legs going down on him after dinner — oral with a partner' }) ?? '';
    assert.match(recipe, /Moment: she kneels between his legs going down on him —/);
  });

  it('standing solo: the hand cups her vulva', () => {
    assert.match(
      solo('solo masturbation standing against the hotel wall at dusk, one knee bent, hand between her thighs'),
      /One hand cups her bare vulva between her thighs/
    );
    assert.doesNotMatch(solo('solo masturbation lying in late-morning sheets, hand between her thighs'), /cups her bare vulva/);
  });
});
