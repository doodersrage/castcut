import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkLoraKeepers } from './keeper-check';

const at = (place: string, face?: number) => ({
  prompt: `Day photo. SCENE: she is in ${place}. Moment: smiling.`,
  ...(face === undefined ? {} : { playChecks: { face } }),
});

describe('checkLoraKeepers', () => {
  it('asks for more keepers under ten', () => {
    const check = checkLoraKeepers([at('the kitchen'), at('a park')]);
    assert.equal(check.ok, false);
    assert.match(check.problems[0]!, /at least 10/);
  });

  it('flags a set from one or two places', () => {
    const check = checkLoraKeepers(Array.from({ length: 12 }, (_, i) => at(i % 2 ? 'the kitchen' : 'the bedroom')));
    assert.equal(check.places, 2);
    assert.ok(check.problems.some(problem => /places? among them/.test(problem)));
  });

  it('passes a varied, recognisable set', () => {
    const places = ['the kitchen', 'a park', 'the office', 'a cafe', 'the beach', 'a library'];
    const check = checkLoraKeepers(Array.from({ length: 15 }, (_, i) => at(places[i % 6]!, 0.66)));
    assert.equal(check.ok, true);
    assert.equal(Math.round(check.face! * 100), 66);
  });

  it('flags keepers that do not look like the Cast', () => {
    const places = ['the kitchen', 'a park', 'the office', 'a cafe'];
    const check = checkLoraKeepers(Array.from({ length: 12 }, (_, i) => at(places[i % 4]!, 0.45)));
    assert.ok(check.problems.some(problem => /45%/.test(problem)));
  });
});
