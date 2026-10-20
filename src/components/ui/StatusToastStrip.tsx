'use client';

import { useEffect, useMemo, useState } from 'react';
import { isTransientProgressStatus } from '@/lib/app/status-progress';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import UiIcon from '@/components/ui/UiIcon';

export type StatusToastNote = {
  id: string;
  text: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
};

const TONE_CLASS: Record<NonNullable<StatusToastNote['tone']>, string> = {
  neutral: 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
  success:
    'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]',
  warning:
    'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]',
  danger:
    'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]',
  info: 'border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] text-[var(--tint-info-text)]',
};

/**
 * Collapses stacked status strings into one strip showing the latest note,
 * with optional expand for the rest. Progress lines stay visually quieter.
 */
export default function StatusToastStrip({
  notes,
  className = '',
}: {
  notes: StatusToastNote[];
  className?: string;
}) {
  const cleaned = useMemo(() => {
    const mapped = notes
      .map(note => ({
        ...note,
        text: note.text.trim(),
      }))
      .filter(note => note.text.length > 0);

    // Keep only the latest progress line per id so bulk 1/N updates don't stack.
    const byId = new Map<string, StatusToastNote>();
    for (const note of mapped) {
      const previous = byId.get(note.id);
      if (
        previous &&
        isTransientProgressStatus(previous.text) &&
        isTransientProgressStatus(note.text)
      ) {
        byId.set(note.id, note);
        continue;
      }
      byId.set(note.id, note);
    }
    return [...byId.values()];
  }, [notes]);
  const [expanded, setExpanded] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const fingerprint = cleaned.map(note => `${note.id}:${note.text}`).join('|');

  useEffect(() => {
    scheduleAfterCommit(() => {
      setDismissedKey(null);
      setExpanded(false);
    });
  }, [fingerprint]);

  if (cleaned.length === 0 || dismissedKey === fingerprint) {
    return null;
  }

  const latest = cleaned[cleaned.length - 1]!;
  const older = cleaned.slice(0, -1);
  const quiet = isTransientProgressStatus(latest.text);

  return (
    <div
      role="status"
      aria-live={quiet ? 'polite' : 'assertive'}
      data-quiet={quiet ? 'true' : 'false'}
      className={`ui-toast ${
        quiet ? '' : TONE_CLASS[latest.tone ?? 'neutral']
      } ui-tray-notice ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <p className="type-caption min-w-0 flex-1 leading-relaxed">{latest.text}</p>
        <div className="flex shrink-0 items-center gap-2">
          {older.length > 0 ? (
            <button
              type="button"
              className="type-caption text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              onClick={() => setExpanded(value => !value)}
            >
              {expanded ? 'Hide' : `+${older.length}`}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss status"
            className="inline-flex items-center justify-center rounded-md p-0.5 text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            onClick={() => setDismissedKey(fingerprint)}
          >
            <UiIcon name="close" size={12} />
          </button>
        </div>
      </div>
      {expanded && older.length > 0 ? (
        <ul className="mt-2 space-y-1.5 border-t border-[var(--border-subtle)] pt-2">
          {[...older].reverse().map(note => (
            <li key={`${note.id}-${note.text}`} className="type-caption opacity-80">
              {note.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
