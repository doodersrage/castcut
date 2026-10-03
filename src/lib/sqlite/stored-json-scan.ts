import { getStudioDb } from './studio-db';

/**
 * Every saved JSON row — settings, studio extras (Cast, Day, Story), gallery entries — of every
 * user, one at a time. Used to find which ComfyUI input files anything still names.
 */
export function forEachStoredJsonText(visit: (json: string) => void): void {
  const db = getStudioDb();
  for (const sql of ['SELECT json FROM kv', 'SELECT json FROM gallery_entries']) {
    for (const row of db.prepare(sql).iterate() as Iterable<{ json?: unknown }>) {
      if (typeof row.json === 'string') visit(row.json);
    }
  }
}
