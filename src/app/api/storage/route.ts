import {
  isServerStorageEnabled,
  listServerStorageNamespaces,
  readServerStorage,
  writeServerStorage,
  type StorageNamespace,
} from '@/lib/storage/server-storage';
import { isStorageNamespace } from '@/lib/storage/namespaces';
import { withMergedRecordLists } from '@/lib/storage/record-list-sync';
import { withMergedSettingsRecords } from '@/lib/storage/tool-record-merge';
import { storageFingerprint } from '@/lib/storage/sync';
import {
  readUserServerStorage,
  writeUserServerStorage,
  USER_STORAGE_NAMESPACES,
  type UserStorageNamespace,
} from '@/lib/storage/user-server-storage';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { isAuthEnabled } from '@/lib/auth/store';
import { resolveStorageUser } from '@/lib/storage/storage-user';
import { kvScopeForUser } from '@/lib/sqlite/kv';
import { moveSettingsScriptsToTable } from '@/lib/sqlite/scene-scripts';

export const runtime = 'nodejs';

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

/**
 * The Scene scripts in a settings copy moved to their own table (M6 V6, sqlite/scene-scripts.ts):
 * scripts sync one at a time now. An older client still sends them in the settings, and a copy
 * stored before the move still holds them.
 */
function withoutSettingsScripts(namespace: StorageNamespace, data: unknown, userId: string | null) {
  if (namespace !== 'settings-cache') return data;
  return moveSettingsScriptsToTable(kvScopeForUser(isAuthEnabled() ? userId : null), data);
}

function readScopedStorage(namespace: StorageNamespace, userId: string | null): unknown {
  const stored = readStoredNamespace(namespace, userId);
  const moved = withoutSettingsScripts(namespace, stored, userId);
  if (moved !== stored) writeScopedStorage(namespace, moved, userId);
  return moved;
}

function readStoredNamespace(namespace: StorageNamespace, userId: string | null): unknown {
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
      // studio-extras: the Cast and stories merge record by record with what the server has
      // (record-list-sync.ts) — one device's whole-list push replaced the other's Cast edits.
      const data =
        body.namespace === 'studio-extras' && body.data && typeof body.data === 'object'
          ? withMergedRecordLists(
              body.data as Record<string, unknown>,
              (readScopedStorage(body.namespace, userId) ?? {}) as Record<string, unknown>
            )
          : body.namespace === 'settings-cache' && body.data && typeof body.data === 'object'
            ? withMergedSettingsRecords(
                withoutSettingsScripts(body.namespace, body.data, userId) as Record<
                  string,
                  unknown
                >,
                readScopedStorage(body.namespace, userId)
              )
            : body.data;
      const userScoped = writeScopedStorage(body.namespace, data, userId);
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
