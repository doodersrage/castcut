'use client';

import type { ReactNode } from 'react';
import SideSheet from '@/components/ui/SideSheet';

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

/** The one-line row that opens the sheet: what is worn now, and a Choose button. */
export function ClothingSummaryRow({
  summary,
  onOpen,
  disabled = false,
  testId = 'clothing-row',
  label = 'Clothing',
}: {
  summary: string;
  onOpen: () => void;
  disabled?: boolean;
  testId?: string;
  label?: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] py-2"
      data-testid={testId}
    >
      <div className="min-w-0">
        <p className="type-heading text-sm">{label}</p>
        <p
          className="type-caption truncate text-[var(--text-muted)]"
          data-testid={`${testId}-summary`}
        >
          {summary}
        </p>
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
