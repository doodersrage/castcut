import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  removeGalleryMediaLeftovers,
  scanGalleryMediaLeftovers,
} from '@/lib/gallery/media-cleanup-server';
import { clearViewDiskCache, measureViewDiskCache } from '@/lib/comfyui/view-cache';
import { isServerStorageEnabled } from '@/lib/server-storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function ids(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string' && ENTRY_ID.test(id))
    : [];
}

/**
 * Settings → Data → Clean up old copies.
 * POST { action: 'scan', browserIds } → leftovers + thumbnail cache size
 * POST { action: 'remove', browserIds, ids } → { removed, freedBytes } (a fresh scan decides)
 * POST { action: 'clear-view-cache' } → { freedBytes } (admin when sign-in is on: it is shared)
 */
export async function POST(request: Request) {
  let userId: string | null = null;
  let admin = true;
  if (isAuthEnabled()) {
    const user = resolveRequestUser(request);
    if (!user?.enabled) return apiError('Sign in required.', 401);
    userId = user.id;
    admin = user.role === 'admin';
  }
  let body: { action?: string; browserIds?: unknown; ids?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }

  if (body.action === 'clear-view-cache') {
    if (!admin) return apiError('Admin sign-in required to clear the shared thumbnail cache.', 403);
    return apiJson(clearViewDiskCache());
  }
  if (!isServerStorageEnabled()) {
    return apiError(
      'Server storage is off (PROMPT_DATA_DIR is not set): no kept copies here.',
      409
    );
  }
  const browserIds = ids(body.browserIds);
  if (body.action === 'scan') {
    const scan = await scanGalleryMediaLeftovers({ userId, browserIds });
    return apiJson({
      ...scan,
      viewCacheBytes: measureViewDiskCache(),
      canClearViewCache: admin,
    });
  }
  if (body.action === 'remove') {
    return apiJson(await removeGalleryMediaLeftovers({ userId, browserIds, ids: ids(body.ids) }));
  }
  return apiError('Unknown action.', 400);
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/gallery/media/cleanup');
}
