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
});
