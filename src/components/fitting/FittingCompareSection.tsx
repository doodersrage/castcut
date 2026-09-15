'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
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
  onSkipKit: () => void;
};

export default function FittingCompareSection({
  compareTryOns,
  busy,
  onKeepTryOn,
  onSoftAdvance,
  onSkipKit,
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

  if (compareTryOns.length === 0) {
    return null;
  }

  return (
    <>
      <ToolSection
        title="Compare try-ons"
        description="Tap a thumb for full size, then Keep a winner or skip to the next kit."
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
                  <Button size="sm" variant="ghost" disabled={busy} onClick={onSkipKit}>
                    Skip
                  </Button>
                </div>
              </figure>
            ))}
          </div>
        </CollapsibleSection>
      </ToolSection>

      <ImageLightbox
        state={lightbox}
        onClose={() => setLightbox(null)}
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
