/**
 * Your decisions about continuity findings (M2 C2, ROADMAP §5.5 layer 4): a finding you have
 * looked at — dismissed (it's fine), or accepted (it's real) — with a note, kept by finding id
 * (findings.ts: `${prompt id}:${rule}`). Synced in studio-extras as `continuityDecisions` and
 * merged per record across devices like My poses (record-list-sync.ts). The Cut's pre-cut
 * check leaves dismissed findings out.
 */
import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/storage/browser-storage';
import { recordListSpec } from '../storage/record-list-sync';
import { trackRecordListWrite } from '../storage/record-tombstones';

export const FINDING_DECISIONS_STORAGE_KEY = 'comfy-continuity-decisions-v1';
export const FINDING_DECISIONS_CHANGED_EVENT = 'comfy-continuity-decisions-changed';
/** Decisions kept (newest first). */
export const FINDING_DECISIONS_LIMIT = 2000;

export type FindingDecisionKind = 'dismissed' | 'accepted';

export type FindingDecision = {
  /** The finding's id. */
  id: string;
  decision: FindingDecisionKind;
  note?: string;
  at: number;
  /** Last edit (record-list-sync: the newest copy wins across devices). */
  updatedAt?: number;
};

export function normalizeFindingDecision(raw: unknown): FindingDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const id = typeof entry.id === 'string' ? entry.id.trim().slice(0, 240) : '';
  const decision =
    entry.decision === 'dismissed' || entry.decision === 'accepted' ? entry.decision : null;
  if (!id || !decision) return null;
  const note = typeof entry.note === 'string' ? entry.note.trim().slice(0, 300) : '';
  const at = typeof entry.at === 'number' && Number.isFinite(entry.at) ? entry.at : Date.now();
  return {
    id,
    decision,
    ...(note ? { note } : {}),
    at,
    ...(typeof entry.updatedAt === 'number' ? { updatedAt: entry.updatedAt } : {}),
  };
}

export function loadFindingDecisions(): FindingDecision[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = readBrowserValue<unknown>(FINDING_DECISIONS_STORAGE_KEY);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeFindingDecision)
      .filter((entry): entry is FindingDecision => Boolean(entry))
      .slice(0, FINDING_DECISIONS_LIMIT);
  } catch {
    return [];
  }
}

function writeAll(entries: FindingDecision[], options: { fromSync?: boolean } = {}): void {
  const limited = entries.slice(0, FINDING_DECISIONS_LIMIT);
  const next = options.fromSync
    ? limited
    : trackRecordListWrite(recordListSpec('continuityDecisions'), loadFindingDecisions(), limited);
  if (typeof window === 'undefined') return;
  try {
    writeBrowserValue(FINDING_DECISIONS_STORAGE_KEY, next);
    window.dispatchEvent(new Event(FINDING_DECISIONS_CHANGED_EVENT));
  } catch {
    /* quota / private mode */
  }
}

/** Decide about a finding (replaces an earlier decision about it). */
export function decideFinding(
  id: string,
  decision: FindingDecisionKind,
  note?: string,
  now = Date.now()
): void {
  const entry = normalizeFindingDecision({ id, decision, note, at: now });
  if (!entry) return;
  writeAll([entry, ...loadFindingDecisions().filter(existing => existing.id !== entry.id)]);
}

/** Take a decision back: the finding is open again. */
export function undecideFinding(id: string): void {
  const all = loadFindingDecisions();
  if (all.some(entry => entry.id === id)) writeAll(all.filter(entry => entry.id !== id));
}

/** Server pull (studio-extras). */
export function replaceFindingDecisions(entries: unknown): void {
  if (!Array.isArray(entries)) return;
  writeAll(
    entries
      .map(normalizeFindingDecision)
      .filter((entry): entry is FindingDecision => Boolean(entry)),
    { fromSync: true }
  );
}

/** Decisions by finding id. */
export function findingDecisionMap(
  decisions: readonly FindingDecision[]
): Map<string, FindingDecision> {
  return new Map(decisions.map(entry => [entry.id, entry]));
}

export function subscribeFindingDecisions(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange();
  window.addEventListener(FINDING_DECISIONS_CHANGED_EVENT, handler);
  window.addEventListener('storage', handler);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  return () => {
    window.removeEventListener(FINDING_DECISIONS_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  };
}
