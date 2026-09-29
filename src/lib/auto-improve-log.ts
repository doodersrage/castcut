/**
 * What the rating automations queued, kept locally so Settings can say it in one line
 * ("queued 14 jobs in 7 days") — their jobs are ordinary upscales / requeues / mutations in the
 * gallery and can't be told apart there.
 */
import { readBrowserValue, writeBrowserValue } from './browser-storage';

export const AUTO_IMPROVE_LOG_KEY = 'auto-improve-log-v1';
const MAX_ENTRIES = 200;

export type AutoImproveLogEntry = { at: number; kind: string; count: number };

export function recordAutoImproveJobs(kind: string, count: number, now = Date.now()): void {
  if (typeof window === 'undefined' || !(count > 0)) return;
  const log = readBrowserValue<AutoImproveLogEntry[]>(AUTO_IMPROVE_LOG_KEY) ?? [];
  writeBrowserValue(AUTO_IMPROVE_LOG_KEY, [...log, { at: now, kind, count }].slice(-MAX_ENTRIES));
}

export function summarizeAutoImproveLog(
  log: AutoImproveLogEntry[] | null | undefined,
  now = Date.now(),
  days = 7
): { total: number; byKind: Array<[string, number]> } {
  const since = now - days * 24 * 60 * 60 * 1000;
  const byKind = new Map<string, number>();
  let total = 0;
  for (const entry of log ?? []) {
    if (entry.at < since) continue;
    total += entry.count;
    byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + entry.count);
  }
  return { total, byKind: [...byKind.entries()].sort((a, b) => b[1] - a[1]) };
}

export function loadAutoImproveLog(): AutoImproveLogEntry[] {
  return readBrowserValue<AutoImproveLogEntry[]>(AUTO_IMPROVE_LOG_KEY) ?? [];
}
