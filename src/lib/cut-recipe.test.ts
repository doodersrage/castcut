import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cutRecipeFrom, cutRecipeSummary, isCutRecipe } from './cut-recipe';

describe('cut recipe', () => {
  it('keeps the shots and options, not browser-only data', () => {
    const recipe = cutRecipeFrom({
      source: 'day',
      shots: [
        { key: 'morning', title: 'Morning', url: '/m.png', kind: 'still', framing: 'close' },
        {
          key: 'night',
          title: 'Night',
          url: '/n.mp4',
          kind: 'clip',
          trimStartSec: 1,
          trimEndSec: 3,
        },
        { key: 'demo', title: 'Demo', url: 'data:image/png;base64,AAAA', kind: 'still' },
      ],
      resolution: '720p-vertical',
      audioBedUrl: 'data:audio/mp3;base64,AAAA',
      musicLevel: 0.6,
    });
    assert.ok(isCutRecipe(recipe));
    assert.equal(recipe.shots.length, 2);
    assert.equal(recipe.droppedShots, 1);
    assert.equal(recipe.shots[0]!.framing, 'close');
    assert.equal(recipe.shots[1]!.trimEndSec, 3);
    assert.equal(recipe.audioBedUrl, undefined);
    assert.equal(recipe.musicLevel, 0.6);
    assert.equal(
      cutRecipeSummary(recipe),
      "2 shots · 1 clip · vertical 720p · 1 shot can't be re-cut"
    );
    assert.equal(isCutRecipe({ version: 2, shots: [] }), false);
  });
});
