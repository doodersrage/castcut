import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { clipDrift } from '@/lib/clip/drift-server';
import { parseLlmRequestOptions, type LlmRequestBody } from '@/lib/llm/request-options';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/drift');
}

/**
 * POST { clipUrl, entryId?, …LLM options } → { checked, drifted?, reasons? }: whether the clip's
 * last frame left the shot its first frame set up (new people, a close-up, another shot).
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const clipUrl = typeof body.clipUrl === 'string' ? body.clipUrl.trim().slice(0, 2000) : '';
  if (!clipUrl) return apiError('clipUrl is required.', 400);
  const drift = await clipDrift({
    url: clipUrl,
    entryId: typeof body.entryId === 'string' ? body.entryId.trim().slice(0, 200) : undefined,
    llm: parseLlmRequestOptions(body as LlmRequestBody),
    userId: user?.id ?? null,
    requestOrigin: new URL(request.url).origin,
  });
  return apiJson(drift ? { checked: true, ...drift } : { checked: false });
}
