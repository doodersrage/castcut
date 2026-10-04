'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import FittingCompareCard from '@/components/fitting/FittingCompareCard';
import type { ImageLightboxState, ImageLightboxSlideChrome } from '@/components/ui/ImageLightbox';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { buildFittingCompareLightboxState, type FittingCompareTryOn } from '@/lib/fitting-room';
import { suggestTryOnToKeep, type TryOnReview } from '@/lib/fitting-tryon-review';

export { TryOnReviewLine } from '@/components/fitting/TryOnReviewLine';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

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
  /** Phone: no section chrome, a caption instead. */
  compact?: boolean;
};

/**
 * The try-ons to choose between, on desk and phone: a row of cards (picture → full size, Keep,
 * a ⋯ menu for Pass / Requeue) and the lightbox with Keep / Pass / Requeue chrome.
 */
export default function FittingCompareSection({
  compareTryOns,
  busy,
  onKeepTryOn,
  onSoftAdvance,
  onDismissTryOn,
  onRequeueTryOn,
  reviews = {},
  reviewingId = null,
  compact = false,
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
    (tryOn: FittingCompareTryOn, options?: { back?: boolean }) => {
      const next = buildFittingCompareLightboxState(compareTryOns, tryOn.promptId, options);
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

  const keep = useCallback(
    (tryOn: FittingCompareTryOn) => {
      const href = onKeepTryOn(tryOn);
      if (href) {
        onSoftAdvance?.(href);
      }
    },
    [onKeepTryOn, onSoftAdvance]
  );

  const activeTryOn = useMemo(() => {
    if (!lightbox || compareTryOns.length === 0) {
      return null;
    }
    const title = lightbox.titles?.[lightbox.index] ?? lightbox.title;
    const url = lightbox.images[lightbox.index];
    return (
      compareTryOns.find(tryOn => tryOn.imageUrl === url) ||
      // A back view's slide: Keep / Pass / ↻ act on its try-on (Keep uses the front).
      compareTryOns.find(tryOn => tryOn.backImageUrl === url) ||
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
        setLightbox(null);
        keep(activeTryOn);
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
  }, [activeTryOn, keep, onDismissTryOn, onRequeueTryOn]);

  if (compareTryOns.length === 0) {
    return null;
  }

  const cards = (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {compareTryOns.map(tryOn => (
        <FittingCompareCard
          key={tryOn.promptId}
          tryOn={tryOn}
          busy={busy}
          review={reviews[tryOn.promptId]}
          reviewing={reviewingId === tryOn.promptId}
          suggested={suggestedId === tryOn.promptId}
          onOpen={options => openLightbox(tryOn, options)}
          onKeep={() => keep(tryOn)}
          onPass={() => onDismissTryOn(tryOn)}
          onRequeue={() => void onRequeueTryOn(tryOn)}
        />
      ))}
    </div>
  );

  const lightboxElement = (
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
  );

  if (compact) {
    return (
      <>
        <div className="space-y-2" data-testid="mobile-fitting-compare">
          <p className="type-caption text-[var(--text-muted)]">
            Compare try-ons · tap for full size · Keep, or Pass / Requeue from ⋯
          </p>
          {cards}
        </div>
        {lightboxElement}
      </>
    );
  }

  return (
    <>
      <ToolSection
        title="Compare try-ons"
        description="Tap a picture for full size. Keep a winner — Day continues after Keep; Pass and Requeue are in each card's ⋯ menu, and Skip kit (below) advances the wardrobe deck."
        data-testid="fitting-compare"
      >
        {cards}
      </ToolSection>
      {lightboxElement}
    </>
  );
}
