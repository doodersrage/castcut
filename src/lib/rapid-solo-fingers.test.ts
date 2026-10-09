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
});
