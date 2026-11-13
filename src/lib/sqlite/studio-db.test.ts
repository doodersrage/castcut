import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { hashPassword } from '../auth/password';
import { DatabaseSync } from 'node:sqlite';
import {
  closeStudioDb,
  getSchemaMeta,
  getStudioDb,
  STUDIO_DB_VERSION,
  studioDbPath,
  studioDbVersion,
} from './studio-db';
import { readKv, writeKv } from './kv';
import { countGalleryEntries, readGalleryEntries, upsertGalleryEntries } from './gallery';
import { readNamespaceStorage, writeNamespaceStorage } from './namespace-storage';
import { countUsers, loadUsers } from './tables';

function galleryEntry(id: string, prompt: string, queuedAt: number) {
  return {
    id,
    promptId: `p-${id}`,
    prompt,
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'success' as const,
    queuedAt,
  };
}

describe('studio sqlite', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';

  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-sqlite-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });

  afterEach(() => {
    closeStudioDb();
    if (previousDataDir === undefined) {
      delete process.env.PROMPT_DATA_DIR;
    } else {
      process.env.PROMPT_DATA_DIR = previousDataDir;
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('opens WAL mode at studio.sqlite', () => {
    const db = getStudioDb();
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string };
    assert.equal(row.journal_mode?.toLowerCase(), 'wal');
    assert.equal(fs.existsSync(studioDbPath()), true);
  });

  it('round-trips kv documents', () => {
    writeKv('global', 'settings-cache', { theme: 'dark' });
    assert.deepEqual(readKv('global', 'settings-cache'), { theme: 'dark' });
  });

  it('stores gallery as rows and keeps extras on a partial upsert', () => {
    upsertGalleryEntries('', [galleryEntry('a', 'one', 1), galleryEntry('b', 'two', 2)]);
    writeNamespaceStorage('comfy-gallery', [galleryEntry('b', 'two-updated', 2)]);
    const entries = readGalleryEntries('');
    assert.equal(countGalleryEntries(''), 2);
    assert.equal(entries.find(entry => entry.id === 'a')?.prompt, 'one');
    assert.equal(entries.find(entry => entry.id === 'b')?.prompt, 'two-updated');
  });

  it('reads user gallery merged with global scheduled stills', () => {
    upsertGalleryEntries('', [galleryEntry('scheduled', 'batch', 1)]);
    upsertGalleryEntries('user-1', [galleryEntry('mine', 'local', 2)]);
    const entries = readNamespaceStorage<Array<{ id: string }>>('comfy-gallery', 'user-1') ?? [];
    assert.deepEqual(
      entries.map(entry => entry.id).sort(),
      ['mine', 'scheduled']
    );
  });

  it('tombstones remove gallery rows', () => {
    writeNamespaceStorage('comfy-gallery', [
      galleryEntry('keep', 'keep', 1),
      galleryEntry('gone', 'gone', 2),
    ]);
    writeNamespaceStorage('gallery-deleted-ids', ['gone']);
    const remaining = readNamespaceStorage<Array<{ id: string }>>('comfy-gallery') ?? [];
    assert.deepEqual(
      remaining.map(entry => entry.id).sort(),
      ['keep']
    );
  });

  it('imports leftover users.json into sqlite', () => {
    const authDir = path.join(tempDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    const passwordHash = hashPassword('imported-secret');
    fs.writeFileSync(
      path.join(authDir, 'users.json'),
      JSON.stringify({
        version: 1,
        users: [
          {
            id: 'user-imported',
            username: 'imported',
            passwordHash,
            role: 'admin',
            groupIds: [],
            blockedFeatures: [],
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
      'utf8'
    );

    getStudioDb();
    assert.equal(countUsers(), 1);
    assert.equal(loadUsers()[0]?.username, 'imported');
    assert.equal(fs.existsSync(path.join(authDir, 'users.json')), false);
    assert.equal(fs.existsSync(path.join(authDir, 'users.json.imported')), true);
  });
});

describe('the studio database’s schema version (user_version)', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';

  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-sqlite-version-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });

  afterEach(() => {
    closeStudioDb();
    if (previousDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = previousDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** A database as an older release left it, opened outside the app. */
  function seed(sql: string): void {
    fs.mkdirSync(path.dirname(studioDbPath()), { recursive: true });
    const db = new DatabaseSync(studioDbPath());
    db.exec(sql);
    db.close();
  }

  it('a new database is at the current version', () => {
    const db = getStudioDb();
    assert.equal(studioDbVersion(db), STUDIO_DB_VERSION);
    assert.equal(getSchemaMeta('schema_version'), String(STUDIO_DB_VERSION));
  });

  it('a database made before versions (3.17: user_version 0) is stamped, its rows kept', () => {
    seed(`
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO schema_meta VALUES ('schema_version', '1');
      CREATE TABLE kv (scope TEXT NOT NULL, key TEXT NOT NULL, json TEXT NOT NULL,
        updated_at INTEGER NOT NULL, PRIMARY KEY (scope, key));
      INSERT INTO kv VALUES ('default', 'settings-cache', '{"tools":{"scene":{"scenes":[]}}}', 5);
    `);
    const db = getStudioDb();
    assert.equal(studioDbVersion(db), STUDIO_DB_VERSION);
    assert.deepEqual(readKv('default', 'settings-cache'), { tools: { scene: { scenes: [] } } });
    // Tables it didn't have yet are made.
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
      name: string;
    }>;
    assert.ok(tables.some(table => table.name === 'scene_scripts'));
  });

  it('a database a newer release wrote is left at its version, not stepped down', () => {
    seed(`
      PRAGMA user_version = ${STUDIO_DB_VERSION + 4};
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO schema_meta VALUES ('schema_version', '${STUDIO_DB_VERSION + 4}');
    `);
    const db = getStudioDb();
    assert.equal(studioDbVersion(db), STUDIO_DB_VERSION + 4);
    assert.equal(getSchemaMeta('schema_version'), String(STUDIO_DB_VERSION + 4));
    // This release's tables are there to use.
    writeKv('default', 'k', { a: 1 });
    assert.deepEqual(readKv('default', 'k'), { a: 1 });
  });
});
