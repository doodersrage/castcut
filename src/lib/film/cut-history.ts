/**
 * Cut's undo history across a reload (M4 F1, ROADMAP §7.2): the steps are kept for the browser
 * tab (sessionStorage), with the edit they lead to. On the next load they come back only when
 * the edit is still exactly that one — an edit changed elsewhere meanwhile (another tab, another
 * device) starts a fresh history rather than undoing into a different cut.
 */

export type CutHistory<S> = { past: S[]; future: S[] };

export const CUT_HISTORY_STORAGE_KEY = 'castcut-cut-history-v1';
/** Steps kept across a reload, each way. */
export const CUT_HISTORY_KEPT = 30;
/** A history larger than this keeps fewer steps (sessionStorage is a few MB, shared). */
export const CUT_HISTORY_MAX_CHARS = 1_500_000;

type Stored<S> = { v: 1; present: string; past: S[]; future: S[] };

/** The history as stored: the newest steps that fit, and the edit they belong to. */
export function serializeCutHistory<S>(present: S, history: CutHistory<S>): string | null {
  const presentJson = JSON.stringify(present);
  const newest = (list: S[], keep: number) => (keep > 0 ? list.slice(-keep) : []);
  for (const keep of [CUT_HISTORY_KEPT, 15, 8, 4, 2, 1, 0]) {
    const stored: Stored<S> = {
      v: 1,
      present: presentJson,
      past: newest(history.past, keep),
      future: newest(history.future, keep),
    };
    const json = JSON.stringify(stored);
    if (json.length <= CUT_HISTORY_MAX_CHARS) return json;
  }
  return null;
}

/** The stored history, when it leads to exactly `present`; else null. */
export function restoreCutHistory<S>(raw: string | null, present: S): CutHistory<S> | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<Stored<S>>;
    if (stored.v !== 1 || stored.present !== JSON.stringify(present)) return null;
    const past = Array.isArray(stored.past) ? stored.past : [];
    const future = Array.isArray(stored.future) ? stored.future : [];
    return past.length || future.length ? { past, future } : null;
  } catch {
    return null;
  }
}

export function readStoredCutHistory(): string | null {
  try {
    return typeof window === 'undefined'
      ? null
      : window.sessionStorage.getItem(CUT_HISTORY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredCutHistory(json: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (json) window.sessionStorage.setItem(CUT_HISTORY_STORAGE_KEY, json);
    else window.sessionStorage.removeItem(CUT_HISTORY_STORAGE_KEY);
  } catch {
    // Full or blocked: the history just doesn't outlive the page.
  }
}
