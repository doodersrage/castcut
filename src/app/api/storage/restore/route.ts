import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { readUserServerStorage } from '@/lib/storage/user-server-storage';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';
import type { UserStorageNamespace } from '@/lib/storage/user-server-storage';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isServerStorageEnabled()) {
    return apiError('Server storage is disabled.', 400);
  }
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return apiError('Sign in required.', 401);
  }

  const url = new URL(request.url);
  const namespace = url.searchParams.get('namespace') as UserStorageNamespace | null;
  if (
    !namespace ||
    !['settings-cache', 'prompt-history', 'comfy-gallery', 'gallery-deleted-ids'].includes(
      namespace
    )
  ) {
    return apiError('Valid namespace query param required.', 400);
  }

  const data = readUserServerStorage<unknown>(user.id, namespace);
  return apiJson({ namespace, data, readOnly: true });
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['GET'], '/api/storage/restore');
}
