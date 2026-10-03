'use client';

import { Button } from '@/components/ui/Button';
import {
  dayStillShownImage,
  daySlotProgressState,
  type DaySlot,
  type DaySlotStill,
} from '@/lib/day-planner';

/**
 * Redo one still with the same seed after changing its beat or outfit, then pick the old or the
 * new take. A plain requeue rolls a new seed, so a change and luck can't be told apart.
 * The same compare shows a Best of two pair (hard poses): the kept take and the other one.
 */
export function DaySameSeedRedo({
  slot,
  still,
  busy,
  blocked,
  onRedo,
  onKeepOld,
  onKeepNew,
}: {
  slot: DaySlot;
  still: DaySlotStill | undefined;
  busy: boolean;
  blocked: boolean;
  onRedo: () => void;
  onKeepOld: () => void;
  onKeepNew: () => void;
}) {
  const state = daySlotProgressState(still);
  const previous = still?.previousTake;
  const current = dayStillShownImage(still);
  if (previous) {
    const waiting = state !== 'done' || !current;
    const pair = previous.kind === 'best-of-two';
    const pct = (score: number | undefined) =>
      typeof score === 'number' ? ` · pose ${Math.round(score * 100)}%` : '';
    const takes = pair
      ? [
          {
            label: waiting
              ? 'Second take'
              : still?.bestOfTwo
                ? `Kept take${pct(still.bestOfTwo.keptScore)}`
                : 'Second take',
            url: waiting ? '' : current,
          },
          {
            label: `${waiting || !still?.bestOfTwo ? 'First take' : 'Other take'}${pct(previous.poseScore)}`,
            url: previous.imageUrl,
          },
        ]
      : [
          { label: 'Old take', url: previous.imageUrl },
          { label: 'New take', url: waiting ? '' : current },
        ];
    const caption = pair
      ? waiting
        ? `${slot.label}: a second take for the hard pose — the closer one is kept.`
        : still?.bestOfTwo
          ? `${slot.label}, best of two: the take whose pose reads closer is kept.`
          : `${slot.label}, two takes of the hard pose — keep one.`
      : waiting
        ? `Redoing ${slot.label} with the same seed — the old take stays until you choose.`
        : `${slot.label}, same seed: old take and new take.`;
    return (
      <div
        className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3"
        data-testid="day-same-seed-compare"
      >
        <p className="type-caption text-[var(--text-muted)]">{caption}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {takes.map(take => (
            <figure key={take.label} className="min-w-0">
              <div className="aspect-[3/4] overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-muted)]">
                {take.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- gallery still preview
                  <img
                    src={take.url}
                    alt={`${slot.label} — ${take.label.toLowerCase()}`}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <figcaption className="type-caption mt-1 text-[var(--text-muted)]">
                {take.label}
              </figcaption>
            </figure>
          ))}
        </div>
        {waiting ? null : (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              data-testid="day-same-seed-keep-new"
              onClick={onKeepNew}
            >
              {pair ? 'Keep this take' : 'Keep the new take'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              data-testid="day-same-seed-keep-old"
              onClick={onKeepOld}
            >
              {pair ? 'Use the other take' : 'Keep the old take'}
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (state !== 'done' || !current) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy || blocked}
        data-testid="day-same-seed-redo"
        onClick={onRedo}
      >
        Redo · same seed
      </Button>
      <span className="type-caption text-[var(--text-muted)]">
        Change the beat or outfit first — the same seed means only your change moves.
      </span>
    </div>
  );
}
