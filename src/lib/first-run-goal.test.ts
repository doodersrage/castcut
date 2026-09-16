import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FIRST_RUN_GOAL_OPTIONS,
  normalizeFirstRunGoal,
  resolveFirstRunGoalCta,
} from './first-run-goal';

describe('first-run-goal', () => {
  it('exposes four make paths', () => {
    assert.deepEqual(
      FIRST_RUN_GOAL_OPTIONS.map(entry => entry.id),
      ['character', 'film', 'image', 'surprise']
    );
  });

  it('normalizes known goals only', () => {
    assert.equal(normalizeFirstRunGoal('film'), 'film');
    assert.equal(normalizeFirstRunGoal('nope'), null);
  });

  it('resolves surprise CTA to autogen queue', () => {
    assert.deepEqual(resolveFirstRunGoalCta('surprise'), {
      label: 'Generate & queue first scene',
      href: '/?source=random&autogen=1&autoqueue=1',
    });
  });

  it('describes film as one-tap Day and character as paced loop', () => {
    const film = FIRST_RUN_GOAL_OPTIONS.find(entry => entry.id === 'film');
    const character = FIRST_RUN_GOAL_OPTIONS.find(entry => entry.id === 'character');
    assert.match(film?.description ?? '', /One-tap Day/i);
    assert.match(character?.description ?? '', /Look → Outfit → Day/i);
    assert.equal(character?.cta.href, '/play');
  });
});
