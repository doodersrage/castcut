import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProductionAction } from './production-next';
import { clearSnoozes, snoozeAction, SNOOZE_MS, withoutSnoozed } from './production-snooze';

const action = (id: string, title: string): ProductionAction => ({
  id,
  kind: 'retry-jobs',
  title,
  detail: '',
  href: '/queue',
  cta: 'Open',
});

describe('putting a next action off ("Later")', () => {
  it('hides it for a day, for this Cast only', () => {
    const jobs = action('jobs', '3 jobs failed');
    const snoozes = snoozeAction({}, 'nora', jobs, 1000);
    assert.deepEqual(withoutSnoozed([jobs], snoozes, 'nora', 2000), { shown: [], snoozed: 1 });
    assert.equal(withoutSnoozed([jobs], snoozes, 'ava', 2000).shown.length, 1);
    assert.equal(withoutSnoozed([jobs], snoozes, 'nora', 1000 + SNOOZE_MS + 1).shown.length, 1);
  });

  it('comes back when it changes', () => {
    const snoozes = snoozeAction({}, 'nora', action('jobs', '3 jobs failed'), 1000);
    assert.equal(withoutSnoozed([action('jobs', '4 jobs failed')], snoozes, 'nora', 2000).snoozed, 0);
  });

  it('drops expired snoozes and lifts a Cast’s on request', () => {
    let snoozes = snoozeAction({}, 'nora', action('a', 'A'), 0);
    snoozes = snoozeAction(snoozes, 'ava', action('b', 'B'), SNOOZE_MS + 5);
    assert.deepEqual(Object.keys(snoozes), ['ava|b|B']);
    snoozes = snoozeAction(snoozes, 'nora', action('c', 'C'), SNOOZE_MS + 6);
    assert.deepEqual(Object.keys(clearSnoozes(snoozes, 'nora')), ['ava|b|B']);
  });
});
