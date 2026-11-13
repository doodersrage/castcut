'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

/** How long the page waits on its saved data before saying so. */
export const SAVED_DATA_WAIT_NOTICE_MS = 8000;

/**
 * A page waiting for its saved data (the browser database) — not for its code, which the route's
 * own loading skeleton covers. It can't render early: settings written before they load would
 * overwrite what's saved. After a few seconds it says what it is waiting for and how to get past
 * it, instead of an endless skeleton (UI audit 2026-11-12: Scene sat on "Loading scene").
 */
export default function SavedDataWait({ label }: { label: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SAVED_DATA_WAIT_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div data-testid="saved-data-wait" data-slow={slow ? 'true' : undefined}>
      {slow ? (
        <div
          role="status"
          className="ui-card mb-3 space-y-2 p-[var(--card-padding)]"
          data-testid="saved-data-wait-slow"
        >
          <p className="type-body font-medium">Still opening your saved work…</p>
          <p className="type-caption text-[var(--text-secondary)]">
            Your shorts, scenes and settings live in this browser. Another Castcut tab can hold them
            while it saves — close the other tabs, or reload this one. Nothing is lost.
          </p>
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      ) : null}
      <ToolPageSkeleton label={label} />
    </div>
  );
}
