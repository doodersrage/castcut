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

/**
 * The other user-made lists in studio-extras, merged the same way (2026-10-17): saved outfits,
 * saved shoes, My poses, My pose packs, dress plates and the workflow library, and the
 * Director's saved directions. Each list's own
 * write stamps `updatedAt` on entries it changed and records a deletion time for entries it
 * dropped (stampListChanges, record-tombstones.ts); a write that comes from sync does neither.
 */
export type RecordListSpec = {
  field: string;
  /** The entry's id within its list. */
  idOf: (entry: Record<string, unknown>) => string;
  /** Entries that are "the same thing" under different ids (one photo, one pack name). */
  sameAs?: (entry: Record<string, unknown>) => string;
};

const str = (value: unknown) => (typeof value === 'string' ? value : '');

export const RECORD_LISTS: readonly RecordListSpec[] = [
  {
    field: 'fittingSavedGarments',
    idOf: e => str(e.id),
    sameAs: e => str(e.imageFilename),
  },
  { field: 'savedFootwear', idOf: e => str(e.id), sameAs: e => str(e.imageFilename) },
  { field: 'myPoses', idOf: e => str(e.id) },
  { field: 'myPosePacks', idOf: e => str(e.id), sameAs: e => str(e.name).toLowerCase() },
  { field: 'dressPlates', idOf: e => str(e.key) },
  { field: 'comfyWorkflowFiles', idOf: e => str(e.id) },
  // Your decisions about continuity findings (checks/finding-decisions.ts), by finding id.
  { field: 'continuityDecisions', idOf: e => str(e.id) },
  // Location records (location/records.ts, M8 T1).
  { field: 'locations', idOf: e => str(e.id) },
  // The trash (gallery/trash.ts, M10 T2).
  { field: 'trash', idOf: e => str(e.id) },
  // The Director's saved directions: one name per Cast member.
  {
    field: 'directorDirections',
    idOf: e => str(e.id),
    sameAs: e => `${str(e.castId)}\n${str(e.name).toLowerCase()}`,
  },
];

/** The RECORD_LISTS entry for a studio-extras field. */
export function recordListSpec(field: string): RecordListSpec {
  const spec = RECORD_LISTS.find(entry => entry.field === field);
  if (!spec) throw new Error(`No record list ${field}`);
  return spec;
}

