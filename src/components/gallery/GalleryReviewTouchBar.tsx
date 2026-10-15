'use client';

import { useBottomDockRef } from '@/hooks/useBottomDockRef';

type GalleryReviewTouchBarProps = {
  onRate: (rating: 1 | 2 | 3 | 4 | 5) => void;
  onFavorite: () => void;
  onNext: () => void;
  onPrev: () => void;
};

export default function GalleryReviewTouchBar({
  onRate,
  onFavorite,
  onNext,
  onPrev,
}: GalleryReviewTouchBarProps) {
  const dockRef = useBottomDockRef<HTMLDivElement>();
  // One look for every rating (a red→orange→blue→green→accent rainbow before — UI review 2026-10-15).
  const ratingClass = 'ui-btn-secondary';

  return (
    <div
      ref={dockRef}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)]/80 bg-[var(--bg-elevated)] px-3 py-3 lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          className={`ui-btn-secondary min-h-11 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-muted)] transition hover:bg-[var(--accent-muted)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--accent-text)]`}
        >
          Prev
        </button>
        <div className="flex gap-1">
          {([1, 2, 3, 4, 5] as const).map(rating => (
            <button
              key={rating}
              type="button"
              onClick={() => onRate(rating)}
              className={`min-h-11 min-w-11 rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-elevated)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${ratingClass}`}
            >
              {rating}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onFavorite}
          className={`ui-btn-secondary min-h-11 rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] transition hover:bg-[var(--tint-warning-bg)] hover:border-[var(--tint-warning-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--tint-warning-text)]`}
        >
          ★
        </button>
        <button
          type="button"
          onClick={onNext}
          className={`ui-btn-secondary min-h-11 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-muted)] transition hover:bg-[var(--accent-muted)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--accent-text)]`}
        >
          Next
        </button>
      </div>
    </div>
  );
}
