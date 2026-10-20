'use client';

import { Button } from '@/components/ui/Button';
import type { SetAsideDay } from '@/lib/day/episode-snapshot';

/**
 * After "Open this Day again" on the Cast page: the Day that was on the board is kept aside —
 * one tap brings it back (and sets the reopened one aside in turn).
 */
export default function DaySetAsideBanner({
  aside,
  castId,
  onBringBack,
  onDismiss,
}: {
  aside: SetAsideDay | null;
  castId?: string;
  onBringBack: () => void;
  onDismiss: () => void;
}) {
  if (!aside || !castId || aside.castId !== castId) return null;
  const count = aside.stills?.filter(still => still.status === 'completed').length ?? 0;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2"
      role="status"
      data-testid="day-set-aside"
    >
      <p className="type-caption text-[var(--text-primary)]">
        Opened {aside.reason} again. The Day you had ({count} still{count === 1 ? '' : 's'}) is kept
        aside.
      </p>
      <span className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          data-testid="day-set-aside-back"
          onClick={onBringBack}
        >
          Bring back the Day you had
        </Button>
        <Button size="sm" variant="ghost" data-testid="day-set-aside-dismiss" onClick={onDismiss}>
          Keep this one
        </Button>
      </span>
    </div>
  );
}
