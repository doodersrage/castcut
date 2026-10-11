import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { createSessionToken, sessionCookieValue } from '@/lib/auth/session';
import { parsePendingLoginToken } from '@/lib/auth/pending-login';
import { registerSession, touchSession } from '@/lib/auth/session-registry';
import { findUserById, listAllowedFeatures, toPublicUser } from '@/lib/auth/store';
import { verifyTotp } from '@/lib/auth/totp';

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
  if (!body.code || !verifyTotp(user.totpSecret, body.code)) {
    return apiError('Invalid authenticator code.', 401);
  }

  const sessionId = registerSession({
    userId: user.id,
    username: user.username,
    userAgent: request.headers.get('user-agent') ?? undefined,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
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
