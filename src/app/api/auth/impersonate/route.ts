import { apiError, apiJson } from '@/lib/api/response';
import { appendAuditLog } from '@/lib/auth/audit-log';
import { createSessionToken, readSessionFromRequest, sessionCookieValue } from '@/lib/auth/session';
import { findUserById, isAuthEnabled, toPublicUser } from '@/lib/auth/store';

export const runtime = 'nodejs';

function requireAdmin(request: Request) {
  if (!isAuthEnabled()) {
    return { error: apiError('Authentication is disabled.', 400) };
  }
  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user || user.role !== 'admin' || !user.enabled) {
    return { error: apiError('Admin access required.', 403) };
  }
  return { user, session };
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if ('error' in admin) {
    return admin.error;
  }

  let body: { userId?: string };
  try {
    body = (await request.json()) as { userId?: string };
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  const target = body.userId ? findUserById(body.userId) : null;
  if (!target || !target.enabled) {
    return apiError('Target user not found.', 404);
  }

  const token = createSessionToken({
    userId: target.id,
    username: target.username,
    role: target.role,
    impersonatorId: admin.user.id,
  });

  appendAuditLog({
    actorUserId: admin.user.id,
    actorUsername: admin.user.username,
    action: 'user.impersonate',
    target: target.id,
    details: target.username,
  });

  return apiJson(
    { user: toPublicUser(target), impersonating: true },
    { headers: { 'Set-Cookie': sessionCookieValue(token, request) } }
  );
}

export async function DELETE(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session?.impersonatorId) {
    return apiError('Not impersonating.', 400);
  }

  const admin = findUserById(session.impersonatorId);
  if (!admin || !admin.enabled || admin.role !== 'admin') {
    return apiError('Invalid impersonation session.', 400);
  }

  const token = createSessionToken({
    userId: admin.id,
    username: admin.username,
    role: admin.role,
  });

  appendAuditLog({
    actorUserId: admin.id,
    actorUsername: admin.username,
    action: 'user.impersonate.end',
    target: session.userId,
  });

  return apiJson(
    { user: toPublicUser(admin), impersonating: false },
    { headers: { 'Set-Cookie': sessionCookieValue(token, request) } }
  );
}
