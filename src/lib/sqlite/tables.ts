import type { AuthGroup, AuthUser } from '@/lib/auth/types';
import type { RegisteredSession } from '@/lib/auth/session-registry';
import type { UserApiKey } from '@/lib/auth/api-keys';
import type { AuditLogEntry } from '@/lib/auth/audit-log';
import type { LlmUsageEntry } from '@/lib/llm/usage-log';
import type { UserAnalyticsSnapshot } from '@/lib/user/analytics';
import type { CollabRoomState } from '@/lib/storage/collab-store';
import type { SharedProject } from '@/lib/storage/shared-projects-store';
import type { SharedPresetEntry } from '@/lib/storage/shared-preset-store';
import { decodeJson, encodeJson, getStudioDb, withStudioTransaction } from './studio-db';

type PasswordResetToken = {
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
};

function parseRows<T>(rows: Array<{ json?: string }>): T[] {
  const result: T[] = [];
  for (const row of rows) {
    if (typeof row.json !== 'string') {
      continue;
    }
    try {
      result.push(decodeJson<T>(row.json));
    } catch {
      // Skip corrupt rows.
    }
  }
  return result;
}

export function loadUsers(): AuthUser[] {
  return parseRows<AuthUser>(
    getStudioDb().prepare('SELECT json FROM users').all() as Array<{ json?: string }>
  );
}

export function countUsers(): number {
  const row = getStudioDb().prepare('SELECT COUNT(*) AS count FROM users').get() as
    { count?: number | bigint } | undefined;
  return Number(row?.count ?? 0);
}

export function saveUsers(users: AuthUser[]): void {
  const now = Date.now();
  withStudioTransaction(db => {
    db.exec('DELETE FROM users');
    const stmt = db.prepare(
      'INSERT INTO users (id, username, json, updated_at) VALUES (?, ?, ?, ?)'
    );
    for (const user of users) {
      stmt.run(user.id, user.username, encodeJson(user), user.updatedAt ?? now);
    }
  });
}

export function loadGroups(): AuthGroup[] {
  return parseRows<AuthGroup>(
    getStudioDb().prepare('SELECT json FROM groups').all() as Array<{ json?: string }>
  );
}

export function saveGroups(groups: AuthGroup[]): void {
  const now = Date.now();
  withStudioTransaction(db => {
    db.exec('DELETE FROM groups');
    const stmt = db.prepare('INSERT INTO groups (id, json, updated_at) VALUES (?, ?, ?)');
    for (const group of groups) {
      stmt.run(group.id, encodeJson(group), group.updatedAt ?? now);
    }
  });
}

export function loadSessions(): RegisteredSession[] {
  return parseRows<RegisteredSession>(
    getStudioDb().prepare('SELECT json FROM sessions ORDER BY last_seen_at DESC').all() as Array<{
      json?: string;
    }>
  );
}

export function saveSessions(sessions: RegisteredSession[]): void {
  withStudioTransaction(db => {
    db.exec('DELETE FROM sessions');
    const stmt = db.prepare(
      'INSERT INTO sessions (id, user_id, revoked, last_seen_at, json) VALUES (?, ?, ?, ?, ?)'
    );
    for (const session of sessions) {
      stmt.run(
        session.id,
        session.userId,
        session.revoked ? 1 : 0,
        session.lastSeenAt,
        encodeJson(session)
      );
    }
  });
}

export function upsertSession(session: RegisteredSession): void {
  getStudioDb()
    .prepare(
      'INSERT OR REPLACE INTO sessions (id, user_id, revoked, last_seen_at, json) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      session.id,
      session.userId,
      session.revoked ? 1 : 0,
      session.lastSeenAt,
      encodeJson(session)
    );
}

export function trimSessions(max: number): void {
  getStudioDb()
    .prepare(
      `DELETE FROM sessions WHERE id IN (
         SELECT id FROM sessions ORDER BY last_seen_at DESC LIMIT -1 OFFSET ?
       )`
    )
    .run(max);
}

