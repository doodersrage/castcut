import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { writeUserExportSnapshot } from '@/lib/storage/user-server-storage';
import { encryptExportPayload } from '@/lib/storage/export-encryption';
import { readUserServerStorage } from '@/lib/storage/user-server-storage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return apiError('Sign in required.', 401);
  }
  const body = (await request.json()) as { passphrase?: string };
  const history = readUserServerStorage<unknown>(user.id, 'prompt-history');
  const gallery = readUserServerStorage<unknown>(user.id, 'comfy-gallery');
  const payload = {
    exportedAt: Date.now(),
    username: user.username,
    history,
    gallery,
  };

  if (body.passphrase?.trim()) {
    const encrypted = encryptExportPayload(JSON.stringify(payload), body.passphrase.trim());
    const filename = writeUserExportSnapshot(user.id, user.username, {
      encrypted: true,
      payload: encrypted,
    });
    return apiJson({ filename, encrypted: true });
  }

  const filename = writeUserExportSnapshot(user.id, user.username, payload);
  return apiJson({ filename, encrypted: false });
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['POST'], '/api/storage/export');
}
