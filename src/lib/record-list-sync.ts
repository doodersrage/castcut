/**
 * Cross-device merge for the lists in studio-extras that are made of separate records — the Cast
 * and Story's saved stories. Pure (no browser storage): the server runs it on every studio-extras
 * push, the browser on its startup pull.
 *
 * Before (2026-10-17): studio-extras synced as one blob and a device that already had data kept
 * its own copy ("local wins") and pushed it whole, so the desktop and the phone each showed their
 * own Cast and either could overwrite the other's edits on the server.
 *
 * Rules, per id: the newest copy of a record wins (updatedAt); a deletion wins over copies saved
 * before it and loses to one saved after it (the same id made again). A deletion from before
 * deletion times were kept (no time) always wins.
 */

type Timed = { id: string; updatedAt?: number };

export type CastSyncFields<C extends Timed = Timed> = {
  characters?: C[];
  /** Cast ids deleted on some device (character-os removedIds). */
  characterRemovedIds?: string[];
  /** When each id was deleted (ms) — absent for deletions made before times were kept. */
  characterRemovedAt?: Record<string, number>;
};

export type MergedCast<C extends Timed> = {
  characters: C[];
  characterRemovedIds: string[];
  characterRemovedAt: Record<string, number>;
};

function newestById<T extends Timed>(lists: Array<T[] | undefined>): Map<string, T> {
  const byId = new Map<string, T>();
  for (const list of lists) {
    for (const entry of list ?? []) {
      if (!entry || typeof entry.id !== 'string' || !entry.id) continue;
      const existing = byId.get(entry.id);
      if (!existing || (entry.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
        byId.set(entry.id, entry);
      }
    }
  }
  return byId;
}

/** Both devices' Cast and deletions → one Cast, newest first. `local` wins exact ties. */
export function mergeCastSync<C extends Timed>(
  server: CastSyncFields<C>,
  local: CastSyncFields<C>
): MergedCast<C> {
  const removedAt: Record<string, number> = {};
  for (const source of [server.characterRemovedAt, local.characterRemovedAt]) {
    for (const [id, at] of Object.entries(source ?? {})) {
      if (Number.isFinite(at)) removedAt[id] = Math.max(removedAt[id] ?? 0, at);
    }
  }
  const removed = new Set(
    [...(server.characterRemovedIds ?? []), ...(local.characterRemovedIds ?? [])].filter(Boolean)
  );
  const byId = newestById([server.characters, local.characters]);
  for (const id of removed) {
    const record = byId.get(id);
    const at = removedAt[id];
    if (record && at !== undefined && (record.updatedAt ?? 0) > at) {
      // Made again after it was deleted: the record stays, the deletion goes.
      removed.delete(id);
      delete removedAt[id];
    } else {
      byId.delete(id);
    }
  }
  for (const id of Object.keys(removedAt)) {
    if (!removed.has(id)) delete removedAt[id];
  }
  return {
    characters: [...byId.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    characterRemovedIds: [...removed],
    characterRemovedAt: removedAt,
  };
}

/** Union of two story lists by id, newest copy of each; null when neither side has any. */
export function mergeStoryLists<S extends Timed>(
  local: S[] | undefined,
  server: S[] | undefined
): S[] | null {
  if (!local?.length && !server?.length) return null;
  return [...newestById([server, local]).values()].sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  );
}

type ListFields = CastSyncFields & { roleplayLibrary?: Timed[] };

/**
 * `incoming` with its Cast and stories merged with `stored` (everything else as `incoming` has
 * it). Used by the server on a studio-extras push and by the browser on its startup pull.
 */
export function withMergedRecordLists<T extends ListFields>(incoming: T, stored: ListFields): T {
  if (!stored || typeof stored !== 'object') return incoming;
  const hasCast =
    Array.isArray(incoming.characters) ||
    Array.isArray(stored.characters) ||
    Boolean(incoming.characterRemovedIds?.length || stored.characterRemovedIds?.length);
  const cast = hasCast ? mergeCastSync(stored, incoming) : null;
  const stories = mergeStoryLists(incoming.roleplayLibrary, stored.roleplayLibrary);
  return {
    ...incoming,
    ...(cast ?? {}),
    ...(stories ? { roleplayLibrary: stories } : {}),
  };
}
