import { NextResponse } from 'next/server';
import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { readIdentityFile } from '@/lib/gallery/media-store';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';

export const runtime = 'nodejs';

function resolveMediaUserId(request: Request): string | null {
  if (!isAuthEnabled()) {
    return null;
  }
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return null;
  }
  return user.id;
}

export async function GET(request: Request) {
  if (!isServerStorageEnabled()) {
    return apiError('Server storage is disabled.', 404);
  }
  const userId = resolveMediaUserId(request);
  if (isAuthEnabled() && !userId) {
    return apiError('Sign in required.', 401);
  }
  const file = readIdentityFile({ userId });
  if (!file) {
    return apiError('Identity image not found.', 404);
  }
  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
    },
  });
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/gallery/media/identity');
}
