'use client';

import type { ContinuityLock } from '@/lib/day/continuity-locks';

/**
 * "Held across the Day" — face, clothes, place, light — and what each still is free to change,
 * before Queue (day-continuity-locks.ts). Held items are solid chips; loose ones dashed.
 */
export default function DayContinuityLocks({
  locks,
  testId = 'day-continuity',
}: {
  locks: ContinuityLock[];
  testId?: string;
}) {
  if (locks.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={testId}>
      <span
        className="type-caption text-[var(--text-muted)]"
        title="Pose, setting and the beat change in each still."
      >
        Held across the Day:
      </span>
      {locks.map(lock => (
        <span
          key={lock.id}
          title={lock.detail}
          data-testid={`${testId}-${lock.id}`}
          data-held={lock.held ? 'true' : 'false'}
          className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-2xs leading-4 ${
            lock.held
              ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
              : 'border-dashed border-[var(--border-subtle)] text-[var(--text-muted)]'
          }`}
        >
          <span aria-hidden>{lock.held ? '●' : '○'}</span>
          {/* Long outfit names ran off a phone screen: the label truncates inside the chip. */}
          <span className="min-w-0 truncate">{lock.label}</span>
          <span className="sr-only">
            {lock.held ? ' (held)' : ' (each still its own)'} — {lock.detail}
          </span>
        </span>
      ))}
    </div>
  );
}
