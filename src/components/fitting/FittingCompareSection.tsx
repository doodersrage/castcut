'use client';

import { Button, ButtonLink } from '@/components/ui/Button';
import { CollapsibleSection, ToolSection } from '@/components/ui/ToolPageShell';
import type { FittingCompareTryOn } from '@/lib/fitting-room';

export type FittingCompareSectionProps = {
  compareTryOns: FittingCompareTryOn[];
  leanChrome: boolean;
  busy: boolean;
  continueDayHref: string | null;
  onKeepTryOn: (tryOn: FittingCompareTryOn) => string | null;
  onSoftAdvance?: (href: string) => void;
  onSkipKit: () => void;
};

export default function FittingCompareSection({
  compareTryOns,
  leanChrome,
  busy,
  continueDayHref,
  onKeepTryOn,
  onSoftAdvance,
  onSkipKit,
}: FittingCompareSectionProps) {
  if (compareTryOns.length === 0) {
    return null;
  }

  return (
    <ToolSection
      title="Compare try-ons"
      description="Keep a winner as a Cast keeper, or skip to the next kit."
      data-testid="fitting-compare"
    >
      <CollapsibleSection
        title="Recent try-ons"
        summary="Side-by-side Keep / Skip for the last completed kits."
        defaultOpen={!leanChrome}
        persistKey="fitting-compare"
      >
        <div className="flex gap-3 overflow-x-auto pb-1">
          {compareTryOns.map(tryOn => (
            <figure
              key={tryOn.promptId}
              className="min-w-[7.5rem] shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
            >
              {tryOn.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tryOn.imageUrl}
                  alt={tryOn.wardrobeLabel || tryOn.wardrobeId || 'Try-on'}
                  className="mb-2 h-28 w-full rounded object-cover"
                />
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
        {continueDayHref ? (
          <div className="mt-3">
            <ButtonLink href={continueDayHref} size="sm" variant="primary">
              Continue in Day
            </ButtonLink>
          </div>
        ) : null}
      </CollapsibleSection>
    </ToolSection>
  );
}
