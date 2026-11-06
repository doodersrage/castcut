'use client';

import { Button } from '@/components/ui/Button';
import type { QueuedRender } from '@/hooks/useCutRoom';
import { EXPORT_PROFILES, type ExportProfileId } from '@/lib/film/export-profiles';

const STATUS: Record<QueuedRender['status'], string> = {
  waiting: 'Waiting',
  running: 'Rendering…',
  done: 'Downloaded',
  error: 'Failed — see above',
};

/**
 * Cut → Export: the render queue. Line up a version per profile and the ProRes master; they
 * render one after another with the cut as it is when each starts, and download as they finish
 * (not kept on the Cast). It runs while this page is open.
 */
export default function CutRenderQueue({
  queue,
  disabled,
  onQueue,
  onRemove,
  onClear,
}: {
  queue: readonly QueuedRender[];
  disabled?: boolean;
  onQueue: (item: {
    label: string;
    profile?: ExportProfileId;
    master?: boolean;
    extra?: { audioDescription?: boolean };
  }) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const finished = queue.some(entry => entry.status === 'done' || entry.status === 'error');
  return (
    <details className="space-y-1.5" data-testid="cut-render-queue" open={queue.length > 0}>
      <summary className="type-caption cursor-pointer font-medium">
        Render queue{queue.length ? ` · ${queue.length}` : ''}
      </summary>
      <p className="type-caption text-[var(--text-muted)]">
        Line up versions; they render one after another and download as each finishes — keep this
        page open.
      </p>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Add to the render queue">
        {EXPORT_PROFILES.map(profile => (
          <Button
            key={profile.id}
            size="sm"
            variant="ghost"
            disabled={disabled}
            title={profile.hint}
            data-testid={`cut-queue-${profile.id}`}
            onClick={() => onQueue({ label: profile.label, profile: profile.id })}
          >
            + {profile.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          data-testid="cut-queue-prores"
          onClick={() => onQueue({ label: 'ProRes master', master: true })}
        >
          + ProRes master
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          data-testid="cut-queue-audio-description"
          title="Every shot with nothing said gets a short description of what is seen, in a narrator's voice — an accessible version for blind and low-vision viewers"
          onClick={() => onQueue({ label: 'Audio-described', extra: { audioDescription: true } })}
        >
          + Audio-described
        </Button>
      </div>
      {queue.length ? (
        <ol className="space-y-1" data-testid="cut-queue-list">
          {queue.map(entry => (
            <li
              key={entry.id}
              className="type-caption flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-1"
              data-testid="cut-queue-item"
              data-status={entry.status}
            >
              <span>{entry.label}</span>
              <span className="flex items-center gap-2 text-[var(--text-muted)]">
                {STATUS[entry.status]}
                {entry.status === 'waiting' ? (
                  <Button
                    size="sm"
                    variant="underline"
                    aria-label={`Take ${entry.label} out of the queue`}
                    onClick={() => onRemove(entry.id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {finished ? (
        <Button size="sm" variant="underline" onClick={onClear} data-testid="cut-queue-clear">
          Clear finished
        </Button>
      ) : null}
    </details>
  );
}
