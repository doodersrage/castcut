import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  getDefaultAdminUsername,
  getDefaultAdminPassword,
  isAuthExplicitlyEnabled,
  getSessionSecret,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
} from './config';

const ENV_KEYS = [
  'PROMPT_ADMIN_USERNAME',
  'PROMPT_ADMIN_PASSWORD',
  'PROMPT_AUTH_ENABLED',
  'PROMPT_SESSION_SECRET',
  'PROMPT_API_TOKEN',
] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  originalEnv[key] = process.env[key];
}

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    setEnv(key, originalEnv[key]);
  }
});

describe('auth/config', () => {
  describe('getDefaultAdminUsername', () => {
    it('falls back to "admin" when unset', () => {
      setEnv('PROMPT_ADMIN_USERNAME', undefined);
      assert.equal(getDefaultAdminUsername(), 'admin');
    });

    it('falls back to "admin" when set to an empty/whitespace string', () => {
      setEnv('PROMPT_ADMIN_USERNAME', '   ');
      assert.equal(getDefaultAdminUsername(), 'admin');
    });

    it('uses the trimmed env value when set', () => {
      setEnv('PROMPT_ADMIN_USERNAME', '  alice  ');
      assert.equal(getDefaultAdminUsername(), 'alice');
    });
  });

  describe('getDefaultAdminPassword', () => {
    it('is null when unset (the first admin is made on the sign-in page)', () => {
      setEnv('PROMPT_ADMIN_PASSWORD', undefined);
      assert.equal(getDefaultAdminPassword(), null);
    });

    it('is null when set to an empty/whitespace string', () => {
      setEnv('PROMPT_ADMIN_PASSWORD', '   ');
      assert.equal(getDefaultAdminPassword(), null);
    });

    it('uses the trimmed env value when set', () => {
      setEnv('PROMPT_ADMIN_PASSWORD', '  hunter2  ');
      assert.equal(getDefaultAdminPassword(), 'hunter2');
    });
  });

  describe('isAuthExplicitlyEnabled', () => {
    it('is false when unset', () => {
      setEnv('PROMPT_AUTH_ENABLED', undefined);
      assert.equal(isAuthExplicitlyEnabled(), false);
    });

    it('is false for an unrecognized value', () => {
      setEnv('PROMPT_AUTH_ENABLED', 'nope');
      assert.equal(isAuthExplicitlyEnabled(), false);
    });

    it('is true for "1"', () => {
      setEnv('PROMPT_AUTH_ENABLED', '1');
      assert.equal(isAuthExplicitlyEnabled(), true);
    });

    it('is true for "true" case-insensitively and with surrounding whitespace', () => {
      setEnv('PROMPT_AUTH_ENABLED', '  TRUE  ');
      assert.equal(isAuthExplicitlyEnabled(), true);
    });

    it('is true for "yes"', () => {
      setEnv('PROMPT_AUTH_ENABLED', 'YES');
      assert.equal(isAuthExplicitlyEnabled(), true);
    });
  });

  describe('getSessionSecret', () => {
    it('generates and keeps a random secret when nothing is set', () => {
      setEnv('PROMPT_SESSION_SECRET', undefined);
      setEnv('PROMPT_API_TOKEN', undefined);
      const secret = getSessionSecret();
      assert.match(secret, /^[0-9a-f]{64}$/);
      assert.notEqual(secret, 'prompt-studio-dev-session-secret');
      assert.equal(getSessionSecret(), secret);
    });

    it('uses PROMPT_SESSION_SECRET when set', () => {
      setEnv('PROMPT_SESSION_SECRET', '  session-secret  ');
      setEnv('PROMPT_API_TOKEN', 'api-token');
      assert.equal(getSessionSecret(), 'session-secret');
    });

    it('falls back to PROMPT_API_TOKEN when PROMPT_SESSION_SECRET is unset', () => {
      setEnv('PROMPT_SESSION_SECRET', undefined);
      setEnv('PROMPT_API_TOKEN', '  api-token  ');
      assert.equal(getSessionSecret(), 'api-token');
    });

    it('falls back to PROMPT_API_TOKEN when PROMPT_SESSION_SECRET is blank', () => {
      setEnv('PROMPT_SESSION_SECRET', '   ');
      setEnv('PROMPT_API_TOKEN', 'api-token');
      assert.equal(getSessionSecret(), 'api-token');
    });
  });

  describe('constants', () => {
    it('exposes a stable session cookie name', () => {
      assert.equal(SESSION_COOKIE_NAME, 'prompt-studio-session');
    });

    it('exposes a 14-day session max age in seconds', () => {
      assert.equal(SESSION_MAX_AGE_SEC, 60 * 60 * 24 * 14);
    });
  });
});
