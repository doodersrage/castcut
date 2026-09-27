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
  const ratingColors = [
    'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)] hover:brightness-110',
    'border-orange-600/50 bg-orange-900/18 text-orange-400 hover:bg-orange-500/35 hover:border-orange-500/75',
    'border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] text-[var(--tint-info-text)] hover:bg-[var(--tint-info-bg)] hover:border-[var(--tint-info-border)]',
    'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)] hover:brightness-110',
    'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] hover:brightness-110',
  ];

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
          {([1, 2, 3, 4, 5] as const).map((rating, idx) => (
            <button
              key={rating}
              type="button"
              onClick={() => onRate(rating)}
              className={`min-h-11 min-w-11 rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-elevated)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${ratingColors[idx]}`}
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
