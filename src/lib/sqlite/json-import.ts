import fs from 'node:fs';
import path from 'node:path';
import { resolvePromptAuthDir, resolvePromptDataDir } from '@/lib/prompt/data-paths';
import { STORAGE_NAMESPACES, type StorageNamespace } from '@/lib/storage/namespaces';
import { upsertGalleryEntries, writeGalleryDeletedIds } from './gallery';
import { kvKeyExists, kvScopeForUser, writeKv } from './kv';
import { getSchemaMeta, setSchemaMeta } from './studio-db';
import {
  countUsers,
  loadAnalyticsHistory,
  loadAnalyticsSnapshots,
  loadApiKeys,
  loadAuditLog,
  loadCollabRoom,
  loadGroups,
  loadLlmUsage,
  loadPasswordResetTokens,
  loadSessions,
  loadSharedPresets,
  loadSharedProjects,
  saveAnalyticsDocument,
  saveApiKeys,
  saveAuditLog,
  saveCollabRoom,
  saveGroups,
  saveLlmUsage,
  savePasswordResetTokens,
  saveSessions,
  saveSharedPresets,
  saveSharedProjects,
  saveUsers,
} from './tables';

function readJsonFile(filePath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function markImported(relPath: string): void {
  setSchemaMeta(`imported:${relPath}`, String(Date.now()));
}

function wasImported(relPath: string): boolean {
  return Boolean(getSchemaMeta(`imported:${relPath}`));
}

function renameImported(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.renameSync(filePath, `${filePath}.imported`);
    }
  } catch {
    // Leave the original in place if rename fails (e.g. cross-device).
  }
}

