import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sessionRetryDelayMs } from './useAuth';

describe('sessionRetryDelayMs', () => {
  it('follows the schedule for a dropped request, then gives up', () => {
    assert.equal(sessionRetryDelayMs(0, null), 400);
    assert.equal(sessionRetryDelayMs(1, null), 1200);
    assert.equal(sessionRetryDelayMs(2, null), 3000);
    assert.equal(sessionRetryDelayMs(3, null), null);
  });

  it('waits for a rate-limited response\'s Retry-After, capped, never shorter than the schedule', () => {
    assert.equal(sessionRetryDelayMs(0, { status: 429, retryAfter: '3' }), 3000);
    assert.equal(sessionRetryDelayMs(0, { status: 429, retryAfter: '60' }), 10_000);
    assert.equal(sessionRetryDelayMs(2, { status: 429, retryAfter: '1' }), 3000);
    // A 5xx or a missing header keeps the schedule.
    assert.equal(sessionRetryDelayMs(0, { status: 503, retryAfter: '30' }), 400);
    assert.equal(sessionRetryDelayMs(0, { status: 429, retryAfter: null }), 400);
    assert.equal(sessionRetryDelayMs(0, { status: 429, retryAfter: 'soon' }), 400);
    assert.equal(sessionRetryDelayMs(3, { status: 429, retryAfter: '2' }), null);
  });
});
