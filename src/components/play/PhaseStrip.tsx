'use client';

/**
 * A film's phases inside one page (Day: Stills → Animate → Cut film → Save film; Story: the same
 * less Save), named for what they belong to ("This Day") so their numbers aren't read as Film's
 * own steps (1. Cast · 2. Day · 3. Cut film). One chip style with Film's step strip: the current
 * phase tinted, done ones green.
 */
export default function PhaseStrip({
  scope,
  phases,
  activeIndex,
  details = {},
  testId,
}: {
  /** What the phases belong to: "This Day", "This Story". */
  scope: string;
  phases: ReadonlyArray<{ id: string; label: string; description: string }>;
  activeIndex: number;
  /** A count after a phase's name ("4/4"), by phase id. */
  details?: Record<string, string>;
  /** `day-play-phases` → the list; each chip `day-play-phase-<id>`. */
  testId: string;
}) {
  const activePhase = phases[activeIndex]?.id ?? '';
  return (
    // One line on a phone too (it wrapped "4. Save film" under the rest): it scrolls sideways,
    // as Film's step strip does.
    <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <span className="type-caption shrink-0 text-[var(--text-muted)]">{scope}</span>
      <ol
        className="flex shrink-0 gap-2 sm:shrink sm:flex-wrap"
        data-testid={testId}
        data-active-phase={activePhase}
        aria-label={`${scope} — phases`}
      >
        {phases.map((phase, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          const detail = details[phase.id];
          return (
            <li key={phase.id} className="shrink-0">
              <span
                className={`rounded-[var(--radius-md)] border px-2.5 py-1 type-caption ${
                  active
                    ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                    : done
                      ? 'border-[var(--tint-success-border)] text-[var(--tint-success-text)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
                data-testid={`${testId.replace(/s$/, '')}-${phase.id}`}
                data-active={active ? 'true' : 'false'}
                data-done={done ? 'true' : 'false'}
                aria-current={active ? 'step' : undefined}
                title={phase.description}
              >
                {index + 1}. {phase.label}
                {detail ? ` · ${detail}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
