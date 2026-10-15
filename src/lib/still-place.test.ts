import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decidePlace, placeJudgePrompt } from './still-place';

describe('still place check', () => {
  it('reads the judge loosely and keeps what she was seen in', () => {
    assert.deepEqual(decidePlace('kitchen, at the stove', 'Yes.'), {
      match: true,
      seen: 'kitchen, at the stove',
    });
    assert.deepEqual(decidePlace(' bedroom,  on the bed ', '<think>hmm</think>No'), {
      match: false,
      seen: 'bedroom, on the bed',
    });
    assert.equal(decidePlace('kitchen', 'maybe'), null);
    assert.equal(decidePlace('', 'no'), null);
  });

  it('asks about the kind of place, not its details', () => {
    const prompt = placeJudgePrompt('cozy apartment kitchen', 'kitchen, at the stove');
    assert.match(prompt, /"cozy apartment kitchen"/);
    assert.match(prompt, /indoors vs outdoors must match/);
    assert.match(prompt, /Answer only yes or no\.$/);
  });
});
