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
