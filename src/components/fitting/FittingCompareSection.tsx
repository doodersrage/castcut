'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ImageLightboxState, ImageLightboxSlideChrome } from '@/components/ui/ImageLightbox';
import { CollapsibleSection, ToolSection } from '@/components/ui/ToolPageShell';
import { buildFittingCompareLightboxState, type FittingCompareTryOn } from '@/lib/fitting-room';

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
};

export default function FittingCompareSection({
  compareTryOns,
  busy,
  onKeepTryOn,
  onSoftAdvance,
  onDismissTryOn,
  onRequeueTryOn,
}: FittingCompareSectionProps) {
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
                className="min-w-[7.5rem] shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
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
