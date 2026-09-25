'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ImageLightboxState, ImageLightboxSlideChrome } from '@/components/ui/ImageLightbox';
import { CollapsibleSection, ToolSection } from '@/components/ui/ToolPageShell';
import { buildFittingCompareLightboxState, type FittingCompareTryOn } from '@/lib/fitting-room';
import {
  suggestTryOnToKeep,
  tryOnReviewScoreLine,
  type TryOnReview,
} from '@/lib/fitting-tryon-review';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

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
          {review.status === 'warn' ? ' — try ↻ or Pass' : ''}
        </p>
      ) : null}
    </div>
  );
}

export type FittingCompareSectionProps = {
  compareTryOns: FittingCompareTryOn[];
  busy: boolean;
  onKeepTryOn: (tryOn: FittingCompareTryOn) => string | null;
  onSoftAdvance?: (href: string) => void;
  /** Remove this try-on from compare without advancing the kit deck. */
  onDismissTryOn: (tryOn: FittingCompareTryOn) => void;
  /** Requeue this kit / BYO from the card or lightbox. */
  onRequeueTryOn: (tryOn: FittingCompareTryOn) => void;
  /** Auto-review results by promptId (face match + outfit read). */
  reviews?: Record<string, TryOnReview>;
  /** Try-on being reviewed right now. */
  reviewingId?: string | null;
};

export default function FittingCompareSection({
  compareTryOns,
  busy,
  onKeepTryOn,
  onSoftAdvance,
  onDismissTryOn,
  onRequeueTryOn,
  reviews = {},
  reviewingId = null,
}: FittingCompareSectionProps) {
  const suggestedId = suggestTryOnToKeep(
    compareTryOns.flatMap(tryOn =>
      reviews[tryOn.promptId]
        ? [{ promptId: tryOn.promptId, review: reviews[tryOn.promptId]! }]
        : []
    )
  );
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);

  const openLightbox = useCallback(
    (tryOn: FittingCompareTryOn) => {
      const next = buildFittingCompareLightboxState(compareTryOns, tryOn.promptId);
      if (!next) {
        return;
      }
      setLightbox({
        images: next.images,
        titles: next.titles,
        originalImages: next.images,
        index: next.index,
        title: next.title,
      });
    },
    [compareTryOns]
  );

  const activeTryOn = useMemo(() => {
    if (!lightbox || compareTryOns.length === 0) {
      return null;
    }
    const title = lightbox.titles?.[lightbox.index] ?? lightbox.title;
    const url = lightbox.images[lightbox.index];
    return (
      compareTryOns.find(tryOn => tryOn.imageUrl === url) ||
      compareTryOns.find(tryOn => (tryOn.wardrobeLabel || tryOn.wardrobeId) === title) ||
      compareTryOns[lightbox.index] ||
      null
    );
  }, [compareTryOns, lightbox]);

  const slideChrome = useMemo((): ImageLightboxSlideChrome | null => {
    if (!activeTryOn) {
      return null;
    }
    return {
      showKeep: true,
      showPass: true,
      showRequeue: true,
      showSeedVariation: false,
      showImprove: false,
      showCompose: false,
      showInpaint: false,
      showUseStack: false,
      showUsePromptStack: false,
      showUseFace: false,
      onKeep: () => {
        const href = onKeepTryOn(activeTryOn);
        setLightbox(null);
        if (href) {
          onSoftAdvance?.(href);
        }
      },
      onPass: () => {
        onDismissTryOn(activeTryOn);
        setLightbox(null);
      },
      onRequeue: () => {
        void onRequeueTryOn(activeTryOn);
        setLightbox(null);
      },
    };
  }, [activeTryOn, onDismissTryOn, onKeepTryOn, onRequeueTryOn, onSoftAdvance]);

  if (compareTryOns.length === 0) {
    return null;
  }

  return (
    <>
      <ToolSection
        title="Compare try-ons"
        description="Tap a thumb for full size — Keep, Pass, or requeue from the lightbox."
        data-testid="fitting-compare"
      >
        <CollapsibleSection
          title="Recent try-ons"
          summary="Open large · Keep a winner — Day continues after Keep."
          defaultOpen
        >
          <div className="flex gap-3 overflow-x-auto pb-1">
            {compareTryOns.map(tryOn => (
              <figure
                key={tryOn.promptId}
                data-testid="fitting-compare-card"
                data-review={reviews[tryOn.promptId]?.status ?? 'none'}
                className={`w-[9rem] shrink-0 rounded-[var(--radius-md)] border p-2 ${
                  suggestedId === tryOn.promptId
                    ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]'
                    : reviews[tryOn.promptId]?.status === 'warn'
                      ? 'border-[var(--tint-warning-border)]'
                      : 'border-[var(--border-subtle)]'
                }`}
              >
                {tryOn.imageUrl ? (
                  <button
                    type="button"
                    className="mb-2 block w-full cursor-zoom-in rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    aria-label={`View ${tryOn.wardrobeLabel || tryOn.wardrobeId || 'try-on'} larger`}
                    onClick={() => openLightbox(tryOn)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tryOn.imageUrl}
                      alt={tryOn.wardrobeLabel || tryOn.wardrobeId || 'Try-on'}
                      className="h-28 w-full rounded object-cover"
                    />
                  </button>
                ) : null}
                <figcaption className="type-caption truncate text-[var(--text-muted)]">
                  {tryOn.wardrobeLabel || tryOn.wardrobeId || 'Try-on'}
                </figcaption>
                <TryOnReviewLine
                  review={reviews[tryOn.promptId]}
                  reviewing={reviewingId === tryOn.promptId}
                  suggested={suggestedId === tryOn.promptId}
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    data-testid="fitting-keep"
                    onClick={() => {
                      const href = onKeepTryOn(tryOn);
                      if (href) {
                        onSoftAdvance?.(href);
                      }
                    }}
                  >
                    Keep
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    title="Dismiss this try-on (stay on the current kit)"
                    data-testid="fitting-pass-try-on"
                    onClick={() => onDismissTryOn(tryOn)}
                  >
                    Pass
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    title="Queue this kit again"
                    data-testid="fitting-requeue-try-on"
                    onClick={() => void onRequeueTryOn(tryOn)}
                  >
                    ↻
                  </Button>
                </div>
              </figure>
            ))}
          </div>
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            Pass dismisses a try-on. Skip kit (below) advances the wardrobe deck.
          </p>
        </CollapsibleSection>
      </ToolSection>

      <ImageLightbox
        state={lightbox}
        onClose={() => setLightbox(null)}
        slideChrome={slideChrome}
        onIndexChange={index =>
          setLightbox(previous =>
            previous
              ? {
                  ...previous,
                  index,
                  title: previous.titles?.[index] ?? previous.title,
                }
              : previous
          )
        }
      />
    </>
  );
}
