import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { resolveRequestUser } from '@/lib/auth/access';
import { SESSION_MAX_AGE_SEC } from '@/lib/auth/config';
import {
  listUserSessions,
  revokeAllUserSessions,
  revokeSession,
} from '@/lib/auth/session-registry';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return apiError('Sign in required.', 401);
  }
  const session = readSessionFromRequest(request);
  // A session's cookie dies SESSION_MAX_AGE_SEC after sign-in — older rows can't be used, so
  // listing them only buried the live ones (hundreds after a week of scripted logins).
  const liveAfter = Date.now() - SESSION_MAX_AGE_SEC * 1000;
  const sessions = listUserSessions(user.id)
    .filter(entry => entry.createdAt >= liveAfter || entry.id === session?.sessionId)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return apiJson({
    sessions,
    currentSessionId: session?.sessionId ?? null,
  });
}

export async function DELETE(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return apiError('Sign in required.', 401);
  }
  const body = (await request.json()) as { sessionId?: string; all?: boolean };
  const session = readSessionFromRequest(request);
  if (body.all) {
    const count = revokeAllUserSessions(user.id, session?.sessionId);
    return apiJson({ revoked: count });
  }
  if (!body.sessionId) {
    return apiError('sessionId or all=true required.', 400);
  }
  if (!revokeSession(user.id, body.sessionId)) {
    return apiError('Session not found.', 404);
  }
  return apiJson({ ok: true });
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['GET', 'DELETE'], '/api/auth/sessions');
}
