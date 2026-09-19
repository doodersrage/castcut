'use client';

import { PLAY_STORY_PHASES, type PlayStoryPhaseId } from '@/lib/play-step-machine';

type StoryPlayPhaseStripProps = {
  activePhase: PlayStoryPhaseId;
  completedStills: number;
  completedClips: number;
  beatTotal?: number;
};

/** Compact Story micro-funnel: Queue → Animate → Cut. */
export default function StoryPlayPhaseStrip({
  activePhase,
  completedStills,
  completedClips,
  beatTotal = 0,
}: StoryPlayPhaseStripProps) {
  const activeIndex = PLAY_STORY_PHASES.findIndex(phase => phase.id === activePhase);

  return (
    <ol
      className="flex flex-wrap gap-2"
      data-testid="story-play-phases"
      data-active-phase={activePhase}
      aria-label="Story film phases"
    >
      {PLAY_STORY_PHASES.map((phase, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        const chipClass = `rounded-[var(--radius-md)] border px-2.5 py-1 type-caption ${
          active
            ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
            : done
              ? 'border-[var(--tint-success-border)] text-[var(--tint-success-text)]'
              : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
        }`;
        let detail = '';
        if (phase.id === 'queue') {
          detail = ` · ${completedStills}/${Math.max(beatTotal, 1)}`;
        } else if (phase.id === 'animate') {
          detail = ` · ${completedClips}/${Math.max(completedStills, 1)}`;
        }
        return (
          <li key={phase.id}>
            <span
              className={chipClass}
              data-testid={`story-play-phase-${phase.id}`}
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
