import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appSlotEntries, registerAppSlot } from '../components/AppSlot';
import { appFlag, registerAppFlag } from './app-flags';

describe('app slots and flags', () => {
  it('keeps registration order by `order`, one entry per id', () => {
    const A = () => null;
    const B = () => null;
    registerAppSlot('home.metrics', 'b', B, 2);
    registerAppSlot('home.metrics', 'a', A, 1);
    registerAppSlot('home.metrics', 'b', B, 0);
    assert.deepEqual(
      appSlotEntries('home.metrics').map(entry => entry.id),
      ['b', 'a']
    );
  });

  it('an unanswered or throwing flag is false', () => {
    assert.equal(appFlag('home.showGoalChooser'), false);
    registerAppFlag('home.showGoalChooser', () => {
      throw new Error('boom');
    });
    assert.equal(appFlag('home.showGoalChooser'), false);
    registerAppFlag('home.showGoalChooser', () => true);
    assert.equal(appFlag('home.showGoalChooser'), true);
  });
});
