'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  describeSyncStatus,
  getServerSyncStatus,
  getSyncStatus,
  subscribeSyncStatus,
} from '@/lib/sync-status';

const TONE_CLASS = {
  ok: 'text-[var(--text-muted)]',
  none: 'text-[var(--text-muted)]',
  waiting: 'text-[var(--text-secondary)]',
  error: 'text-[var(--tint-danger-text)] font-medium',
} as const;

/** "Synced 2 min ago" / "Couldn't reach the server…" for Settings → Server storage. */
export function SyncStatusLine() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getServerSyncStatus);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const { text, tone } = describeSyncStatus(status, now);
  return (
    <p
      className={`mt-1 text-sm ${TONE_CLASS[tone]}`}
      data-testid="sync-status-line"
      data-tone={tone}
      role="status"
    >
      {text}
    </p>
  );
}
