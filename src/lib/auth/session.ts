import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthSession } from './types';
import { isSessionRevoked } from './session-registry';
import { getSessionSecret, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SEC } from './config';

function encodePayload(session: AuthSession): string {
  return Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
}

function decodePayload(raw: string): AuthSession | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as AuthSession;
    if (
      !parsed ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.username !== 'string' ||
      (parsed.role !== 'admin' && parsed.role !== 'user' && parsed.role !== 'viewer') ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(input: Omit<AuthSession, 'exp'>): string {
  const session: AuthSession = {
    ...input,
    exp: Date.now() + SESSION_MAX_AGE_SEC * 1000,
  };
  const payload = encodePayload(session);
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined | null): AuthSession | null {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  const session = decodePayload(payload);
  if (!session || session.exp <= Date.now()) {
    return null;
  }

  if (isSessionRevoked(session.sessionId)) {
    return null;
  }

  return session;
}

/**
 * Secure only when the browser came over HTTPS (X-Forwarded-Proto from a TLS proxy, or the URL):
 * a plain-HTTP visit — the machine's LAN address, an HTTP reverse proxy — drops a Secure cookie,
 * so the login never stuck. Without a request, production stays Secure as before.
 */
function cookieSecure(request?: Request): string {
  if (!request) return process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  let https = forwarded === 'https';
  if (!forwarded) {
    try {
      https = new URL(request.url).protocol === 'https:';
    } catch {
      https = false;
    }
  }
  return https ? '; Secure' : '';
}

export function sessionCookieValue(token: string, request?: Request): string {
  const secure = cookieSecure(request);
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}${secure}`;
}

export function clearSessionCookieValue(request?: Request): string {
  const secure = cookieSecure(request);
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionFromRequest(request: Request): AuthSession | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      continue;
    }
    return parseSessionToken(trimmed.slice(SESSION_COOKIE_NAME.length + 1));
  }

  return null;
}

export { SESSION_COOKIE_NAME };
