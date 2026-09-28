import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildKleinSpoonRecipe,
  KLEIN_SPOON_RECIPE_MARK,
  kleinSpoonRecipeApplies,
} from './klein-duo-recipe';
import { isRapidDuoRecipePrompt } from './rapid-duo-recipe-mark';
import { applyTurboEditStrengthToPrompt } from './turbo-edit-strength';

const beat = 'spooning with her boyfriend in bed under white sheets, him behind her';

describe('klein-duo-recipe', () => {
  it('applies to Klein clothed spoon beats with a male partner only', () => {
    const model = 'flux-2-klein-9b-distilled';
    assert.equal(kleinSpoonRecipeApplies({ model, adultMood: false, beat }), true);
    assert.equal(kleinSpoonRecipeApplies({ model, adultMood: true, beat }), false);
    assert.equal(
      kleinSpoonRecipeApplies({ model: 'qwen-rapid-aio-edit', adultMood: false, beat }),
      false
    );
    assert.equal(
      kleinSpoonRecipeApplies({ model, adultMood: false, beat: 'spooning with a friend' }),
      false
    );
    assert.equal(
      kleinSpoonRecipeApplies({ model, adultMood: false, beat: 'walking with her boyfriend' }),
      false
    );
  });

  it('front-loads the placement and reads kit ids as words', () => {
    const recipe = buildKleinSpoonRecipe({
      outfit: 'outfit-tailored-cobalt-slip-dress',
      setting: 'bedroom after dark',
      partnerOutfit: 'a plain grey sweater and dark jeans',
    });
    assert.ok(recipe.startsWith(KLEIN_SPOON_RECIPE_MARK));
    assert.match(recipe, /She wears a tailored cobalt slip dress; he wears a plain grey sweater/);
    assert.match(recipe, /Setting: bedroom after dark\./);
    assert.doesNotMatch(recipe, /\bnever\b|\bno\b/i);
    assert.equal(isRapidDuoRecipePrompt(recipe), true);
  });

  it('is never wrapped in the Klein edit opener/closer', () => {
    const recipe = buildKleinSpoonRecipe({
      outfit: 'outfit-tailored-cobalt-slip-dress',
      setting: 'bedroom after dark',
      partnerOutfit: 'a plain grey sweater and dark jeans',
    });
    assert.equal(applyTurboEditStrengthToPrompt(recipe, 'flux-2-klein-9b-distilled', 'strong'), recipe);
    // Other Klein prompts keep the wrap.
    assert.match(
      applyTurboEditStrengthToPrompt('She kneels by the door.', 'flux-2-klein-9b-distilled', 'strong'),
      /^Carry out this change on Image 1/
    );
  });
});
