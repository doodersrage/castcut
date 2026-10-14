import { apiError, apiJson } from '@/lib/api/response';
import { createSessionToken, sessionCookieValue } from '@/lib/auth/session';
import { registerSession, touchSession } from '@/lib/auth/session-registry';
import {
  createFirstAdmin,
  listAllowedFeatures,
  needsFirstAdmin,
  toPublicUser,
} from '@/lib/auth/store';
import { finishSetup, setupCodeMatches } from '@/lib/auth/first-admin-setup';
import { loginRetryAfterSec, recordLoginFailure } from '@/lib/auth/login-throttle';
import { rateLimitClientKey } from '@/lib/api-rate-limit';
import { rememberPublicAppOrigin } from '@/lib/public-app-origin';

export const runtime = 'nodejs';

/** The first admin account (no PROMPT_ADMIN_PASSWORD, no account yet), signed in straight away. */
export async function POST(request: Request) {
  if (!needsFirstAdmin()) {
    return apiError('An account already exists — sign in instead.', 409);
  }
  let body: { username?: string; password?: string; setupCode?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  // The setup code is a password too: same throttle as sign-in.
  const attempt = { username: '(setup)', client: rateLimitClientKey(request) };
  const wait = loginRetryAfterSec(attempt);
  if (wait > 0) {
    return apiJson(
      { error: `Too many wrong setup codes. Try again in ${Math.ceil(wait / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(wait) } }
    );
  }
  if (!setupCodeMatches(body.setupCode)) {
    recordLoginFailure(attempt);
    return apiError('That setup code is not right — it is in the server log.', 401);
  }
  let user;
  try {
    user = createFirstAdmin({ username: body.username ?? '', password: body.password ?? '' });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not create the account.', 400);
  }
  finishSetup();
  rememberPublicAppOrigin(request, user.role);
  const client = rateLimitClientKey(request);
  const sessionId = registerSession({
    userId: user.id,
    username: user.username,
    userAgent: request.headers.get('user-agent') ?? undefined,
    ip: client === 'local' ? undefined : client,
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
