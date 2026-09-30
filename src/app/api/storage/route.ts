import {
  isServerStorageEnabled,
  listServerStorageNamespaces,
  readServerStorage,
  writeServerStorage,
  type StorageNamespace,
} from '@/lib/server-storage';
import { isStorageNamespace } from '@/lib/storage-namespaces';
import { storageFingerprint } from '@/lib/storage-sync';
import {
  readUserServerStorage,
  writeUserServerStorage,
  USER_STORAGE_NAMESPACES,
  type UserStorageNamespace,
} from '@/lib/user-server-storage';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';

export const runtime = 'nodejs';

function resolveStorageUser(request: Request): string | null {
  if (!isAuthEnabled()) {
    return null;
  }
  const session = readSessionFromRequest(request);
  if (!session) {
    return null;
  }
  const user = findUserById(session.userId);
  if (!user?.enabled) {
    return null;
  }
  return user.id;
}

function isUserNamespace(namespace: StorageNamespace): namespace is UserStorageNamespace {
  return USER_STORAGE_NAMESPACES.includes(namespace as UserStorageNamespace);
}

function writeScopedStorage(namespace: StorageNamespace, data: unknown, userId: string | null) {
  if (isUserNamespace(namespace)) {
    if (isAuthEnabled()) {
      if (!userId) {
        throw Object.assign(new Error('Sign in required for user storage sync.'), { status: 401 });
      }
      writeUserServerStorage(userId, namespace, data);
      return true;
    }
    // Auth off — persist globally so PROMPT_DATA_DIR still backs full sync.
    writeServerStorage(namespace, data);
    return false;
  }
  writeServerStorage(namespace, data);
  return false;
}

function readScopedStorage(namespace: StorageNamespace, userId: string | null): unknown {
  if (isUserNamespace(namespace)) {
    if (isAuthEnabled()) {
      if (!userId) {
        throw Object.assign(new Error('Sign in required for user storage sync.'), { status: 401 });
      }
      return readUserServerStorage(userId, namespace);
    }
    return readServerStorage(namespace);
  }
  return readServerStorage(namespace);
}

export async function GET() {
  if (!isServerStorageEnabled()) {
    return apiJson({
      enabled: false,
      namespaces: listServerStorageNamespaces(),
      userScoped: true,
    });
  }

  return apiJson({
    enabled: true,
    namespaces: listServerStorageNamespaces(),
    userScoped: true,
  });
}

export async function POST(request: Request) {
  if (!isServerStorageEnabled()) {
    return apiError('Server storage disabled. Set PROMPT_DATA_DIR.', 503);
  }

  try {
    const body = (await request.json()) as {
      namespace?: StorageNamespace;
      data?: unknown;
    };
    if (!isStorageNamespace(body.namespace) || body.data === undefined) {
      return apiError('namespace and data are required.', 400);
    }

    const userId = resolveStorageUser(request);
    try {
      const userScoped = writeScopedStorage(body.namespace, body.data, userId);
      return apiJson({
        ok: true,
        namespace: body.namespace,
        userScoped,
      });
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 401) {
        return apiError('Sign in required for user storage sync.', 401);
      }
      throw error;
    }
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Storage write failed.', 500);
  }
}

export async function PUT(request: Request) {
  if (!isServerStorageEnabled()) {
    return apiError('Server storage disabled. Set PROMPT_DATA_DIR.', 503);
  }

  const { searchParams } = new URL(request.url);
  const namespace = searchParams.get('namespace');
  if (!isStorageNamespace(namespace)) {
    return apiError('namespace query parameter is required.', 400);
  }

  const userId = resolveStorageUser(request);
  let data: unknown = null;
  let userScoped = false;

  try {
    userScoped = isUserNamespace(namespace) && isAuthEnabled();
    data = readScopedStorage(namespace, userId);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 401) {
      return apiError('Sign in required for user storage sync.', 401);
    }
    throw error;
  }

  // The client already holds this exact copy — skip resending it (the gallery is ~9 MB).
  const ifMatch = searchParams.get('ifMatch');
  if (
    ifMatch &&
    data !== null &&
    data !== undefined &&
    storageFingerprint(namespace, data) === ifMatch
  ) {
    return apiJson({ namespace, unchanged: true, userScoped });
  }

  // Empty namespaces are a normal first-run / post-migration state — not 404.
  return apiJson({ namespace, data, userScoped });
}

export async function DELETE() {
  return apiMethodNotAllowed(['GET', 'POST', 'PUT'], '/api/storage');
}
