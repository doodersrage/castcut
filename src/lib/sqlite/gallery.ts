import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import { decodeJson, encodeJson, getStudioDb, withStudioTransaction } from './studio-db';
import { isGalleryEntryHidden } from '@/lib/gallery-adult-check';

/** Soft cap on gallery rows returned through the blob `/api/storage` API. */
export const MAX_SERVER_GALLERY_READ = 20_000;

function asEntries(data: unknown): ComfyGalleryEntry[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter((entry): entry is ComfyGalleryEntry => {
    return Boolean(entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id);
  });
}

function asIds(data: unknown): string[] {
  if (Array.isArray(data)) {
    return data.map(id => (typeof id === 'string' ? id.trim() : '')).filter(Boolean);
  }
  if (data && typeof data === 'object' && Array.isArray((data as { ids?: unknown }).ids)) {
    return (data as { ids: unknown[] }).ids
      .map(id => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean);
  }
  return [];
}

export function upsertGalleryEntries(owner: string, data: unknown): void {
  const entries = asEntries(data);
  if (entries.length === 0) {
    return;
  }
  const now = Date.now();
  withStudioTransaction(db => {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO gallery_entries
        (owner, id, prompt_id, queued_at, completed_at, json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const drop = db.prepare(`DELETE FROM gallery_entries WHERE owner = ? AND id = ?`);
    for (const entry of entries) {
      // Held or withheld by the adult-appearance gate: the server keeps no copy.
      if (isGalleryEntryHidden(entry)) {
        drop.run(owner, entry.id);
        continue;
      }
      stmt.run(
        owner,
        entry.id,
        entry.promptId ?? null,
        entry.queuedAt ?? null,
        entry.completedAt ?? null,
        encodeJson(entry),
        now
      );
    }
  });
}

export function readGalleryEntries(owner: string): ComfyGalleryEntry[] {
  const rows = getStudioDb()
    .prepare(
      `SELECT json FROM gallery_entries
       WHERE owner = ?
       ORDER BY COALESCE(completed_at, queued_at, 0) DESC
       LIMIT ?`
    )
    .all(owner, MAX_SERVER_GALLERY_READ) as Array<{ json?: string }>;
  const entries: ComfyGalleryEntry[] = [];
  for (const row of rows) {
    if (typeof row.json !== 'string') {
      continue;
    }
    try {
      const parsed = decodeJson<ComfyGalleryEntry>(row.json);
      if (parsed?.id && !isGalleryEntryHidden(parsed)) {
        entries.push(parsed);
      }
    } catch {
      // Skip corrupt rows.
    }
  }
  return entries;
}

export function countGalleryEntries(owner: string): number {
  const row = getStudioDb()
    .prepare('SELECT COUNT(*) AS count FROM gallery_entries WHERE owner = ?')
    .get(owner) as { count?: number | bigint } | undefined;
  return Number(row?.count ?? 0);
}

export function removeGalleryEntriesByPromptIds(owner: string, promptIds: string[]): number {
  const ids = [...new Set(promptIds.map(id => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return 0;
  }
  return withStudioTransaction(db => {
    const stmt = db.prepare('DELETE FROM gallery_entries WHERE owner = ? AND prompt_id = ?');
    let removed = 0;
    for (const promptId of ids) {
      const result = stmt.run(owner, promptId);
      removed += Number(result.changes);
    }
    return removed;
  });
}

export function readGalleryDeletedIds(owner: string): string[] {
  const rows = getStudioDb()
    .prepare('SELECT id FROM gallery_deleted_ids WHERE owner = ? ORDER BY deleted_at ASC')
    .all(owner) as Array<{ id?: string }>;
  return rows.map(row => row.id).filter((id): id is string => Boolean(id));
}

export function writeGalleryDeletedIds(owner: string, data: unknown): void {
  const ids = [...new Set(asIds(data))];
  const now = Date.now();
  withStudioTransaction(db => {
    db.prepare('DELETE FROM gallery_deleted_ids WHERE owner = ?').run(owner);
    const insert = db.prepare(
      'INSERT INTO gallery_deleted_ids (owner, id, deleted_at) VALUES (?, ?, ?)'
    );
    const remove = db.prepare('DELETE FROM gallery_entries WHERE owner = ? AND id = ?');
    for (const id of ids) {
      insert.run(owner, id, now);
      remove.run(owner, id);
    }
  });
}
