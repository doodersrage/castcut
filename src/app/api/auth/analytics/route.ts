import { apiError, apiJson } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled, listUsers } from '@/lib/auth/store';
import {
  getUserAnalyticsSnapshot,
  listAllAnalyticsHistory,
  listUserAnalyticsHistory,
  listUserAnalyticsSnapshots,
  saveUserAnalyticsSnapshot,
} from '@/lib/auth/analytics-store';
import type { UserAnalyticsSnapshot } from '@/lib/user/analytics';

export const runtime = 'nodejs';

function resolveSessionUser(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return null;
  }
  return findUserById(session.userId);
}

export async function GET(request: Request) {
  if (!isAuthEnabled()) {
    return apiJson({ snapshots: [] as UserAnalyticsSnapshot[], authEnabled: false });
  }

  const user = resolveSessionUser(request);
  if (!user || !user.enabled) {
    return apiError('Sign in required.', 401);
  }

  if (user.role === 'admin') {
    const userId = new URL(request.url).searchParams.get('userId')?.trim();
    if (userId) {
      return apiJson({
        authEnabled: true,
        snapshot: getUserAnalyticsSnapshot(userId),
        users: listUsers().map(entry => ({ id: entry.id, username: entry.username })),
      });
    }
    return apiJson({
      authEnabled: true,
      snapshots: listUserAnalyticsSnapshots(),
      history: listAllAnalyticsHistory(),
      users: listUsers().map(entry => ({ id: entry.id, username: entry.username })),
    });
  }

  return apiJson({
    authEnabled: true,
    snapshot: getUserAnalyticsSnapshot(user.id),
    history: listUserAnalyticsHistory(user.id),
  });
}

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return apiError('Authentication is disabled.', 400);
  }

  const user = resolveSessionUser(request);
  if (!user || !user.enabled) {
    return apiError('Sign in required.', 401);
  }

  let body: UserAnalyticsSnapshot;
  try {
    body = (await request.json()) as UserAnalyticsSnapshot;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  if (body.userId !== user.id) {
    return apiError('Cannot sync analytics for another user.', 403);
  }

  saveUserAnalyticsSnapshot({
    ...body,
    username: user.username,
    capturedAt: Date.now(),
  });

  return apiJson({ ok: true });
}
