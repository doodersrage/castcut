'use client';

import { FITTING_OUTFIT_PHASES, type FittingOutfitPhaseId } from '@/lib/fitting-room';

type OutfitPlayPhaseStripProps = {
  activePhase: FittingOutfitPhaseId;
  compareCount?: number;
};

/** Compact Outfit micro-funnel: Plate → Try-on → Keep → Day. */
export default function OutfitPlayPhaseStrip({
  activePhase,
  compareCount = 0,
}: OutfitPlayPhaseStripProps) {
  const activeIndex = FITTING_OUTFIT_PHASES.findIndex(phase => phase.id === activePhase);

  return (
    <ol
      className="flex flex-wrap gap-2"
      data-testid="outfit-play-phases"
      data-active-phase={activePhase}
      aria-label="Outfit film phases"
    >
      {FITTING_OUTFIT_PHASES.map((phase, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        const chipClass = `rounded-[var(--radius-md)] border px-2.5 py-1 type-caption ${
          active
            ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
            : done
              ? 'border-[var(--tint-success-border)] text-[var(--tint-success-text)]'
              : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
        }`;
        const detail = phase.id === 'keep' && compareCount > 0 ? ` · ${compareCount}` : '';
        return (
          <li key={phase.id}>
            <span
              className={chipClass}
              data-testid={`outfit-play-phase-${phase.id}`}
              data-active={active ? 'true' : 'false'}
              data-done={done ? 'true' : 'false'}
              title={phase.description}
            >
              {index + 1}. {phase.label}
              {detail}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
