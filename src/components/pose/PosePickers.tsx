'use client';

import { memo, useMemo, type MouseEvent } from 'react';
import { POSE_FIGURE_COLORS, PoseFigureShape } from '@/components/pose/PoseBodiesSvg';
import { dayPoseAsPhotoPose, soloDayPoseGroups } from '@/lib/day/pose-presets';
import { usePoseReferences } from '@/hooks/usePoseReferences';
import { poseReferenceCreditLine, type PoseReference } from '@/lib/pose/references';
import { poseLayoutLabel } from '@/lib/pose/layout-labels';
import type { NormalizedBody } from '@/lib/pose/library';
import { Button } from '@/components/ui/Button';

/**
 * Real-world reference poses (pose-references.ts) as small figures, grouped by Day pose in Day's
 * order. Each tile's tooltip credits the photo it was read from.
 */
export function ReferencePosePicker({
  testIdPrefix,
  twoPeople,
  onPick,
}: {
  testIdPrefix: string;
  twoPeople: boolean;
  onPick: (reference: PoseReference) => void;
}) {
  const references = usePoseReferences();
  const groups = useMemo(() => {
    const order = new Map(
      [...soloDayPoseGroups().flatMap(group => group.ids), 'hug', 'dance', 'fight'].map(
        (id, index) => [id, index]
      )
    );
    const byPose = new Map<string, PoseReference[]>();
    for (const reference of references) {
      if (reference.people.length > 1 && !twoPeople) continue;
      byPose.set(reference.pose, [...(byPose.get(reference.pose) ?? []), reference]);
    }
    return [...byPose.entries()].sort(
      ([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b)
    );
  }, [references, twoPeople]);
  return (
    <div
      className="max-h-72 space-y-2 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
      data-testid={`${testIdPrefix}-real-pose-grid`}
      onClick={event => {
        const id = pickedId(event, 'data-reference-id');
        const reference = id ? references.find(entry => entry.id === id) : undefined;
        if (reference) onPick(reference);
      }}
    >
      {groups.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">Loading real poses…</p>
      ) : null}
      <ReferencePoseTiles groups={groups} testIdPrefix={testIdPrefix} />
    </div>
  );
}

/**
 * Picks a tile by a data attribute on it, so the tile grids take no callback and can skip
 * re-rendering while the editor around them re-renders on every drag move.
 */
function pickedId(event: MouseEvent<HTMLElement>, attribute: string): string | null {
  return (event.target as HTMLElement).closest(`[${attribute}]`)?.getAttribute(attribute) ?? null;
}

/** The reference tiles, memoized: dozens of drawn figures. */
const ReferencePoseTiles = memo(function ReferencePoseTiles({
  groups,
  testIdPrefix,
}: {
  groups: Array<[string, PoseReference[]]>;
  testIdPrefix: string;
}) {
  return (
    <>
      {groups.map(([pose, list]) => (
        <div key={pose} className="space-y-1">
          <p className="type-caption text-[var(--text-muted)]">{poseLayoutLabel(pose)}</p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {list.map(reference => (
              <Button
                variant="plain"
                key={reference.id}
                type="button"
                title={`${poseLayoutLabel(pose)}${reference.draft ? ' (draft)' : ''} — ${poseReferenceCreditLine(reference)}`}
                aria-label={`${poseLayoutLabel(pose)}, real pose ${reference.variant}`}
                data-testid={`${testIdPrefix}-real-pose-${reference.id}`}
                data-reference-id={reference.id}
                className="flex flex-col items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-1 text-center transition hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                <svg
                  viewBox={`0 0 ${reference.aspect} 1`}
                  aria-hidden
                  className="h-16 w-full rounded bg-white"
                >
                  {reference.people.map((body, index) => (
                    <PoseFigureShape
                      key={index}
                      body={body}
                      aspect={reference.aspect}
                      color={POSE_FIGURE_COLORS[index % POSE_FIGURE_COLORS.length]!}
                      weight={0.02}
                      parts
                    />
                  ))}
                </svg>
                <span className="text-3xs leading-tight text-[var(--text-secondary)]">
                  {reference.variant}
                </span>
              </Button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
});

const dayPoseFigures = new Map<string, { body: NormalizedBody; aspect: number } | null>();
function dayPoseFigure(id: string) {
  if (!dayPoseFigures.has(id)) {
    const pose = dayPoseAsPhotoPose(id);
    const body = pose?.people[0];
    dayPoseFigures.set(id, pose && body ? { body, aspect: pose.aspect } : null);
  }
  return dayPoseFigures.get(id) ?? null;
}

/** Day's named poses as small drawn figures, grouped as in Day's own pose list. */
export function DayPosePicker({
  testIdPrefix,
  onPick,
}: {
  testIdPrefix: string;
  onPick: (id: string) => void;
}) {
  return (
    <div
      className="max-h-72 space-y-2 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
      data-testid={`${testIdPrefix}-day-pose-grid`}
      onClick={event => {
        const id = pickedId(event, 'data-day-pose');
        if (id) onPick(id);
      }}
    >
      <DayPoseTiles testIdPrefix={testIdPrefix} />
    </div>
  );
}

/** Day's pose tiles, memoized: some seventy drawn figures. */
const DayPoseTiles = memo(function DayPoseTiles({ testIdPrefix }: { testIdPrefix: string }) {
  return (
    <>
      {soloDayPoseGroups().map(group => (
        <div key={group.label} className="space-y-1">
          <p className="type-caption text-[var(--text-muted)]">{group.label}</p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {group.ids.map(id => {
              const figure = dayPoseFigure(id);
              const label = poseLayoutLabel(id);
              return (
                <Button
                  variant="plain"
                  key={id}
                  type="button"
                  title={label}
                  data-testid={`${testIdPrefix}-day-pose-${id}`}
                  data-day-pose={id}
                  className="flex flex-col items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-1 text-center transition hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  {figure ? (
                    <svg
                      viewBox={`0 0 ${figure.aspect} 1`}
                      aria-hidden
                      className="h-16 w-full rounded bg-white"
                    >
                      <PoseFigureShape
                        body={figure.body}
                        aspect={figure.aspect}
                        color={POSE_FIGURE_COLORS[0]!}
                        weight={0.02}
                        parts
                      />
                    </svg>
                  ) : (
                    <span className="h-16 w-full rounded bg-white" />
                  )}
                  <span className="line-clamp-2 min-h-[2lh] text-3xs leading-tight text-[var(--text-secondary)]">
                    {label}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
});
