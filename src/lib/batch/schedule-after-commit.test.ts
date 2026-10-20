import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { scheduleAfterCommit } from './schedule-after-commit';

describe('scheduleAfterCommit', () => {
  it('does not invoke the callback synchronously', () => {
    const callback = mock.fn(() => {});
    scheduleAfterCommit(callback);
    assert.equal(callback.mock.calls.length, 0);
  });

  it('invokes the callback on a later microtask', async () => {
    const callback = mock.fn(() => {});
    scheduleAfterCommit(callback);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(callback.mock.calls.length, 1);
  });

  it('runs multiple scheduled callbacks in the order they were scheduled', async () => {
    const order: number[] = [];
    scheduleAfterCommit(() => order.push(1));
    scheduleAfterCommit(() => order.push(2));
    scheduleAfterCommit(() => order.push(3));
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(order, [1, 2, 3]);
  });
});
