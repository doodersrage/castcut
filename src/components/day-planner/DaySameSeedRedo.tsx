'use client';

import { Button } from '@/components/ui/Button';
import {
  dayStillShownImage,
  daySlotProgressState,
  type DaySlot,
  type DaySlotStill,
} from '@/lib/day-planner';
import { dayTwoTakesOrdered, dayTwoTakesPending, dayTwoTakesReady } from '@/lib/day-two-takes';

/**
 * Two takes of an intimate still side by side (day-two-takes.ts): a "Keep this one" under each
 * once both have landed; a take still rendering shows an empty frame. Used on the slot card and
 * in the slot sheet. The take that counted fewer oddities (faces, hands, limbs —
 * duo-still-check.ts) is shown first with a note; the labels stay with their takes.
 */
export function DayTwoTakesPick({
  slot,
  still,
  onPick,
  testId,
  compact = false,
}: {
  slot: DaySlot;
  still: DaySlotStill;
  onPick: (keep: 'first' | 'second') => void;
  testId: string;
  compact?: boolean;
}) {
  const ready = dayTwoTakesReady(still);
  const takes = dayTwoTakesOrdered(still);
  return (
    <div
      className={
        compact
          ? 'space-y-1.5'
          : 'rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3'
      }
      data-testid={testId}
      data-ready={ready ? 'true' : 'false'}
    >
      {compact ? null : (
        <p className="type-caption text-[var(--text-muted)]">
          {ready
            ? `${slot.label}, two takes — keep the one that looks right. The other stays beside it.`
            : `${slot.label}: two takes rendering — pick one when both land.`}
        </p>
      )}
      <div className={`grid grid-cols-2 gap-1.5 ${compact ? '' : 'mt-2'}`}>
        {takes.map(take => (
          <figure key={take.keep} className="min-w-0">
            <div className="aspect-[3/4] overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-muted)]">
              {take.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- gallery still preview
                <img
                  src={take.url}
                  alt={`${slot.label} — ${take.label.toLowerCase()}`}
                  className="h-full w-full object-cover"
                  data-testid={`${testId}-${take.keep}-image`}
                />
              ) : null}
            </div>
            {ready ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-1 w-full"
                  aria-label={`Keep ${slot.label} ${take.label.toLowerCase()}`}
                  data-testid={`${testId}-keep-${take.keep}`}
                  onClick={() => onPick(take.keep)}
                >
                  Keep this one
                </Button>
                {take.likelier && take.note ? (
                  <figcaption
                    className="type-caption mt-1 text-[var(--text-muted)]"
                    data-testid={`${testId}-likelier`}
                    data-take={take.keep}
                  >
                    {take.label}: {take.note}
                  </figcaption>
                ) : null}
              </>
            ) : (
              <figcaption className="type-caption mt-1 text-[var(--text-muted)]">
                {take.url ? take.label : `${take.label} rendering…`}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}

/**
 * Redo one still with the same seed after changing its beat or outfit, then pick the old or the
 * new take. A plain requeue rolls a new seed, so a change and luck can't be told apart.
 * The same compare shows a Best of two pair (hard poses): the kept take and the other one, and
 * an intimate still's two takes (pick one; afterwards swap to the other).
 */
export function DaySameSeedRedo({
  slot,
  still,
  busy,
  blocked,
  onRedo,
  onKeepOld,
  onKeepNew,
  onPickTwoTake,
}: {
  slot: DaySlot;
  still: DaySlotStill | undefined;
  busy: boolean;
  blocked: boolean;
  onRedo: () => void;
  onKeepOld: () => void;
  onKeepNew: () => void;
  /** Two takes: keep the first (the still) or the second. */
  onPickTwoTake?: (keep: 'first' | 'second') => void;
}) {
  const state = daySlotProgressState(still);
  const previous = still?.previousTake;
  const current = dayStillShownImage(still);
  // Two takes (intimate stills): pick one while both are new; once picked, swap at will.
  if (still && dayTwoTakesPending(still)) {
    return (
      <DayTwoTakesPick
        slot={slot}
        still={still}
        onPick={keep => onPickTwoTake?.(keep)}
        testId="day-two-takes-compare"
      />
    );
  }
  if (previous?.kind === 'two-takes') {
    return (
      <div
        className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3"
        data-testid="day-two-takes-picked"
      >
        <p className="type-caption text-[var(--text-muted)]">
          {slot.label}, two takes: your pick is shown — the other stays here.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { label: 'Kept take', url: current },
            { label: 'Other take', url: previous.imageUrl },
          ].map(take => (
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
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            data-testid="day-two-takes-swap"
            onClick={onKeepOld}
          >
            Use the other take
          </Button>
        </div>
      </div>
    );
  }
  if (previous?.kind === 'fix-area') {
    return (
      <div
        className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3"
        data-testid="day-fix-area-compare"
      >
        <p className="type-caption text-[var(--text-muted)]">
          {slot.label}, fixed area: before and after — only the painted area changed.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { label: 'Before the fix', url: previous.imageUrl },
            { label: 'Fixed', url: current },
          ].map(take => (
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
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" data-testid="day-fix-area-keep" onClick={onKeepNew}>
            Keep the fix
          </Button>
          <Button size="sm" variant="secondary" data-testid="day-fix-area-undo" onClick={onKeepOld}>
            Undo the fix
          </Button>
        </div>
      </div>
    );
  }
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