/** When an entry last changed: its edit stamp, else when it was saved / made. */
export function recordTime(entry: Record<string, unknown>): number {
  for (const key of ['updatedAt', 'savedAt', 'at', 'createdAt']) {
    const value = entry[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

/** Deletion times per list field, per id. */
export type RecordTombstones = Record<string, Record<string, number>>;

export function mergeTombstones(
  a: RecordTombstones | undefined,
  b: RecordTombstones | undefined
): RecordTombstones {
  const out: RecordTombstones = {};
  for (const source of [a, b]) {
    for (const [field, ids] of Object.entries(source ?? {})) {
      if (!ids || typeof ids !== 'object') continue;
      const into = (out[field] ??= {});
      for (const [id, at] of Object.entries(ids)) {
        if (Number.isFinite(at)) into[id] = Math.max(into[id] ?? 0, at);
      }
    }
  }
  return out;
}

/**
 * One list from both sides: newest copy per id, deletions applied by time (an entry saved after
 * its deletion stays), then one entry per `sameAs` key (the newest). Newest first.
 */
export function mergeRecordList(
  spec: RecordListSpec,
  server: unknown,
  local: unknown,
  tombstones: Record<string, number> | undefined
): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const list of [server, local]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const id = spec.idOf(record);
      if (!id) continue;
      const existing = byId.get(id);
      if (!existing || recordTime(record) >= recordTime(existing)) byId.set(id, record);
    }
  }
  for (const [id, at] of Object.entries(tombstones ?? {})) {
    const record = byId.get(id);
    if (record && recordTime(record) <= at) byId.delete(id);
  }
  const sorted = [...byId.values()].sort((a, b) => recordTime(b) - recordTime(a));
  if (!spec.sameAs) return sorted;
  const seen = new Set<string>();
  return sorted.filter(entry => {
    const key = spec.sameAs!(entry);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A list write from the app (not from sync): entries that changed since `previous` get
 * `updatedAt: now`, and ids that are gone are returned with `now` as their deletion time.
 */
export function stampListChanges<E extends object>(
  previous: readonly E[],
  next: readonly E[],
  idOf: (entry: Record<string, unknown>) => string,
  now = Date.now()
): { entries: E[]; removed: Record<string, number> } {
  const before = new Map<string, { body: string; updatedAt?: unknown }>();
  for (const entry of previous) {
    const id = idOf(entry as Record<string, unknown>);
    if (id) {
      before.set(id, {
        body: JSON.stringify({ ...entry, updatedAt: undefined }),
        updatedAt: (entry as { updatedAt?: unknown }).updatedAt,
      });
    }
  }
  const kept = new Set<string>();
  const entries = next.map(entry => {
    const id = idOf(entry as Record<string, unknown>);
    if (!id) return entry;
    kept.add(id);
    const prior = before.get(id);
    if (prior?.body !== JSON.stringify({ ...entry, updatedAt: undefined })) {
      return { ...entry, updatedAt: now };
    }
    // Unchanged — keep its last edit time even when the caller rebuilt it without one.
    return typeof prior.updatedAt === 'number' ? { ...entry, updatedAt: prior.updatedAt } : entry;
  });
  const removed: Record<string, number> = {};
  for (const id of before.keys()) if (!kept.has(id)) removed[id] = now;
  return { entries, removed };
}

type ListFields = CastSyncFields & {
  roleplayLibrary?: Timed[];
  recordTombstones?: RecordTombstones;
};

/**
 * `incoming` with its record lists merged with `stored` — the Cast, stories and RECORD_LISTS
 * (everything else as `incoming` has it). Used by the server on a studio-extras push and by the
 * browser on its startup pull.
 */
export function withMergedRecordLists<T extends ListFields>(incoming: T, stored: ListFields): T {
  if (!stored || typeof stored !== 'object') return incoming;
  const hasCast =
    Array.isArray(incoming.characters) ||
    Array.isArray(stored.characters) ||
    Boolean(incoming.characterRemovedIds?.length || stored.characterRemovedIds?.length);
  const cast = hasCast ? mergeCastSync(stored, incoming) : null;
  const stories = mergeStoryLists(incoming.roleplayLibrary, stored.roleplayLibrary);
  const tombstones = mergeTombstones(stored.recordTombstones, incoming.recordTombstones);
  const lists: Record<string, unknown> = {};
  const inc = incoming as Record<string, unknown>;
  const sto = stored as Record<string, unknown>;
  for (const spec of RECORD_LISTS) {
    // A push without the list (an older client, a partial payload) leaves the stored one alone.
    if (!Array.isArray(inc[spec.field]) && !Array.isArray(sto[spec.field])) continue;
    lists[spec.field] = mergeRecordList(
      spec,
      sto[spec.field],
      inc[spec.field],
      tombstones[spec.field]
    );
  }
  // Recently deleted workflows: one entry per file (the newest deletion), none for a file that
  // is back in the merged library.
  if (Array.isArray(inc.comfyWorkflowTrash) || Array.isArray(sto.comfyWorkflowTrash)) {
    const library = new Set(
      ((lists.comfyWorkflowFiles as Record<string, unknown>[] | undefined) ?? []).map(file =>
        str(file.id)
      )
    );
    const byId = new Map<string, Record<string, unknown>>();
    for (const list of [sto.comfyWorkflowTrash, inc.comfyWorkflowTrash]) {
      if (!Array.isArray(list)) continue;
      for (const item of list as Record<string, unknown>[]) {
        const id = str((item?.file as Record<string, unknown> | undefined)?.id);
        if (!id || library.has(id)) continue;
        const existing = byId.get(id);
        if (!existing || Number(item.deletedAt) >= Number(existing.deletedAt)) byId.set(id, item);
      }
    }
    lists.comfyWorkflowTrash = [...byId.values()].sort(
      (a, b) => Number(b.deletedAt) - Number(a.deletedAt)
    );
  }
  return {
    ...incoming,
    ...(cast ?? {}),
    ...(stories ? { roleplayLibrary: stories } : {}),
    ...lists,
    ...(Object.keys(tombstones).length ? { recordTombstones: tombstones } : {}),
  };
}
