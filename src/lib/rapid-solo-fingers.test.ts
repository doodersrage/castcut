import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRapidSoloRecipe } from './rapid-duo-recipe';

describe('Rapid solo: fingers inside, not two hands framing', () => {
  it('a "both hands" beat gets one hand inside and the other on her breast, Moment to match', () => {
    const recipe =
      buildRapidSoloRecipe({
        beat: 'alone on the kitchen floor naked with knees pulled to her chest fingering herself — both hands spreading and fingering her vulva, one adult only',
      }) ?? '';
    assert.match(recipe, /two fingers pushed inside her vagina, her palm against her vulva; her left hand cups her breast/);
    assert.doesNotMatch(recipe, /Both of her hands are between her thighs/);
    assert.match(recipe, /Moment: [^.]*her fingers inside her/);
    assert.doesNotMatch(recipe, /both hands spreading/);
  });

  it('a toy beat keeps both hands on the toy', () => {
    const recipe =
      buildRapidSoloRecipe({
        beat: 'alone on her back naked with a silicone dildo, both hands between her thighs',
        toy: true,
      }) ?? '';
    assert.match(recipe, /dildo/);
    assert.doesNotMatch(recipe, /two fingers pushed inside/);
  });

  it('knees to her chest: one arm holds a knee back, the other hand inside', () => {
    const recipe =
      buildRapidSoloRecipe({
        beat: 'solo masturbation on her back under a lamp, ankles near her shoulders, both hands between her thighs — Cast alone, empty sheets',
      }) ?? '';
    assert.match(recipe, /Her left arm hooks under her left knee/);
    assert.match(recipe, /two fingers pushed inside her vagina/);
    assert.doesNotMatch(recipe, /cups her breast/);
  });

  it('any "both hands …" clause in the Moment reads as fingers inside', () => {
    for (const beat of [
      'alone riding her own hands naked against the minibar — lamp tip-over gag, head tipped back, both hands grinding her clit, one adult only, fully nude',
      'solo reclining naked on the couch — the TV remote fallen on the floor, both hands spreading and fingering, alone, head tipped',
    ]) {
      const moment = /Moment: [^\n]*?\. /.exec(buildRapidSoloRecipe({ beat }) ?? '')?.[0] ?? '';
      assert.doesNotMatch(moment, /both hands|spreading/i, moment);
      assert.match(moment, /her fingers inside her/, moment);
    }
  });
});
