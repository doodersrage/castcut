'use client';

import { Button } from '@/components/ui/Button';

export type GalleryPaginatorProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  /** Inclusive 1-based index of the first item on this page (weighted pagination aware). */
  rangeStart: number;
  /** Inclusive 1-based index of the last item on this page (weighted pagination aware). */
  rangeEnd: number;
  onPageChange: (page: number) => void;
};

export default function GalleryPaginator({
  page,
  totalPages,
  totalItems,
  rangeStart,
  rangeEnd,
  onPageChange,
}: GalleryPaginatorProps) {
  return (
    <div className="ui-gallery-dock flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p
        className={`type-caption leading-wider text-[var(--text-muted)] ${
          totalPages <= 3
            ? ''
            : ' bg-[var(--accent-muted)] border-[var(--accent-border)] text-[11px] font-medium'
        }`}
      >
        Showing {rangeStart}–{rangeEnd} of {totalItems}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className={page <= 1 ? 'opacity-40' : ''}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="type-caption border-[var(--accent-border)] bg-[var(--accent-muted)] px-1 font-medium text-[var(--accent-text)]">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className={page >= totalPages ? 'opacity-40' : ''}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