export function loadApiKeys(): UserApiKey[] {
  return parseRows<UserApiKey>(
    getStudioDb().prepare('SELECT json FROM api_keys').all() as Array<{ json?: string }>
  );
}

export function saveApiKeys(keys: UserApiKey[]): void {
  withStudioTransaction(db => {
    db.exec('DELETE FROM api_keys');
    const stmt = db.prepare(
      'INSERT INTO api_keys (id, user_id, hash, enabled, json) VALUES (?, ?, ?, ?, ?)'
    );
    for (const key of keys) {
      stmt.run(key.id, key.userId, key.hash, key.enabled ? 1 : 0, encodeJson(key));
    }
  });
}

export function findApiKeyByHash(hash: string): UserApiKey | null {
  const row = getStudioDb()
    .prepare('SELECT json FROM api_keys WHERE hash = ? AND enabled = 1')
    .get(hash) as { json?: string } | undefined;
  if (typeof row?.json !== 'string') {
    return null;
  }
  try {
    return decodeJson<UserApiKey>(row.json);
  } catch {
    return null;
  }
}

export function loadPasswordResetTokens(): PasswordResetToken[] {
  return parseRows<PasswordResetToken>(
    getStudioDb().prepare('SELECT json FROM password_reset_tokens').all() as Array<{
      json?: string;
    }>
  );
}

export function savePasswordResetTokens(tokens: PasswordResetToken[]): void {
  withStudioTransaction(db => {
    db.exec('DELETE FROM password_reset_tokens');
    const stmt = db.prepare(
      'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, json) VALUES (?, ?, ?, ?)'
    );
    for (const token of tokens) {
      stmt.run(token.tokenHash, token.userId, token.expiresAt, encodeJson(token));
    }
  });
}

export function loadAuditLog(): AuditLogEntry[] {
  return parseRows<AuditLogEntry>(
    getStudioDb().prepare('SELECT json FROM audit_log ORDER BY at DESC').all() as Array<{
      json?: string;
    }>
  );
}

export function saveAuditLog(entries: AuditLogEntry[]): void {
  withStudioTransaction(db => {
    db.exec('DELETE FROM audit_log');
    const stmt = db.prepare('INSERT INTO audit_log (id, at, json) VALUES (?, ?, ?)');
    for (const entry of entries) {
      stmt.run(entry.id, entry.at, encodeJson(entry));
    }
  });
}

export function loadLlmUsage(): LlmUsageEntry[] {
  return parseRows<LlmUsageEntry>(
    getStudioDb().prepare('SELECT json FROM llm_usage ORDER BY at DESC').all() as Array<{
      json?: string;
    }>
  );
}

export function saveLlmUsage(entries: LlmUsageEntry[]): void {
  withStudioTransaction(db => {
    db.exec('DELETE FROM llm_usage');
    const stmt = db.prepare('INSERT INTO llm_usage (id, at, user_id, json) VALUES (?, ?, ?, ?)');
    for (const entry of entries) {
      stmt.run(entry.id, entry.at, entry.userId ?? null, encodeJson(entry));
    }
  });
}

export function loadAnalyticsSnapshots(): Record<string, UserAnalyticsSnapshot> {
  const snapshots: Record<string, UserAnalyticsSnapshot> = {};
  const rows = getStudioDb()
    .prepare('SELECT user_id, json FROM analytics_snapshots')
    .all() as Array<{ user_id?: string; json?: string }>;
  for (const row of rows) {
    if (typeof row.user_id !== 'string' || typeof row.json !== 'string') {
      continue;
    }
    try {
      snapshots[row.user_id] = decodeJson<UserAnalyticsSnapshot>(row.json);
    } catch {
      // Skip corrupt rows.
    }
  }
  return snapshots;
}

