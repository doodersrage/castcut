/**
 * Versioned stored shapes (FINISHING_PLAN Phase 2, 2026-11-13): a store's object carries
 * `schemaVersion`, and an ordered list of migrations brings an older copy up to the current one
 * as it loads. Before this, stored state had no version and every change relied on tolerant
 * normalisers alone.
 *
 * - `migrations[n]` takes a copy at version n to n + 1; the current version is their count.
 *   A copy without a stamp is version 0 (as every release before 3.18 wrote it).
 * - A copy stamped newer than this release knows (written by a newer release, then rolled back)
 *   is left exactly as it is: the normalisers read what they can, and nothing is downgraded.
 * - A migration must be safe to run on a copy it already migrated: a release older than the
 *   stamp may write fields back without changing it.
 *
 * Tools in the settings cache register here (Play's from its feature modules; storage never
 * imports a feature); other stores call migrateVersioned directly.
 */

export type StoredMigration = (value: Record<string, unknown>) => Record<string, unknown>;

export type StoredSchema = {
  /** In order: `migrations[n]` takes version n to n + 1. */
  migrations: readonly StoredMigration[];
};

export const SCHEMA_VERSION_FIELD = 'schemaVersion';

const isRec = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The stored copy's version: 0 when unstamped or unreadable. */
export function storedSchemaVersion(value: unknown): number {
  if (!isRec(value)) return 0;
  const at = value[SCHEMA_VERSION_FIELD];
  return typeof at === 'number' && Number.isInteger(at) && at > 0 ? at : 0;
}

/**
 * A stored object at the schema's current version: the same object when already there (or
 * newer), else migrated and stamped. Anything not an object is returned as it is.
 */
export function migrateVersioned<T>(value: T, schema: StoredSchema): T {
  if (!isRec(value)) return value;
  const current = schema.migrations.length;
  const from = storedSchemaVersion(value);
  if (from >= current) return value;
  let next: Record<string, unknown> = value;
  for (let at = from; at < current; at += 1) next = schema.migrations[at]!(next);
  return { ...next, [SCHEMA_VERSION_FIELD]: current } as T;
}

const toolSchemas = new Map<string, StoredSchema>();

/** A tool's stored shape in the settings cache (`tools.<tool>`). */
export function registerToolSchema(tool: string, schema: StoredSchema): void {
  toolSchemas.set(tool, schema);
}

/**
 * Every registered tool's settings at its current version. A tool not stored yet is left out
 * (its defaults are current); `changed` says the load should save the migrated copy.
 */
export function migrateToolSchemas<T extends object>(tools: T): { tools: T; changed: boolean } {
  let next: Record<string, unknown> | null = null;
  for (const [tool, schema] of toolSchemas) {
    const stored = (tools as Record<string, unknown>)[tool];
    if (!isRec(stored)) continue;
    const migrated = migrateVersioned(stored, schema);
    if (migrated === stored) continue;
    next ??= { ...(tools as Record<string, unknown>) };
    next[tool] = migrated;
  }
  return next ? { tools: next as T, changed: true } : { tools, changed: false };
}
