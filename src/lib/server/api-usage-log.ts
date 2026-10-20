export type ApiUsageEntry = {
  id: string;
  at: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  clientKey: string;
  rateLimited?: boolean;
};

const MAX_ENTRIES = 500;
const entries: ApiUsageEntry[] = [];

export function logApiUsage(entry: Omit<ApiUsageEntry, 'id'>): void {
  entries.unshift({
    ...entry,
    id: `${entry.at}-${Math.random().toString(36).slice(2, 8)}`,
  });
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
}

export function listApiUsage(limit = 50): ApiUsageEntry[] {
  return entries.slice(0, Math.min(limit, MAX_ENTRIES));
}

export function summarizeApiUsage(): {
  total: number;
  lastHour: number;
  rateLimited: number;
  avgDurationMs: number;
} {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const recent = entries.filter(entry => entry.at >= hourAgo);
  const rateLimited = recent.filter(entry => entry.rateLimited).length;
  const avgDurationMs =
    recent.length > 0
      ? Math.round(recent.reduce((sum, entry) => sum + entry.durationMs, 0) / recent.length)
      : 0;
  return {
    total: entries.length,
    lastHour: recent.length,
    rateLimited,
    avgDurationMs,
  };
}
