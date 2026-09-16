'use client';

import { PLAY_DAY_PHASES, type PlayDayPhaseId } from '@/lib/play-step-machine';

type DayPlayPhaseStripProps = {
  activePhase: PlayDayPhaseId;
  completedStills: number;
  completedClips: number;
  slotTotal?: number;
};

/** Compact Day micro-funnel: Queue → Animate → Cut → Save. */
export default function DayPlayPhaseStrip({
  activePhase,
  completedStills,
  completedClips,
  slotTotal = 4,
}: DayPlayPhaseStripProps) {
  const activeIndex = PLAY_DAY_PHASES.findIndex(phase => phase.id === activePhase);

  return (
    <ol
      className="flex flex-wrap gap-2"
      data-testid="day-play-phases"
      data-active-phase={activePhase}
      aria-label="Day film phases"
    >
      {PLAY_DAY_PHASES.map((phase, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        const chipClass = `rounded-[var(--radius-md)] border px-2.5 py-1 type-caption ${
          active
            ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
            : done
              ? 'border-[var(--tint-success-border)] text-[var(--tint-success-text)]'
              : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
        }`;
        let detail = '';
        if (phase.id === 'queue') {
          detail = ` · ${completedStills}/${slotTotal}`;
        } else if (phase.id === 'animate') {
          detail = ` · ${completedClips}/${Math.max(completedStills, 1)}`;
        }
        return (
          <li key={phase.id}>
            <span
              className={chipClass}
              data-testid={`day-play-phase-${phase.id}`}
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
