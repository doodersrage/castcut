'use client';

import type { ReactNode } from 'react';

/**
 * "What she's wearing" row shared by the outfit kit picker and the clothing-photo mode, so both
 * read as one tool: a small 3:4 thumb, a title, a muted meta line, and optional controls at
 * either end (Prev / Next for kits, Save / Rescan / Remove for a photo).
 */
export default function WearingCard({
  thumbUrl,
  title,
  meta,
  emptyLabel,
  start,
  end,
  testId,
}: {
  thumbUrl?: string | null;
  title?: string | null;
  meta?: ReactNode;
  /** Shown instead of thumb + title when nothing is picked. */
  emptyLabel?: string;
  start?: ReactNode;
  end?: ReactNode;
  testId?: string;
}) {
  const thumb = thumbUrl?.trim() || '';
  // Controls on both sides (kit Prev / Next) squeeze the name on a phone — stack it there.
  const stacked = Boolean(start && end);
  return (
    <div
      className={`flex items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1.5 ${
        stacked ? 'flex-wrap sm:flex-nowrap' : ''
      }`}
      data-testid={testId}
    >
      {/* Narrow + stacked: the name takes the first line and the controls wrap below it. */}
      {start ? <div className="flex shrink-0 items-center">{start}</div> : null}
      <div
        className={`flex min-w-0 flex-1 items-center gap-2.5 px-1 ${
          stacked ? 'order-first basis-full sm:order-none sm:basis-auto' : ''
        }`}
      >
        {title ? (
          <>
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                decoding="async"
                className="aspect-[3/4] w-9 shrink-0 rounded-md bg-[var(--bg-muted)] object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <p className="type-body line-clamp-2 break-words text-[var(--text-primary)]">
                {title}
              </p>
              {meta ? (
                <p className="type-caption truncate text-[var(--text-muted)]">{meta}</p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="type-caption py-1.5 text-[var(--text-muted)]">{emptyLabel}</p>
        )}
      </div>
      {end ? <div className="ml-auto flex shrink-0 items-center">{end}</div> : null}
    </div>
  );
}
