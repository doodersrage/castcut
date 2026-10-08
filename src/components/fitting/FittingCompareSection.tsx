'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { TryOnReviewLine } from '@/components/fitting/TryOnReviewLine';
import { Button } from '@/components/ui/Button';
import FittingCompareCard from '@/components/fitting/FittingCompareCard';
import type { ImageLightboxState, ImageLightboxSlideChrome } from '@/components/ui/ImageLightbox';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { buildFittingCompareLightboxState, type FittingCompareTryOn } from '@/lib/fitting-room';
import { suggestTryOnToKeep, type TryOnReview } from '@/lib/fitting-tryon-review';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { findGalleryEntryForStill, recordFixAreaInGallery } from '@/lib/fix-area-gallery';
import { comfyViewUrlForStill, isComfyViewUrl } from '@/lib/still-comfy-url';

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
  /** Fix an area (fix-area.ts) used on a try-on: the fixed picture replaces its card. */
  onUseFixedTryOn?: (
    tryOn: FittingCompareTryOn,
    fixed: { promptId: string; imageUrl: string; galleryEntryId?: string }
  ) => void;
  /** Requeue this kit / BYO from the card or lightbox. */
  onRequeueTryOn: (tryOn: FittingCompareTryOn) => void;
  /** Auto-review results by promptId (face match + outfit read). */
  reviews?: Record<string, TryOnReview>;
  /** Try-on being reviewed right now. */
  reviewingId?: string | null;
  /** Phone: no section chrome, a caption instead. */
  compact?: boolean;
  /**
   * Desk fitting room: the picked try-on large with Keep / Again / Fix / Pass and the others as
   * a strip under it; with no try-on yet it shows `pending` or `empty` instead of nothing.
   */
  layout?: 'cards' | 'stage';
  /** The try-on rendering now (stage only). */
  pending?: { label: string; status?: string | null } | null;
  /** What the stage shows before the first try-on (the plate). */
  empty?: ReactNode;
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
  onUseFixedTryOn,
  reviews = {},
  reviewingId = null,
  compact = false,
  layout = 'cards',
  pending = null,
  empty = null,
}: FittingCompareSectionProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
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
    const shownUrl = lightbox?.images[lightbox.index];
    // Fix an area on the front picture (a back view's slide is its own render, not fixed here).
    const front = shownUrl && shownUrl === activeTryOn.imageUrl ? shownUrl : null;
    const gallery = front && onUseFixedTryOn ? loadComfyGallery() : [];
    const comfyUrl = front
      ? isComfyViewUrl(front)
        ? front
        : comfyViewUrlForStill({ promptId: activeTryOn.promptId }, gallery)
      : null;
    const parent = comfyUrl
      ? findGalleryEntryForStill(gallery, { promptId: activeTryOn.promptId, comfyUrl })
      : null;
    return {
      fixArea:
        front && onUseFixedTryOn
          ? {
              displayUrl: front,
              comfyUrl,
              workflowJson: parent?.workflowJson ?? null,
              galleryEntryId: parent?.id ?? null,
              title: activeTryOn.wardrobeLabel || activeTryOn.wardrobeId,
              adult: parent?.adultCheck ? { clothed: false } : null,
              onUse: async result => {
                const entry = await recordFixAreaInGallery(parent, result);
                onUseFixedTryOn(activeTryOn, {
                  promptId: result.promptId,
                  imageUrl: result.imageUrl,
                  ...(entry ? { galleryEntryId: entry.id } : {}),
                });
                setLightbox(null);
              },
            }
          : null,
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
  }, [activeTryOn, keep, lightbox, onDismissTryOn, onRequeueTryOn, onUseFixedTryOn]);

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

  if (layout === 'stage') {
    const picked =
      compareTryOns.find(tryOn => tryOn.promptId === pickedId) ?? compareTryOns[0] ?? null;
    const name = picked ? picked.wardrobeLabel || picked.wardrobeId || 'Try-on' : '';
    return (
      <>
        <section className="ui-card space-y-3 p-3" aria-label="Try-on" data-testid="fitting-stage">
          {pending ? (
            <p
              className="type-caption rounded-[var(--radius-md)] bg-[var(--accent-muted)] px-3 py-2 text-[var(--accent-text)]"
              role="status"
              data-testid="fitting-stage-pending"
            >
              Trying on {pending.label}…{pending.status ? ` ${pending.status}` : ''}
            </p>
          ) : null}
          {picked?.imageUrl ? (
            <figure
              data-testid="fitting-compare-card"
              data-review={reviews[picked.promptId]?.status ?? 'none'}
              className="space-y-2"
            >
              <div className={picked.backImageUrl ? 'grid grid-cols-2 gap-2' : ''}>
                <button
                  type="button"
                  className="block w-full cursor-zoom-in rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  aria-label={`View ${name} larger`}
                  data-testid="fitting-compare-front"
                  onClick={() => openLightbox(picked)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={picked.imageUrl}
                    alt={name}
                    className="mx-auto max-h-[70vh] w-full rounded-[var(--radius-md)] object-contain"
                  />
                </button>
                {picked.backImageUrl ? (
                  <button
                    type="button"
                    className="block w-full cursor-zoom-in rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    aria-label={`View the back of ${name} larger`}
                    data-testid="fitting-compare-back"
                    onClick={() => openLightbox(picked, { back: true })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={picked.backImageUrl}
                      alt={`${name} — back`}
                      className="mx-auto max-h-[70vh] w-full rounded-[var(--radius-md)] object-contain"
                    />
                  </button>
                ) : null}
              </div>
              <figcaption className="type-heading truncate">{name}</figcaption>
              <TryOnReviewLine
                review={reviews[picked.promptId]}
                reviewing={reviewingId === picked.promptId}
                suggested={suggestedId === picked.promptId}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  data-testid="fitting-keep"
                  onClick={() => keep(picked)}
                >
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  title="The same clothes again, new seed"
                  data-testid="fitting-requeue-try-on"
                  onClick={() => void onRequeueTryOn(picked)}
                >
                  Again
                </Button>
                {onUseFixedTryOn ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    title="Open full size and fix an area (a hand, the shoes…)"
                    data-testid="fitting-fix-try-on"
                    onClick={() => openLightbox(picked)}
                  >
                    Fix
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  title="Dismiss this try-on"
                  data-testid="fitting-pass-try-on"
                  onClick={() => onDismissTryOn(picked)}
                >
                  Pass
                </Button>
              </div>
            </figure>
          ) : pending ? null : (
            <div data-testid="fitting-stage-empty">{empty}</div>
          )}
          {compareTryOns.length > 1 ? (
            <div>
              <p className="type-overline mb-1 text-[var(--text-muted)]">
                Try-ons · {compareTryOns.length}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1" data-testid="fitting-stage-strip">
                {compareTryOns.map(tryOn => {
                  const label = tryOn.wardrobeLabel || tryOn.wardrobeId || 'Try-on';
                  const on = tryOn.promptId === picked?.promptId;
                  return (
                    <button
                      key={tryOn.promptId}
                      type="button"
                      aria-pressed={on}
                      aria-label={`Show ${label}`}
                      title={label}
                      data-testid="fitting-stage-thumb"
                      className={`shrink-0 rounded-[var(--radius-md)] border-2 p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                        on
                          ? 'border-[var(--accent)]'
                          : suggestedId === tryOn.promptId
                            ? 'border-[var(--accent-border)]'
                            : 'border-transparent'
                      }`}
                      onClick={() => setPickedId(tryOn.promptId)}
                    >
                      {tryOn.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={tryOn.imageUrl}
                          alt=""
                          className="h-20 w-14 rounded object-cover"
                        />
                      ) : (
                        <span className="block h-20 w-14 rounded bg-[var(--bg-muted)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
        {lightboxElement}
      </>
    );
  }

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