function importFile(relPath: string, filePath: string, apply: (data: unknown) => boolean): void {
  if (wasImported(relPath) || !fs.existsSync(filePath)) {
    return;
  }
  const data = readJsonFile(filePath);
  if (data === null) {
    return;
  }
  if (apply(data)) {
    markImported(relPath);
    renameImported(filePath);
  }
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

/** One-shot import of leftover JSON files into SQLite. Safe to call on every open. */
export function importLegacyJsonFiles(): void {
  importAuthJson();
  importDataRootJson();
  importUserNamespaceJson();
}

function importAuthJson(): void {
  const authDir = resolvePromptAuthDir();

  importFile('auth/users.json', path.join(authDir, 'users.json'), data => {
    if (countUsers() > 0) {
      return true;
    }
    const users = asRecord(data)?.users;
    if (!Array.isArray(users)) {
      return false;
    }
    saveUsers(users);
    return true;
  });

  importFile('auth/groups.json', path.join(authDir, 'groups.json'), data => {
    if (loadGroups().length > 0) {
      return true;
    }
    const groups = asRecord(data)?.groups;
    if (!Array.isArray(groups)) {
      return false;
    }
    saveGroups(groups);
    return true;
  });

  importFile('auth/sessions.json', path.join(authDir, 'sessions.json'), data => {
    if (loadSessions().length > 0) {
      return true;
    }
    const sessions = asRecord(data)?.sessions;
    if (!Array.isArray(sessions)) {
      return false;
    }
    saveSessions(sessions);
    return true;
  });

  importFile('auth/api-keys.json', path.join(authDir, 'api-keys.json'), data => {
    if (loadApiKeys().length > 0) {
      return true;
    }
    const keys = asRecord(data)?.keys;
    if (!Array.isArray(keys)) {
      return false;
    }
    saveApiKeys(keys);
    return true;
  });

  importFile(
    'auth/password-reset-tokens.json',
    path.join(authDir, 'password-reset-tokens.json'),
    data => {
      if (loadPasswordResetTokens().length > 0) {
        return true;
      }
      const tokens = asRecord(data)?.tokens;
      if (!Array.isArray(tokens)) {
        return false;
      }
      savePasswordResetTokens(tokens);
      return true;
    }
  );

  importFile('auth/audit-log.json', path.join(authDir, 'audit-log.json'), data => {
    if (loadAuditLog().length > 0) {
      return true;
    }
    const entries = asRecord(data)?.entries;
    if (!Array.isArray(entries)) {
      return false;
    }
    saveAuditLog(entries);
    return true;
  });

  importFile('auth/llm-usage.json', path.join(authDir, 'llm-usage.json'), data => {
    if (loadLlmUsage().length > 0) {
      return true;
    }
    const entries = asRecord(data)?.entries;
    if (!Array.isArray(entries)) {
      return false;
    }
    saveLlmUsage(entries);
    return true;
  });

  importFile(
    'auth/analytics-snapshots.json',
    path.join(authDir, 'analytics-snapshots.json'),
    data => {
      const existingSnaps = loadAnalyticsSnapshots();
      if (Object.keys(existingSnaps).length > 0) {
        return true;
      }
      const record = asRecord(data);
      saveAnalyticsDocument({
        snapshots: (record?.snapshots as typeof existingSnaps) ?? {},
        history: (record?.history as ReturnType<typeof loadAnalyticsHistory>) ?? {},
      });
      return true;
    }
  );
}

function importDataRootJson(): void {
  const dataDir = resolvePromptDataDir();

  for (const namespace of STORAGE_NAMESPACES) {
    importFile(namespace, path.join(dataDir, `${namespace}.json`), data => {
      applyNamespaceImport('global', namespace, data);
      return true;
    });
  }

  importFile('email-config.json', path.join(dataDir, 'email-config.json'), data => {
    if (kvKeyExists('global', 'email-config')) {
      return true;
    }
    writeKv('global', 'email-config', data);
    return true;
  });

  importFile('queue-export.json', path.join(dataDir, 'queue-export.json'), data => {
    if (kvKeyExists('global', 'queue-export')) {
      return true;
    }
    writeKv('global', 'queue-export', data);
    return true;
  });

  importFile('collab-rooms.json', path.join(dataDir, 'collab-rooms.json'), data => {
    const rooms = asRecord(data);
    if (!rooms) {
      return false;
    }
    for (const [projectId, room] of Object.entries(rooms)) {
      if (loadCollabRoom(projectId)) {
        continue;
      }
      saveCollabRoom(projectId, room as Parameters<typeof saveCollabRoom>[1]);
    }
    return true;
  });

  importFile('shared-projects.json', path.join(dataDir, 'shared-projects.json'), data => {
    if (loadSharedProjects().length > 0) {
      return true;
    }
    const projects = asRecord(data)?.projects;
    if (!Array.isArray(projects)) {
      return false;
    }
    saveSharedProjects(projects);
    return true;
  });

  importFile('shared-presets.json', path.join(dataDir, 'shared-presets.json'), data => {
    if (loadSharedPresets().length > 0) {
      return true;
    }
    const presets = asRecord(data)?.presets;
    if (!Array.isArray(presets)) {
      return false;
    }
    saveSharedPresets(presets);
    return true;
  });
}

function applyNamespaceImport(scope: string, namespace: StorageNamespace, data: unknown): void {
  const owner = scope === 'global' ? '' : scope.replace(/^user:/, '');
  if (namespace === 'comfy-gallery') {
    upsertGalleryEntries(owner, data);
    return;
  }
  if (namespace === 'gallery-deleted-ids') {
    writeGalleryDeletedIds(owner, data);
    return;
  }
  if (kvKeyExists(scope, namespace)) {
    return;
  }
  writeKv(scope, namespace, data);
}

function importUserNamespaceJson(): void {
  const usersDir = path.join(resolvePromptDataDir(), 'users');
  let userIds: string[] = [];
  try {
    userIds = fs.readdirSync(usersDir).filter(name => {
      try {
        return fs.statSync(path.join(usersDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return;
  }

  for (const userId of userIds) {
    const scope = kvScopeForUser(userId);
    for (const namespace of STORAGE_NAMESPACES) {
      const relPath = `users/${userId}/${namespace}.json`;
      importFile(relPath, path.join(usersDir, userId, `${namespace}.json`), data => {
        applyNamespaceImport(scope, namespace, data);
        return true;
      });
    }
  }
}

export function legacyAuthUsersPath(): string {
  return path.join(resolvePromptAuthDir(), 'users.json');
}

export function legacyAuthUsersImportedPath(): string {
  return `${legacyAuthUsersPath()}.imported`;
}
