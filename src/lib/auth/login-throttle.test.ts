import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  LOGIN_MAX_FAILURES_PER_CLIENT,
  LOGIN_MAX_FAILURES_PER_USER,
  loginRetryAfterSec,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginThrottle,
} from './login-throttle';

describe('login throttle', () => {
  beforeEach(() => resetLoginThrottle());

  it('locks a username after 5 failures, whatever address they come from', () => {
    const now = 1_000_000;
    for (let i = 0; i < LOGIN_MAX_FAILURES_PER_USER; i++) {
      assert.equal(loginRetryAfterSec({ username: 'admin', client: `10.0.0.${i}` }, now), 0);
      recordLoginFailure({ username: 'Admin', client: `10.0.0.${i}` }, now);
    }
    assert.equal(loginRetryAfterSec({ username: 'admin', client: '10.9.9.9' }, now), 15 * 60);
    // Another account is not locked by it.
    assert.equal(loginRetryAfterSec({ username: 'nora', client: '10.9.9.9' }, now), 0);
    // The lock runs out.
    assert.equal(loginRetryAfterSec({ username: 'admin', client: '10.9.9.9' }, now + 15 * 60_000), 0);
  });

  it('limits one address spraying many usernames', () => {
    const now = 5_000_000;
    for (let i = 0; i < LOGIN_MAX_FAILURES_PER_CLIENT; i++) {
      recordLoginFailure({ username: `user${i}`, client: '203.0.113.7' }, now);
    }
    assert.ok(loginRetryAfterSec({ username: 'fresh', client: '203.0.113.7' }, now) > 0);
  });

  it('forgets a username\'s failures after a good login', () => {
    const now = 9_000_000;
    for (let i = 0; i < LOGIN_MAX_FAILURES_PER_USER - 1; i++) {
      recordLoginFailure({ username: 'admin', client: 'a' }, now);
    }
    recordLoginSuccess('admin');
    recordLoginFailure({ username: 'admin', client: 'a' }, now);
    assert.equal(loginRetryAfterSec({ username: 'admin', client: 'b' }, now), 0);
  });
});
