import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolvePromptDataDir } from '@/lib/prompt/data-paths';
import { importLegacyJsonFiles } from './json-import';

const SCHEMA_VERSION = '1';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key)
);

CREATE TABLE IF NOT EXISTS gallery_entries (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  prompt_id TEXT,
  queued_at INTEGER,
  completed_at INTEGER,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, id)
);
CREATE INDEX IF NOT EXISTS idx_gallery_owner_sort
  ON gallery_entries (owner, completed_at DESC, queued_at DESC);

CREATE TABLE IF NOT EXISTS gallery_deleted_ids (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (owner, id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id, revoked);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (hash);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log (at DESC);

CREATE TABLE IF NOT EXISTS llm_usage (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  user_id TEXT,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_at ON llm_usage (at DESC);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  user_id TEXT PRIMARY KEY,
  captured_at INTEGER NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_history (
  user_id TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (user_id, captured_at)
);

-- Screenplays, one row per script (M6 V6: out of the whole-blob tool settings). A deleted one
-- keeps its row as a tombstone (json NULL, removed_at set), so a device that has not caught up
-- cannot bring it back.
CREATE TABLE IF NOT EXISTS scene_scripts (
  scope TEXT NOT NULL,
  id TEXT NOT NULL,
  cast_id TEXT,
  json TEXT,
  updated_at INTEGER NOT NULL,
  removed_at INTEGER,
  PRIMARY KEY (scope, id)
);

-- The graph each render was submitted with, as ComfyUI received it (M7 T4): the exact replay
-- of a take on any device, and after ComfyUI restarts (its history lives in memory).
CREATE TABLE IF NOT EXISTS submitted_graphs (
  prompt_id TEXT PRIMARY KEY,
  comfy_url TEXT,
  model TEXT,
  graph TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS submitted_graphs_created ON submitted_graphs (created_at);

CREATE TABLE IF NOT EXISTS collab_rooms (
  project_id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

type CachedDb = {
  path: string;
  db: DatabaseSync;
};

let cached: CachedDb | null = null;

/** Absolute path of the studio SQLite file (WAL sidecars live beside it). */
export function studioDbPath(): string {
  const dir = resolvePromptDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'studio.sqlite');
}

export function studioDbFileExists(): boolean {
  try {
    return fs.existsSync(studioDbPath());
  } catch {
    return false;
  }
}

function applyPragmas(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
}

function migrateSchema(db: DatabaseSync): void {
  db.exec(SCHEMA_SQL);
  db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)').run(
    'schema_version',
    SCHEMA_VERSION
  );
}

/** Open (or reuse) the process-wide studio database. Imports leftover JSON once per path. */
export function getStudioDb(): DatabaseSync {
  const dbPath = studioDbPath();
  if (cached && cached.path === dbPath) {
    return cached.db;
  }
  closeStudioDb();
  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  applyPragmas(db);
  migrateSchema(db);
  cached = { path: dbPath, db };
  importLegacyJsonFiles();
  return db;
}

export function closeStudioDb(): void {
  if (!cached) {
    return;
  }
  try {
    cached.db.close();
  } catch {
    // Already closed or never opened.
  }
  cached = null;
}

export function withStudioTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getStudioDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures after a failed BEGIN.
    }
    throw error;
  }
}

export function getSchemaMeta(key: string): string | null {
  const row = getStudioDb().prepare('SELECT value FROM schema_meta WHERE key = ?').get(key) as
    { value?: string } | undefined;
  return typeof row?.value === 'string' ? row.value : null;
}

export function setSchemaMeta(key: string, value: string): void {
  getStudioDb()
    .prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)')
    .run(key, value);
}

export function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

export function decodeJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}
