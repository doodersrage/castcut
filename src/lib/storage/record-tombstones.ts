/**
 * When this browser deleted entries from the synced record lists (record-list-sync.ts
 * RECORD_LISTS) — so a deletion on one device reaches the other instead of the other device's
 * copy bringing the entry back. Synced in studio-extras as `recordTombstones`.
 */

import { readBrowserValue, writeBrowserValue } from './browser-storage';
import {
  mergeTombstones,
  stampListChanges,
  type RecordListSpec,
  type RecordTombstones,
} from './record-list-sync';

export const RECORD_TOMBSTONES_KEY = 'comfy-sync-tombstones-v1';

/** Deletions older than this are forgotten (a device away for a year may bring one back). */
const TOMBSTONE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function pruned(tombstones: RecordTombstones, now = Date.now()): RecordTombstones {
  const out: RecordTombstones = {};
  for (const [field, ids] of Object.entries(tombstones)) {
    const kept = Object.entries(ids).filter(([, at]) => now - at < TOMBSTONE_TTL_MS);
    if (kept.length) out[field] = Object.fromEntries(kept);
  }
  return out;
}

export function loadRecordTombstones(): RecordTombstones {
  if (typeof window === 'undefined') return {};
  const raw = readBrowserValue<RecordTombstones>(RECORD_TOMBSTONES_KEY);
  return raw && typeof raw === 'object' ? mergeTombstones(raw, undefined) : {};
}

/** Merge deletions in (from sync or from a local write). */
export function saveRecordTombstones(tombstones: RecordTombstones | undefined): void {
  if (typeof window === 'undefined' || !tombstones) return;
  const merged = pruned(mergeTombstones(loadRecordTombstones(), tombstones));
  if (JSON.stringify(merged) === JSON.stringify(loadRecordTombstones())) return;
  writeBrowserValue(RECORD_TOMBSTONES_KEY, merged);
}

/**
 * A list's own write (not from sync): stamp changed entries and note dropped ones. Returns the
 * entries to store.
 */
export function trackRecordListWrite<E extends object>(
  spec: Pick<RecordListSpec, 'field' | 'idOf'>,
  previous: readonly E[],
  next: readonly E[]
): E[] {
  const { entries, removed } = stampListChanges(previous, next, spec.idOf);
  if (Object.keys(removed).length) saveRecordTombstones({ [spec.field]: removed });
  return entries;
}
