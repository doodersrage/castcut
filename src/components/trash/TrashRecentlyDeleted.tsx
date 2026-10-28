'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { loadTrash, subscribeTrash, TRASH_DAYS, type TrashItem } from '@/lib/gallery/trash';

/** The trash as it is now, kept current (M10 T2). */
export function useTrash(): TrashItem[] {
  const [items, setItems] = useState<TrashItem[]>([]);
  useEffect(() => {
    const refresh = () => setItems(loadTrash());
    scheduleAfterCommit(refresh);
    return subscribeTrash(refresh);
  }, []);
  return items;
}

/**
 * Recently deleted (M10 T2): what was deleted here in the last {@link TRASH_DAYS} days, each with
 * Restore. Nothing when there is none.
 */
export function TrashRecentlyDeleted({
  items,
  what,
  onRestore,
  testId,
}: {
  items: readonly TrashItem[];
  /** "takes", "Gallery entries". */
  what: string;
  onRestore: (item: TrashItem) => unknown;
  testId: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <details
      className="mt-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2"
      data-testid={testId}
    >
      <summary className="type-caption cursor-pointer text-[var(--text-secondary)]">
        Recently deleted {what} ({items.length}) — kept for {TRASH_DAYS} days
      </summary>
      <ul className="mt-2 divide-y divide-[var(--border-subtle)]/70">
        {items.map(item => (
          <li key={item.id} className="flex items-center justify-between gap-2 py-1.5">
            <span className="flex min-w-0 items-center gap-2">
              {item.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a deleted render's thumbnail
                <img
                  src={item.thumbUrl}
                  alt=""
                  className="h-10 w-8 shrink-0 rounded-[var(--radius-sm)] bg-[var(--bg-muted)] object-cover"
                  loading="lazy"
                />
              ) : null}
              <span className="min-w-0 text-xs text-[var(--text-primary)]">
                <span className="line-clamp-1">{item.label}</span>
                <span className="text-3xs text-[var(--text-muted)]">
                  deleted {new Date(item.at).toLocaleString()}
                </span>
              </span>
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              data-testid={`${testId}-restore`}
              onClick={() => {
                setBusy(item.id);
                void Promise.resolve(onRestore(item)).finally(() => setBusy(null));
              }}
            >
              {busy === item.id ? 'Restoring…' : 'Restore'}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
