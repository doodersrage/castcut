import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { masculineClothes, sameSexPartnerBeat } from './day-lead-gender';
import { parseIntimateLayout } from './day-pose-guide';
import { buildRapidDuoRecipe, buildRapidSuggestiveDuoRecipe } from './rapid-duo-recipe';
import { sheGivesOral } from './rapid-oral-pose';
import type { DayPartner } from './day-partner';
import { buildDaySlotPromptForStill } from './day-still-prompt';
import { DEFAULT_POSE_GUIDE_STYLE } from './pose-guide-prompt';

// Two men on Day (2026-10-06): a same-sex partner's beat is reworded ("his lap" → "her partner's
// lap") before the layout and the oral roles are read, and both misread it.
const SAM = { name: 'Sam', noun: 'man', descriptor: 'a man with curly black hair' } as DayPartner;

describe('same-sex duo wording', () => {
  it('still reads a lap or oral layout after the same-sex rewording', () => {
    for (const beat of [
      'sitting on his lap facing him in the armchair at late morning mid-sex — both adults fully visible',
      'sitting on his lap facing him on a kitchen chair mid-sex, arms around his neck — both adults fully visible',
    ]) {
      assert.equal(parseIntimateLayout(sameSexPartnerBeat(beat)), 'lap');
    }
  });

  it('keeps who gives oral after the rewording', () => {
    const beat = 'she kneels between his legs going down on him after dinner — oral with a partner';
    assert.equal(sheGivesOral(beat), true);
    assert.equal(sheGivesOral(sameSexPartnerBeat(beat)), true);
    // He gives: unchanged.
    assert.equal(sheGivesOral('he kneels and goes down on her on the bed edge'), false);
  });

  it('two men: the lead kneels for oral, and a lap is seated', () => {
    const oral = buildRapidDuoRecipe({
      beat: sameSexPartnerBeat('she kneels between his legs going down on him after dinner'),
      lead: 'man',
      partner: { partner: SAM, image: 'second' },
    });
    assert.match(oral ?? '', /his boyfriend sits on the edge of the bed; the man kneels/i);
    const lap = buildRapidDuoRecipe({
      beat: sameSexPartnerBeat('sitting on his lap facing him in the armchair mid-sex'),
      lead: 'man',
      partner: { partner: SAM, image: 'second' },
    });
    assert.match(lap ?? '', /His boyfriend sits on the armchair; the man sits on his boyfriend's lap/);
    assert.doesNotMatch(lap ?? '', /lies on his back/);
  });

  it('menswear covers a slip, a camisole and panties — not the verb "slip"', () => {
    assert.equal(masculineClothes('in a silk robe over a slip'), 'in a silk robe over an undershirt');
    assert.equal(masculineClothes('lace slip under an open robe'), 'an undershirt under an open robe');
    assert.equal(masculineClothes('in a silk camisole and shorts'), 'in an undershirt and shorts');
    assert.equal(masculineClothes('in a sleep shirt and panties'), 'in a sleep shirt and boxer briefs');
    assert.equal(masculineClothes('she lets the strap slip off her shoulder'), 'she lets the strap slip off her shoulder');
    assert.equal(masculineClothes('slips into bed'), 'slips into bed');
  });

  it("a man lead's couple recipe opens in his voice", () => {
    const prompt = buildDaySlotPromptForStill(
      {
        id: 'evening',
        label: 'Evening',
        sceneHints: 'slow-dancing close with her partner on a dim rooftop in an evening dress',
        location: 'rooftop terrace at night',
      } as never,
      {
        plate: { filename: 'p.png', source: 'cast' },
        queuePlate: { filename: 'p.png', source: 'cast' },
        character: { id: 't', name: 'Tomas', descriptor: 'a man with a full beard' },
        hasPlate: true,
        leadNoun: 'man',
        dayMood: 'suggestive',
        intimateEnabled: true,
        intimateMix: 'duo',
        allowCompanions: true,
        model: 'qwen-image-edit-2511-lightning-8',
        defaultPoseGuideStyle: DEFAULT_POSE_GUIDE_STYLE,
        wardrobeLabel: '',
      } as never,
      { poseGuide: false, partner: SAM, dressPlate: { filename: 'p.png', source: 'keeper' } } as never
    );
    assert.match(prompt, /A man and his boyfriend together/);
    assert.match(prompt, /SCENE: he is in the rooftop terrace at night — show that place around him\./);
    assert.doesNotMatch(prompt, /\bshe is in\b/);
  });

  it('a lying face-to-face couple is told both lie down; other beats are unchanged', () => {
    const lying = buildRapidSuggestiveDuoRecipe({
      beat: 'lying face to face on the rumpled bed with her partner, both in sleepwear — his hand on her hip',
    });
    assert.match(lying ?? '', /Both lie on their sides on the rumpled bed, facing each other, heads on the pillows\. Moment:/);
    const lap = buildRapidSuggestiveDuoRecipe({
      beat: "sitting sideways on her partner's lap on the couch in a silk robe",
    });
    assert.doesNotMatch(lap ?? '', /Both lie/);
  });

  it('two women keep the oral roles that tested clean (the lead receives)', () => {
    const NORA = { name: 'Nora', noun: 'woman', descriptor: 'a woman with brown hair' } as DayPartner;
    const oral = buildRapidDuoRecipe({
      beat: sameSexPartnerBeat('she kneels between his legs going down on him after dinner'),
      lead: 'woman',
      partner: { partner: NORA, image: 'second' },
    });
    assert.match(oral ?? '', /exactly two women/);
    assert.doesNotMatch(oral ?? '', /the woman kneels on the floor between her girlfriend's thighs/);
  });
});
