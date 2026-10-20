import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import {
  readStoredQueueExportConfig,
  toPublicQueueExportConfig,
  writeStoredQueueExportConfig,
  type StoredQueueExportConfig,
} from '@/lib/queue/export-store';

export const runtime = 'nodejs';

function requireAdmin(request: Request) {
  if (!isAuthEnabled()) {
    return null;
  }
  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user?.enabled || user.role !== 'admin') {
    return apiError('Admin sign-in required.', 401);
  }
  return null;
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }
  const stored = readStoredQueueExportConfig();
  return apiJson(toPublicQueueExportConfig(stored, Boolean(stored)));
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }
  try {
    const body = (await request.json().catch(() => ({}))) as StoredQueueExportConfig;
    const result = writeStoredQueueExportConfig(body);
    return apiJson({
      ...toPublicQueueExportConfig(result.config, result.persisted),
      persisted: result.persisted,
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Failed to save queue export directory.',
      400
    );
  }
}

export async function DELETE() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/settings/queue-export');
}
