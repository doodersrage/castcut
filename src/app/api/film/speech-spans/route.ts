import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { speechSpans } from '@/lib/audio/speech-spans-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_SHOTS = 120;

export function GET() {
  return apiMethodNotAllowed(['POST'], '/api/film/speech-spans');
}

/** POST { shots: [{ key, url, entryId?, spoken? }] } → { spans: { key: { startSec, endSec } | null } }. */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: { shots?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const shots = (Array.isArray(body.shots) ? body.shots : []).slice(0, MAX_SHOTS).flatMap(entry => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const key = typeof record.key === 'string' ? record.key.slice(0, 200) : '';
    const url = typeof record.url === 'string' ? record.url.trim().slice(0, 2000) : '';
    const entryId = typeof record.entryId === 'string' ? record.entryId.slice(0, 200) : '';
    // The line it says: its span ends where the line could, not at the clip's last sound.
    const spoken = typeof record.spoken === 'string' ? record.spoken.trim().slice(0, 600) : '';
    return key && url
      ? [{ key, url, ...(entryId ? { entryId } : {}), ...(spoken ? { spoken } : {}) }]
      : [];
  });
  if (!shots.length) return apiError('Include at least one shot with key and url.', 400);
  const spans = await speechSpans(shots, {
    userId: user?.id ?? null,
    requestOrigin: new URL(request.url).origin,
  });
  return apiJson({ spans });
}
