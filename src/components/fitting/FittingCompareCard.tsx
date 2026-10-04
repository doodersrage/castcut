'use client';

import { TryOnReviewLine } from '@/components/fitting/TryOnReviewLine';
import { Button } from '@/components/ui/Button';
import ShotCardMenu, { SHOT_CARD_MENU_ITEM_CLASS } from '@/components/ui/ShotCardMenu';
import type { FittingCompareTryOn } from '@/lib/fitting-room';
import type { TryOnReview } from '@/lib/fitting-tryon-review';

export type FittingCompareCardProps = {
  tryOn: FittingCompareTryOn;
  busy: boolean;
  review?: TryOnReview;
  reviewing: boolean;
  /** Auto-review's pick — the best clean try-on. */
  suggested: boolean;
  /** Tap the picture: full size (the back view's own slide when `back`). */
  onOpen: (options?: { back?: boolean }) => void;
  onKeep: () => void;
  onPass: () => void;
  onRequeue: () => void;
};

/**
 * One try-on in Compare, on desk and phone: the front (and back) picture opens full size, Keep
 * is the one button, and Pass / Requeue / Open full size live in the card's ⋯ menu.
 */
export default function FittingCompareCard({
  tryOn,
  busy,
  review,
  reviewing,
  suggested,
  onOpen,
  onKeep,
  onPass,
  onRequeue,
}: FittingCompareCardProps) {
  const name = tryOn.wardrobeLabel || tryOn.wardrobeId || 'Try-on';
  return (
    <figure
      data-testid="fitting-compare-card"
      data-review={review?.status ?? 'none'}
      className={`${tryOn.backImageUrl ? 'w-[15rem]' : 'w-[9rem]'} relative shrink-0 rounded-[var(--radius-md)] border p-2 ${
        suggested
          ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]'
          : review?.status === 'warn'
            ? 'border-[var(--tint-warning-border)]'
            : 'border-[var(--border-subtle)]'
      }`}
    >
      {tryOn.imageUrl ? (
        <div className={tryOn.backImageUrl ? 'mb-2 grid grid-cols-2 gap-1' : 'mb-2'}>
          <button
            type="button"
            className="block w-full cursor-zoom-in rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            aria-label={`View ${name} larger`}
            data-testid="fitting-compare-front"
            onClick={() => onOpen()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tryOn.imageUrl} alt={name} className="h-28 w-full rounded object-cover" />
          </button>
          {tryOn.backImageUrl ? (
            <button
              type="button"
              className="block w-full cursor-zoom-in rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              aria-label={`View the back of ${name} larger`}
              data-testid="fitting-compare-back"
              onClick={() => onOpen({ back: true })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tryOn.backImageUrl}
                alt={`${name} — back`}
                className="h-28 w-full rounded object-cover"
              />
            </button>
          ) : null}
        </div>
      ) : null}
      <ShotCardMenu
        label={name}
        testId="fitting-compare-menu"
        className="absolute right-3 top-3 z-20"
      >
        {tryOn.imageUrl ? (
          <button type="button" className={SHOT_CARD_MENU_ITEM_CLASS} onClick={() => onOpen()}>
            Open full size
          </button>
        ) : null}
        <button
          type="button"
          className={SHOT_CARD_MENU_ITEM_CLASS}
          disabled={busy}
          title="Dismiss this try-on (stay on the current kit)"
          data-testid="fitting-pass-try-on"
          onClick={onPass}
        >
          Pass
        </button>
        <button
          type="button"
          className={SHOT_CARD_MENU_ITEM_CLASS}
          disabled={busy}
          title="Queue this kit again"
          data-testid="fitting-requeue-try-on"
          onClick={onRequeue}
        >
          Requeue · new seed
        </button>
      </ShotCardMenu>
      <figcaption className="type-caption truncate text-[var(--text-muted)]">{name}</figcaption>
      <TryOnReviewLine review={review} reviewing={reviewing} suggested={suggested} />
      <Button
        size="sm"
        variant="primary"
        disabled={busy}
        className="mt-2 w-full justify-center"
        data-testid="fitting-keep"
        onClick={onKeep}
      >
        Keep
      </Button>
    </figure>
  );
}
