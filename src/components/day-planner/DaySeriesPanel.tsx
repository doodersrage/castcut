'use client';

import { Button } from '@/components/ui/Button';
import { canStitchSeries, type PlaySeries } from '@/lib/play-series';

export type DaySeriesPanelProps = {
  season: PlaySeries | null;
  stitching: boolean;
  status: string | null;
  onStitch: () => void;
  onNewSeason: () => void;
  /** Full-width stacked buttons for the phone Day tool. */
  stacked?: boolean;
};

/** Current Season summary under the Day cut status: episode count, Stitch, and New season. */
export default function DaySeriesPanel({
  season,
  stitching,
  status,
  onStitch,
  onNewSeason,
  stacked = false,
}: DaySeriesPanelProps) {
  if (!season || season.episodes.length === 0) {
    return status ? (
      <p className="type-caption text-[var(--text-muted)]" role="status">
        {status}
      </p>
    ) : null;
  }
  const count = season.episodes.length;
  const buttonClass = stacked ? 'w-full justify-center' : undefined;
  return (
    <div className="space-y-2" data-testid="day-season">
      <p className="type-caption text-[var(--text-secondary)]" data-testid="day-season-summary">
        {season.title} · {count} {count === 1 ? 'episode' : 'episodes'}
      </p>
      <div className={stacked ? 'grid gap-2' : 'flex flex-wrap gap-2'}>
        {canStitchSeries(season) ? (
          <Button
            size={stacked ? undefined : 'sm'}
            variant="secondary"
            className={buttonClass}
            loading={stitching}
            loadingLabel="Stitching"
            data-testid="day-season-stitch"
            onClick={onStitch}
          >
            Stitch season
          </Button>
        ) : null}
        <Button
          size={stacked ? undefined : 'sm'}
          variant="ghost"
          className={buttonClass}
          disabled={stitching}
          data-testid="day-season-new"
          onClick={onNewSeason}
        >
          New season
        </Button>
      </div>
      {status ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          role="status"
          data-testid="day-season-status"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