export function loadAnalyticsHistory(): Record<string, UserAnalyticsSnapshot[]> {
  const history: Record<string, UserAnalyticsSnapshot[]> = {};
  const rows = getStudioDb()
    .prepare('SELECT user_id, json FROM analytics_history ORDER BY captured_at DESC')
    .all() as Array<{ user_id?: string; json?: string }>;
  for (const row of rows) {
    if (typeof row.user_id !== 'string' || typeof row.json !== 'string') {
      continue;
    }
    try {
      const snapshot = decodeJson<UserAnalyticsSnapshot>(row.json);
      const list = history[row.user_id] ?? [];
      list.push(snapshot);
      history[row.user_id] = list;
    } catch {
      // Skip corrupt rows.
    }
  }
  return history;
}

export function saveAnalyticsDocument(input: {
  snapshots: Record<string, UserAnalyticsSnapshot>;
  history: Record<string, UserAnalyticsSnapshot[]>;
}): void {
  withStudioTransaction(db => {
    db.exec('DELETE FROM analytics_snapshots');
    db.exec('DELETE FROM analytics_history');
    const snapStmt = db.prepare(
      'INSERT INTO analytics_snapshots (user_id, captured_at, json) VALUES (?, ?, ?)'
    );
    const histStmt = db.prepare(
      'INSERT INTO analytics_history (user_id, captured_at, json) VALUES (?, ?, ?)'
    );
    for (const [userId, snapshot] of Object.entries(input.snapshots)) {
      snapStmt.run(userId, snapshot.capturedAt, encodeJson(snapshot));
    }
    for (const [userId, entries] of Object.entries(input.history)) {
      for (const snapshot of entries) {
        histStmt.run(userId, snapshot.capturedAt, encodeJson(snapshot));
      }
    }
  });
}

export function loadCollabRoom(projectId: string): CollabRoomState | null {
  const row = getStudioDb()
    .prepare('SELECT json FROM collab_rooms WHERE project_id = ?')
    .get(projectId) as { json?: string } | undefined;
  if (typeof row?.json !== 'string') {
    return null;
  }
  try {
    return decodeJson<CollabRoomState>(row.json);
  } catch {
    return null;
  }
}

export function saveCollabRoom(projectId: string, room: CollabRoomState): void {
  getStudioDb()
    .prepare('INSERT OR REPLACE INTO collab_rooms (project_id, json, updated_at) VALUES (?, ?, ?)')
    .run(projectId, encodeJson(room), Date.now());
}

export function loadSharedProjects(): SharedProject[] {
  const data = (
    getStudioDb()
      .prepare("SELECT json FROM kv WHERE scope = 'global' AND key = 'shared-projects'")
      .get() as { json?: string } | undefined
  )?.json;
  if (!data) {
    return [];
  }
  try {
    const parsed = decodeJson<{ projects?: SharedProject[] } | SharedProject[]>(data);
    return Array.isArray(parsed) ? parsed : (parsed.projects ?? []);
  } catch {
    return [];
  }
}

export function saveSharedProjects(projects: SharedProject[]): void {
  getStudioDb()
    .prepare(
      "INSERT OR REPLACE INTO kv (scope, key, json, updated_at) VALUES ('global', 'shared-projects', ?, ?)"
    )
    .run(encodeJson({ version: 1, projects }), Date.now());
}

export function loadSharedPresets(): SharedPresetEntry[] {
  const data = (
    getStudioDb()
      .prepare("SELECT json FROM kv WHERE scope = 'global' AND key = 'shared-presets'")
      .get() as { json?: string } | undefined
  )?.json;
  if (!data) {
    return [];
  }
  try {
    const parsed = decodeJson<{ presets?: SharedPresetEntry[] } | SharedPresetEntry[]>(data);
    return Array.isArray(parsed) ? parsed : (parsed.presets ?? []);
  } catch {
    return [];
  }
}

export function saveSharedPresets(presets: SharedPresetEntry[]): void {
  getStudioDb()
    .prepare(
      "INSERT OR REPLACE INTO kv (scope, key, json, updated_at) VALUES ('global', 'shared-presets', ?, ?)"
    )
    .run(encodeJson({ version: 1, presets }), Date.now());
}
