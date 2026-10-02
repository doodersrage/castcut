'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { loadCollapsibleOpen, saveCollapsibleOpen } from '@/lib/collapsible-persist';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = true,
  persistKey,
  children,
  className = '',
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  /** When set, open/closed state is remembered across sessions. */
  persistKey?: string;
  children: ReactNode;
  className?: string;
}) {
  const storageId = persistKey?.trim() || '';
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageId) {
      return;
    }
    scheduleAfterCommit(() => {
      setOpen(loadCollapsibleOpen(storageId, defaultOpen));
    });
  }, [defaultOpen, storageId]);

  return (
    <details
      open={open}
      // A named group: inside an open section, a closed nested one matched the parent's plain
      // `group` and showed its arrow flipped.
      className={`ui-collapsible group/collapsible ${className}`.trim()}
      onToggle={event => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (storageId) {
          saveCollapsibleOpen(storageId, nextOpen);
        }
      }}
    >
      <summary className="list-none marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <p className="type-heading">{title}</p>
            {summary ? <p className="type-caption">{summary}</p> : null}
          </div>
          <span
            aria-hidden
            className="type-caption mt-0.5 shrink-0 transition group-open/collapsible:rotate-180"
          >
            ▾
          </span>
        </div>
      </summary>
      <div className="ui-collapsible-body ui-block-group">{children}</div>
    </details>
  );
}
