'use client';

import { tryOnReviewScoreLine, type TryOnReview } from '@/lib/fitting-tryon-review';

/** Scores / warnings under a Compare thumb (Auto-review on). */
export function TryOnReviewLine({
  review,
  reviewing,
  suggested,
}: {
  review?: TryOnReview;
  reviewing: boolean;
  suggested: boolean;
}) {
  if (reviewing) {
    return (
      <p
        className="type-caption mt-1 text-[var(--text-muted)]"
        data-testid="fitting-review-pending"
      >
        Reviewing…
      </p>
    );
  }
  if (!review) {
    return null;
  }
  const scores = tryOnReviewScoreLine(review);
  return (
    <div className="mt-1 space-y-0.5" data-testid="fitting-review">
      {suggested ? (
        <p className="type-overline text-[var(--accent-text)]" data-testid="fitting-review-best">
          Best match
        </p>
      ) : null}
      {scores ? <p className="type-caption text-[var(--text-secondary)]">{scores}</p> : null}
      {review.notes.length > 0 ? (
        <p
          className={`type-caption ${
            review.status === 'warn'
              ? 'text-[var(--tint-warning-text,var(--text-muted))]'
              : 'text-[var(--text-muted)]'
          }`}
        >
          {review.notes.join(', ')}
          {review.status === 'warn' ? ' — try Requeue or Pass' : ''}
        </p>
      ) : null}
    </div>
  );
}
