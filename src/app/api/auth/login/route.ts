import { apiError, apiJson } from '@/lib/api/response';
import { createSessionToken, sessionCookieValue } from '@/lib/auth/session';
import { createPendingLoginToken } from '@/lib/auth/pending-login';
import { registerSession, touchSession } from '@/lib/auth/session-registry';
import {
  toPublicUser,
  verifyUserCredentials,
  isAuthEnabled,
  listAllowedFeatures,
  findUserById,
} from '@/lib/auth/store';

import {
  loginRetryAfterSec,
  recordLoginFailure,
  recordLoginSuccess,
} from '@/lib/auth/login-throttle';
import { rateLimitClientKey } from '@/lib/server/api-rate-limit';
import { rememberPublicAppOrigin } from '@/lib/server/public-app-origin';

export const runtime = 'nodejs';

function tooManyAttempts(retryAfterSec: number) {
  return apiJson(
    {
      error: `Too many failed sign-in attempts. Try again in ${Math.ceil(retryAfterSec / 60)} min.`,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  );
}

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return apiError('Authentication is disabled.', 400);
  }

  let body: { username?: string; password?: string; totpCode?: string; pendingToken?: string };
  try {
    body = (await request.json()) as {
      username?: string;
      password?: string;
      totpCode?: string;
      pendingToken?: string;
    };
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  if (body.pendingToken && body.totpCode) {
    const { parsePendingLoginToken } = await import('@/lib/auth/pending-login');
    const pending = parsePendingLoginToken(body.pendingToken);
    if (!pending) {
      return apiError('Login session expired.', 401);
    }
    const user = findUserById(pending.userId);
    if (!user?.enabled || !user.totpSecret) {
      return apiError('Invalid login session.', 401);
    }
    const attempt = { username: user.username, client: rateLimitClientKey(request) };
    const wait = loginRetryAfterSec(attempt);
    if (wait > 0) return tooManyAttempts(wait);
    const { verifyTotp } = await import('@/lib/auth/totp');
    if (!verifyTotp(user.totpSecret, body.totpCode)) {
      recordLoginFailure(attempt);
      return apiError('Invalid authenticator code.', 401);
    }
    recordLoginSuccess(user.username);
    rememberPublicAppOrigin(request, user.role);
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
      { user: toPublicUser(user), allowedFeatures: listAllowedFeatures(user) },
      { headers: { 'Set-Cookie': sessionCookieValue(token, request) } }
    );
  }

  const username = body.username?.trim();
  const password = body.password ?? '';
  if (!username || !password) {
    return apiError('Username and password are required.', 400);
  }
  const attempt = { username, client: rateLimitClientKey(request) };
  const wait = loginRetryAfterSec(attempt);
  if (wait > 0) return tooManyAttempts(wait);

  const user = verifyUserCredentials(username, password);
  if (!user) {
    recordLoginFailure(attempt);
    return apiError('Invalid username or password.', 401);
  }

  if (user.totpEnabled && user.totpSecret) {
    return apiJson({
      requiresTotp: true,
      pendingToken: createPendingLoginToken(user.id),
    });
  }

  recordLoginSuccess(user.username);
  rememberPublicAppOrigin(request, user.role);

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
    {
      headers: {
        'Set-Cookie': sessionCookieValue(token, request),
      },
    }
  );
}
