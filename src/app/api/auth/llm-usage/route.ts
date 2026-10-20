import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { findUserById } from '@/lib/auth/store';
import { listLlmUsage, summarizeLlmUsage } from '@/lib/llm/usage-log';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = resolveRequestUser(request);
  const targetUserId = url.searchParams.get('userId') ?? undefined;

  if (targetUserId && user?.role !== 'admin') {
    return apiError('Admin required.', 403);
  }

  const userId = targetUserId ?? user?.id;
  if (!userId) {
    return apiError('Sign in required.', 401);
  }

  const target = findUserById(userId);
  return apiJson({
    summary: summarizeLlmUsage(userId),
    entries: listLlmUsage({ userId, limit: 100 }),
    user: target ? { id: target.id, username: target.username } : null,
  });
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['GET'], '/api/auth/llm-usage');
}
