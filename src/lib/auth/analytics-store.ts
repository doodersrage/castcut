import type { UserAnalyticsSnapshot } from '../user/analytics';
import {
  loadAnalyticsHistory,
  loadAnalyticsSnapshots,
  saveAnalyticsDocument,
} from '@/lib/sqlite/tables';

const MAX_HISTORY_PER_USER = 120;

export function saveUserAnalyticsSnapshot(snapshot: UserAnalyticsSnapshot): void {
  const snapshots = loadAnalyticsSnapshots();
  const history = loadAnalyticsHistory();
  snapshots[snapshot.userId] = snapshot;
  const entries = history[snapshot.userId] ?? [];
  const last = entries[0];
  if (!last || last.capturedAt !== snapshot.capturedAt) {
    entries.unshift(snapshot);
  }
  history[snapshot.userId] = entries.slice(0, MAX_HISTORY_PER_USER);
  saveAnalyticsDocument({ snapshots, history });
}

export function listUserAnalyticsSnapshots(): UserAnalyticsSnapshot[] {
  return Object.values(loadAnalyticsSnapshots()).sort((a, b) =>
    a.username.localeCompare(b.username)
  );
}

export function getUserAnalyticsSnapshot(userId: string): UserAnalyticsSnapshot | null {
  return loadAnalyticsSnapshots()[userId] ?? null;
}

export function listUserAnalyticsHistory(userId: string, limit = 60): UserAnalyticsSnapshot[] {
  return (loadAnalyticsHistory()[userId] ?? []).slice(0, limit);
}

export function listAllAnalyticsHistory(
  limitPerUser = 30
): Record<string, UserAnalyticsSnapshot[]> {
  const result: Record<string, UserAnalyticsSnapshot[]> = {};
  for (const [userId, entries] of Object.entries(loadAnalyticsHistory())) {
    result[userId] = entries.slice(0, limitPerUser);
  }
  return result;
}
