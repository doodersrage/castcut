'use client';

import type { ReactNode } from 'react';
import SideSheet from '@/components/ui/SideSheet';
import type { ClothingSummaryThumb } from '@/lib/clothing-summary';

/**
 * The clothing picker (kit deck, your own photo, footwear — some sixty controls) as a sheet
 * opened from a one-line summary row, instead of inlined on the page. Day's slot sheet opens
 * it; Outfit and Story can open the same one from their Clothing rows.
 */
export default function ClothingSheet({
  open,
  onClose,
  title = 'Clothing',
  description,
  testId = 'clothing-sheet',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      testId={testId}
      size="lg"
      layer="raised"
    >
      {children}
    </SideSheet>
  );
}

/** Kit packshot / clothing photo / shoe photo, small, beside a Clothing line. */
export function ClothingSummaryThumbStrip({
  thumbs,
  testId,
}: {
  thumbs?: ClothingSummaryThumb[] | null;
  testId?: string;
}) {
  if (!thumbs?.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-1" data-testid={testId}>
      {thumbs.map(thumb => (
        // eslint-disable-next-line @next/next/no-img-element -- packshots / uploads, any origin
        <img
          key={thumb.url}
          src={thumb.url}
          alt={thumb.label}
          title={thumb.label}
          loading="lazy"
          decoding="async"
          className="h-9 w-7 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] object-cover object-top"
        />
      ))}
    </span>
  );
}

/**
 * The one-line row that opens the sheet: what is worn now — its pictures and its short names,
 * truncated with the full line as a tooltip — right beside the Choose button, so it reads
 * without opening the sheet (phone too).
 */
export function ClothingSummaryRow({
  summary,
  thumbs,
  onOpen,
  disabled = false,
  testId = 'clothing-row',
  label = 'Clothing',
  className = 'border-t border-[var(--border-subtle)] py-2',
}: {
  summary: string;
  /** Kit packshot / photo / shoe photo (clothing-summary: clothingSummaryThumbs). */
  thumbs?: ClothingSummaryThumb[] | null;
  onOpen: () => void;
  disabled?: boolean;
  testId?: string;
  label?: string;
  /** The row's spacing and border — a divider line in a sheet (default), or none in a card. */
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${className}`.trim()}
      data-testid={testId}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ClothingSummaryThumbStrip thumbs={thumbs} testId={`${testId}-thumbs`} />
        <div className="min-w-0">
          <p className="type-heading text-sm">{label}</p>
          <p
            className="type-caption truncate text-[var(--text-muted)]"
            title={summary}
            data-testid={`${testId}-summary`}
          >
            {summary}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="ui-btn-secondary ui-btn-sm shrink-0"
        disabled={disabled}
        data-testid={`${testId}-open`}
        onClick={onOpen}
      >
        Choose…
      </button>
    </div>
  );
}
