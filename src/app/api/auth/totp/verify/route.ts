import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { createSessionToken, sessionCookieValue } from '@/lib/auth/session';
import { parsePendingLoginToken } from '@/lib/auth/pending-login';
import { registerSession, touchSession } from '@/lib/auth/session-registry';
import { findUserById, listAllowedFeatures, toPublicUser } from '@/lib/auth/store';
import { verifyTotp } from '@/lib/auth/totp';
import {
  loginRetryAfterSec,
  recordLoginFailure,
  recordLoginSuccess,
} from '@/lib/auth/login-throttle';
import { rateLimitClientKey } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json()) as { pendingToken?: string; code?: string };
  const pending = parsePendingLoginToken(body.pendingToken ?? '');
  if (!pending) {
    return apiError('Login session expired. Sign in again.', 401);
  }
  const user = findUserById(pending.userId);
  if (!user?.enabled || !user.totpSecret) {
    return apiError('Invalid login session.', 401);
  }
  // Same throttle as the password step: a 6-digit code is guessable without one.
  const attempt = { username: user.username, client: rateLimitClientKey(request) };
  const wait = loginRetryAfterSec(attempt);
  if (wait > 0) {
    return apiJson(
      { error: `Too many failed sign-in attempts. Try again in ${Math.ceil(wait / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(wait) } }
    );
  }
  if (!body.code || !verifyTotp(user.totpSecret, body.code)) {
    recordLoginFailure(attempt);
    return apiError('Invalid authenticator code.', 401);
  }
  recordLoginSuccess(user.username);

  const sessionId = registerSession({
    userId: user.id,
    username: user.username,
    userAgent: request.headers.get('user-agent') ?? undefined,
    ip: rateLimitClientKey(request) === 'local' ? undefined : rateLimitClientKey(request),
  });
  touchSession(sessionId);

  const token = createSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    sessionId,
  });

  return apiJson(
    {
      user: toPublicUser(user),
      allowedFeatures: listAllowedFeatures(user),
    },
    { headers: { 'Set-Cookie': sessionCookieValue(token, request) } }
  );
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['POST'], '/api/auth/totp/verify');
}
