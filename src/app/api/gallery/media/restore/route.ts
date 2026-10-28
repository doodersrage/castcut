import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { copyGalleryEntryMedia } from '@/lib/gallery/media-cleanup-server';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';

export const runtime = 'nodejs';

/**
 * A Gallery entry restored from the trash (M10 T2): POST { from, to } copies the kept media of the
 * deleted entry `from` to the restored entry `to` → { copied }. Only the caller's own folder.
 */
export async function POST(request: Request) {
  let userId: string | null = null;
  if (isAuthEnabled()) {
    const user = resolveRequestUser(request);
    if (!user?.enabled) return apiError('Sign in required.', 401);
    userId = user.id;
  }
  let body: { from?: unknown; to?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  if (typeof body.from !== 'string' || typeof body.to !== 'string') {
    return apiError('from and to are entry ids.', 400);
  }
  if (!isServerStorageEnabled()) return apiJson({ copied: false });
  return apiJson({ copied: copyGalleryEntryMedia({ userId, from: body.from, to: body.to }) });
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/gallery/media/restore');
}
