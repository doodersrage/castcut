/**
 * Record lists inside a tool's settings (R6, M0 audit D4): Scene's saved scenes live in the
 * settings blob (`tools.scene.scenes`), and the blob merged one tool at a time — a device's whole
 * `tools.scene` replaced the other's, so one side's new scenes and takes vanished, on the
 * server too (the startup pull kept this device's tools, then pushed them).
 *
 * Merged per record instead, like studio-extras' lists (record-list-sync.ts): the newest copy
 * of a record wins (`updatedAt`); its child list (a scene's takes) is the union of both copies,
 * less the children either side removed; a record deleted after a copy was saved stays deleted.
 * Lists are named here as data, so shared storage code never imports the feature. Pure — the
 * server runs it on a settings push, the browser on its pulls.
 */

export type ToolRecordListSpec = {
  /** `tools.<tool>`. */
  tool: string;
  /** The record list in it. */
  field: string;
  /** Deletion times by record id, in the same tool settings. */
  removedField: string;
  /** A list inside each record whose entries both copies may add to. */
  children?: {
    field: string;
    /** Child ids the record's own writes removed (they are not brought back by the other copy). */
    removedField: string;
  };
};

export const TOOL_RECORD_LISTS: readonly ToolRecordListSpec[] = [
  {
    tool: 'scene',
    field: 'scenes',
    removedField: 'removedSceneAt',
    children: { field: 'takes', removedField: 'removedTakeIds' },
  },
  // A Cast's screenplays (day/scene-scripts.ts), merged per script.
  { tool: 'scene', field: 'scripts', removedField: 'removedScriptAt' },
];

/** Deletions kept per list, and removed child ids kept per record. */
const MAX_REMOVED = 500;
const MAX_REMOVED_CHILDREN = 200;

type Rec = Record<string, unknown>;

const isRec = (value: unknown): value is Rec =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const idOf = (value: unknown): string =>
  isRec(value) && typeof value.id === 'string' ? value.id : '';
const timeOf = (value: Rec): number =>
  typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;

function mergeRemovedTimes(a: unknown, b: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const source of [a, b]) {
    if (!isRec(source)) continue;
    for (const [id, at] of Object.entries(source)) {
      if (typeof at === 'number' && Number.isFinite(at)) out[id] = Math.max(out[id] ?? 0, at);
    }
  }
  const entries = Object.entries(out);
  if (entries.length <= MAX_REMOVED) return out;
  return Object.fromEntries(entries.sort((x, y) => y[1] - x[1]).slice(0, MAX_REMOVED));
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/** Two copies of one record: the newer as it is, with the older's children it lacks. */
function mergeRecord(newer: Rec, older: Rec, spec: ToolRecordListSpec): Rec {
  const child = spec.children;
  if (!child) return newer;
  const removed = [
    ...new Set([
      ...stringList(newer[child.removedField]),
      ...stringList(older[child.removedField]),
    ]),
  ].slice(-MAX_REMOVED_CHILDREN);
  const gone = new Set(removed);
  const mine = Array.isArray(newer[child.field]) ? (newer[child.field] as unknown[]) : [];
  const theirs = Array.isArray(older[child.field]) ? (older[child.field] as unknown[]) : [];
  const have = new Set(mine.map(idOf));
  const added = theirs.filter(entry => {
    const id = idOf(entry);
    return id && !have.has(id) && !gone.has(id);
  });
  const kept = mine.filter(entry => !gone.has(idOf(entry)));
  if (!added.length && kept.length === mine.length && !removed.length) return newer;
  return {
    ...newer,
    [child.field]: [...kept, ...added],
    ...(removed.length ? { [child.removedField]: removed } : {}),
  };
}

/** One tool's record list from both sides (`primary` keeps its order; the other's new follow). */
function mergeList(
  primary: unknown,
  other: unknown,
  removedAt: Record<string, number>,
  spec: ToolRecordListSpec
): Rec[] {
  const mine = Array.isArray(primary) ? primary.filter(isRec) : [];
  const theirs = Array.isArray(other) ? other.filter(isRec) : [];
  const byIdTheirs = new Map(theirs.map(entry => [idOf(entry), entry]));
  const seen = new Set<string>();
  const out: Rec[] = [];
  const keep = (entry: Rec) => {
    const at = removedAt[idOf(entry)];
    return at === undefined || timeOf(entry) > at;
  };
  for (const entry of mine) {
    const id = idOf(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const copy = byIdTheirs.get(id);
    const merged = !copy
      ? entry
      : timeOf(copy) > timeOf(entry)
        ? mergeRecord(copy, entry, spec)
        : mergeRecord(entry, copy, spec);
    if (keep(merged)) out.push(merged);
  }
  for (const entry of theirs) {
    const id = idOf(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (keep(entry)) out.push(entry);
  }
  return out;
}

/**
 * `primary` tools (everything as it has it) with each TOOL_RECORD_LISTS list merged with
 * `other`'s. Same object when `other` has none of those lists.
 */
export function withMergedToolRecords<T extends object | undefined | null>(
  primary: T,
  other: object | undefined | null
): T {
  if (!isRec(primary) || !isRec(other)) return primary;
  let next: Rec | null = null;
  for (const spec of TOOL_RECORD_LISTS) {
    const mine = primary[spec.tool];
    const theirs = other[spec.tool];
    if (!isRec(theirs)) continue;
    const base = isRec(mine) ? mine : {};
    if (!Array.isArray(theirs[spec.field]) && !isRec(theirs[spec.removedField])) continue;
    const removedAt = mergeRemovedTimes(base[spec.removedField], theirs[spec.removedField]);
    const list = mergeList(base[spec.field], theirs[spec.field], removedAt, spec);
    next ??= { ...primary };
    next[spec.tool] = {
      ...base,
      [spec.field]: list,
      ...(Object.keys(removedAt).length ? { [spec.removedField]: removedAt } : {}),
    };
  }
  return (next ?? primary) as T;
}

/**
 * A settings push with the record lists in its tools merged with the stored copy's (the server,
 * on every settings-cache push): one device's push no longer drops the scenes and takes another
 * device added. Same object when there is no stored copy to merge with.
 */
export function withMergedSettingsRecords<T extends Record<string, unknown>>(
  incoming: T,
  stored: unknown
): T {
  const storedTools = isRec(stored) ? stored.tools : undefined;
  if (!isRec(storedTools)) return incoming;
  const tools = withMergedToolRecords(
    isRec(incoming.tools) ? incoming.tools : undefined,
    storedTools
  );
  return tools === incoming.tools || !tools ? incoming : { ...incoming, tools };
}
