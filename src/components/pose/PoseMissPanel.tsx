'use client';

import PoseBodiesSvg from '@/components/pose/PoseBodiesSvg';
import { formatPoseLimbMisses, type PoseMissView } from '@/lib/pose-coaching';

/**
 * A pose miss, shown: the guide's lead (faint, dashed) with the still's lead laid over it,
 * and the limbs that differ — so it's clear whether to retry, pick another pose, or keep it.
 */
export default function PoseMissPanel({
  view,
  testId = 'pose-miss',
}: {
  view: PoseMissView;
  testId?: string;
}) {
  const detail = formatPoseLimbMisses(view.misses, 3);
  return (
    <div className="flex items-start gap-3" data-testid={testId}>
      <PoseBodiesSvg
        aspect={view.aspect}
        height={96}
        label="Guide pose with the still's pose laid over it"
        testId={`${testId}-figure`}
        layers={[
          { bodies: [view.guide], color: 'var(--text-muted)', opacity: 0.7, dashed: true },
          { bodies: [view.still], color: 'var(--tint-warning-text, #c77700)' },
        ]}
      />
      <div className="min-w-0 space-y-1 type-caption text-[var(--text-muted)]">
        <p className="text-[var(--text-secondary)]">
          Last still missed the pose ({Math.round(view.score * 100)}% match).
        </p>
        <p data-testid={`${testId}-limbs`}>
          {detail
            ? `Off: ${detail}.`
            : 'Close on each limb — the miss is in placement or headcount.'}
        </p>
        <p>
          <span className="mr-2 inline-block h-0 w-4 border-t-2 border-dashed border-[var(--text-muted)] align-middle" />
          guide
          <span className="mx-2 inline-block h-0 w-4 border-t-2 border-[var(--tint-warning-text,#c77700)] align-middle" />
          still
        </p>
      </div>
    </div>
  );
}
