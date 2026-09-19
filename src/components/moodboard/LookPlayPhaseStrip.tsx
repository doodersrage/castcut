'use client';

import { LOOK_PLAY_PHASES, type LookPlayPhaseId } from '@/lib/moodboard-scene';

type LookPlayPhaseStripProps = {
  activePhase: LookPlayPhaseId;
};

/** Compact Look micro-funnel: Tiles → Extract → Plate → Continue. */
export default function LookPlayPhaseStrip({ activePhase }: LookPlayPhaseStripProps) {
  const activeIndex = LOOK_PLAY_PHASES.findIndex(phase => phase.id === activePhase);

  return (
    <ol
      className="flex flex-wrap gap-2"
      data-testid="look-play-phases"
      data-active-phase={activePhase}
      aria-label="Look film phases"
    >
      {LOOK_PLAY_PHASES.map((phase, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        const chipClass = `rounded-[var(--radius-md)] border px-2.5 py-1 type-caption ${
          active
            ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
            : done
              ? 'border-[var(--tint-success-border)] text-[var(--tint-success-text)]'
              : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
        }`;
        return (
          <li key={phase.id}>
            <span
              className={chipClass}
              data-testid={`look-play-phase-${phase.id}`}
              data-active={active ? 'true' : 'false'}
              data-done={done ? 'true' : 'false'}
              title={phase.description}
            >
              {index + 1}. {phase.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
