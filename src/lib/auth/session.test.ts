import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { createHmac } from 'node:crypto';

const TEST_SECRET = 'test-secret-key';
const TEST_MAX_AGE_SEC = 100;
const TEST_COOKIE_NAME = 'prompt-studio-session';

const getSessionSecret = mock.fn(() => TEST_SECRET);
const isSessionRevoked = mock.fn((_sessionId: string | undefined) => false);

mock.module('./config', {
  namedExports: {
    getSessionSecret,
    SESSION_COOKIE_NAME: TEST_COOKIE_NAME,
    SESSION_MAX_AGE_SEC: TEST_MAX_AGE_SEC,
  },
});
mock.module('./session-registry', {
  namedExports: { isSessionRevoked },
});

function sign(payload: string): string {
  return createHmac('sha256', TEST_SECRET).update(payload).digest('base64url');
}

function makeToken(
  payload: Record<string, unknown>,
  opts: { badSignature?: boolean } = {}
): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = opts.badSignature ? 'invalid-signature' : sign(encoded);
  return `${encoded}.${signature}`;
}

afterEach(() => {
  isSessionRevoked.mock.resetCalls();
  isSessionRevoked.mock.mockImplementation(() => false);
  getSessionSecret.mock.resetCalls();
});

describe('auth/session', async () => {
  const {
    createSessionToken,
    parseSessionToken,
    sessionCookieValue,
    clearSessionCookieValue,
    readSessionFromRequest,
    SESSION_COOKIE_NAME,
  } = await import('./session');

  const baseSessionInput = {
    userId: 'u1',
    username: 'alice',
    role: 'user' as const,
    sessionId: 's1',
  };

  describe('createSessionToken / parseSessionToken round trip', () => {
    it('round-trips a valid session', () => {
      const token = createSessionToken(baseSessionInput);
      const parsed = parseSessionToken(token);
      assert.ok(parsed);
      assert.equal(parsed?.userId, 'u1');
      assert.equal(parsed?.username, 'alice');
      assert.equal(parsed?.role, 'user');
      assert.equal(parsed?.sessionId, 's1');
      assert.equal(typeof parsed?.exp, 'number');
    });

    it('sets exp based on SESSION_MAX_AGE_SEC', () => {
      const before = Date.now();
      const token = createSessionToken(baseSessionInput);
      const parsed = parseSessionToken(token)!;
      assert.ok(parsed.exp >= before + TEST_MAX_AGE_SEC * 1000);
      assert.ok(parsed.exp <= Date.now() + TEST_MAX_AGE_SEC * 1000 + 1000);
    });

    it('produces a token with exactly one dot separating payload and signature', () => {
      const token = createSessionToken(baseSessionInput);
      assert.equal(token.split('.').length, 2);
    });
  });

  describe('parseSessionToken', () => {
    it('returns null for undefined/null/empty token', () => {
      assert.equal(parseSessionToken(undefined), null);
      assert.equal(parseSessionToken(null), null);
      assert.equal(parseSessionToken(''), null);
    });

    it('returns null for a malformed token missing the signature part', () => {
      assert.equal(parseSessionToken('just-a-payload'), null);
    });

    it('returns null for a tampered payload (invalid signature)', () => {
      const token = createSessionToken(baseSessionInput);
      const [payload] = token.split('.');
      assert.equal(parseSessionToken(`${payload}.wrongsignature`), null);
    });

    it('returns null when the signature was computed with a different secret', () => {
      const token = makeToken(
        { userId: 'u1', username: 'alice', role: 'user', exp: Date.now() + 100000 },
        { badSignature: true }
      );
      assert.equal(parseSessionToken(token), null);
    });

    it('returns null for an expired token', () => {
      const token = makeToken({
        userId: 'u1',
        username: 'alice',
        role: 'user',
        exp: Date.now() - 1000,
      });
      assert.equal(parseSessionToken(token), null);
    });

    it('returns null when the payload has an invalid role', () => {
      const token = makeToken({
        userId: 'u1',
        username: 'alice',
        role: 'superuser',
        exp: Date.now() + 100000,
      });
      assert.equal(parseSessionToken(token), null);
    });

    it('returns null when the payload is missing required fields', () => {
      const token = makeToken({ role: 'user', exp: Date.now() + 100000 });
      assert.equal(parseSessionToken(token), null);
    });

    it('returns null when the payload is not valid JSON', () => {
      const badPayload = Buffer.from('not json', 'utf8').toString('base64url');
      const token = `${badPayload}.${sign(badPayload)}`;
      assert.equal(parseSessionToken(token), null);
    });

    it('returns null when isSessionRevoked reports the session as revoked', () => {
      isSessionRevoked.mock.mockImplementation(() => true);
      const token = createSessionToken(baseSessionInput);
      assert.equal(parseSessionToken(token), null);
    });

    it('returns the session when isSessionRevoked reports false', () => {
      isSessionRevoked.mock.mockImplementation(() => false);
      const token = createSessionToken(baseSessionInput);
      assert.ok(parseSessionToken(token));
    });
  });

  describe('sessionCookieValue', () => {
    it('includes the cookie name, token, path, flags, and max-age', () => {
      const value = sessionCookieValue('abc.def');
      assert.match(value, new RegExp(`^${TEST_COOKIE_NAME}=abc\\.def;`));
      assert.match(value, /Path=\//);
      assert.match(value, /HttpOnly/);
      assert.match(value, /SameSite=Lax/);
      assert.match(value, new RegExp(`Max-Age=${TEST_MAX_AGE_SEC}`));
    });
  });

  describe('Secure follows the scheme the browser used', () => {
    it('is Secure behind a TLS proxy, not over plain HTTP', () => {
      const tls = new Request('http://127.0.0.1:47832/api/auth/login', {
        headers: { 'x-forwarded-proto': 'https' },
      });
      assert.match(sessionCookieValue('a.b', tls), /; Secure/);
      const lan = new Request('http://192.168.12.43:47832/api/auth/login');
      assert.doesNotMatch(sessionCookieValue('a.b', lan), /Secure/);
      assert.doesNotMatch(clearSessionCookieValue(lan), /Secure/);
      assert.match(sessionCookieValue('a.b', new Request('https://castcut.example.com/x')), /; Secure/);
    });
  });

  describe('clearSessionCookieValue', () => {
    it('clears the cookie with Max-Age=0', () => {
      const value = clearSessionCookieValue();
      assert.match(value, new RegExp(`^${TEST_COOKIE_NAME}=;`));
      assert.match(value, /Max-Age=0/);
    });
  });

  describe('readSessionFromRequest', () => {
    it('extracts and parses a valid session from the cookie header', () => {
      const token = createSessionToken(baseSessionInput);
      const request = new Request('https://example.com', {
        headers: { cookie: `${TEST_COOKIE_NAME}=${token}` },
      });
      const session = readSessionFromRequest(request);
      assert.equal(session?.userId, 'u1');
    });

    it('finds the session cookie among multiple cookies', () => {
      const token = createSessionToken(baseSessionInput);
      const request = new Request('https://example.com', {
        headers: { cookie: `foo=bar; ${TEST_COOKIE_NAME}=${token}; baz=qux` },
      });
      const session = readSessionFromRequest(request);
      assert.equal(session?.userId, 'u1');
    });

    it('returns null when there is no cookie header', () => {
      const request = new Request('https://example.com');
      assert.equal(readSessionFromRequest(request), null);
    });

    it('returns null when the session cookie is absent', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: 'foo=bar' },
      });
      assert.equal(readSessionFromRequest(request), null);
    });

    it('returns null when the cookie value is malformed', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: `${TEST_COOKIE_NAME}=not-a-valid-token` },
      });
      assert.equal(readSessionFromRequest(request), null);
    });
  });

  describe('SESSION_COOKIE_NAME re-export', () => {
    it('re-exports the cookie name from config', () => {
      assert.equal(SESSION_COOKIE_NAME, TEST_COOKIE_NAME);
    });
  });
});
