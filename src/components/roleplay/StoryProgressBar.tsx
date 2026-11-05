'use client';

/**
 * Where the episode is (2026-11-05): one segment per plot scene, then the ending — it was a line
 * of text ("10 scenes, then an ending").
 */
export default function StoryProgressBar({
  plot,
  plotTotal,
  ended,
}: {
  plot: number;
  plotTotal: number;
  ended: boolean;
}) {
  const label = ended
    ? 'The end'
    : plot >= plotTotal
      ? 'The ending is next'
      : `Scene ${plot + 1} of ${plotTotal}`;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" data-testid="story-progress">
      <div
        className="flex min-w-0 flex-1 gap-0.5"
        role="progressbar"
        aria-label="Story progress"
        aria-valuemin={0}
        aria-valuemax={plotTotal + 1}
        aria-valuenow={plot + (ended ? 1 : 0)}
        aria-valuetext={label}
      >
        {Array.from({ length: plotTotal }, (_, index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full ${
              index < plot ? 'bg-[var(--accent)]' : 'bg-[var(--border-subtle)]'
            }`}
          />
        ))}
        <span
          title="The ending"
          className={`ml-1 h-1.5 w-4 rounded-full ${
            ended ? 'bg-[var(--tint-success-text)]' : 'bg-[var(--border-default)]'
          }`}
        />
      </div>
      <span className="type-caption shrink-0 text-[var(--text-muted)]">{label}</span>
    </div>
  );
}
