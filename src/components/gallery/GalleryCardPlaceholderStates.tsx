'use client';

import { ComfyUiGalleryJobPlaceholder } from '@/components/ui/ComfyUiJobStatusPanel';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';

type Props = {
  entry: ComfyGalleryEntry;
  isRendering: boolean;
  onCancel: () => void;
  onRequeue: (
    newSeed: boolean,
    qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile,
    options?: { exactGraph?: boolean; stickyHost?: boolean }
  ) => void;
  comfyHostLabel: string | null;
};

export function GalleryCardPlaceholderStates({
  entry,
  isRendering,
  onCancel,
  onRequeue,
  comfyHostLabel,
}: Props) {
  if (isRendering) {
    return (
      <div className="relative flex h-full flex-col">
        <ComfyUiGalleryJobPlaceholder entry={entry} />
        <button
          type="button"
          onClick={onCancel}
          className="absolute bottom-2.5 right-2.5 z-30 rounded-full border border-[var(--tint-danger-border)] bg-[var(--bg-base)]/85 px-2.5 py-1 text-[11px] text-[var(--tint-danger-text)] max-md:min-h-8 backdrop-blur transition hover:border-[var(--tint-danger-border)] hover:bg-[var(--tint-danger-bg)] hover:text-[var(--tint-danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-xs text-[var(--text-muted)]">
        {entry.status === 'error'
          ? (entry.statusMessage ?? 'Generation failed')
          : 'No image output'}
      </p>
      {entry.status === 'error' ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {entry.hasStoredWorkflow || entry.workflowJson ? (
            <button
              type="button"
              onClick={() => onRequeue(false, undefined, { exactGraph: true })}
              className="rounded-lg border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2.5 py-1 text-[11px] text-[var(--tint-info-text)] transition hover:bg-[var(--tint-info-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Replay exact
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onRequeue(false)}
            className="rounded-lg border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-2.5 py-1 text-[11px] text-[var(--tint-danger-text)] transition hover:bg-[var(--tint-danger-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)]"
          >
            Retry
          </button>
          {entry.comfyUrl?.trim() ? (
            <button
              type="button"
              onClick={() =>
                onRequeue(false, undefined, {
                  exactGraph: Boolean(entry.hasStoredWorkflow || entry.workflowJson),
                  stickyHost: true,
                })
              }
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/80 px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Retry on {comfyHostLabel ?? 'this host'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onRequeue(true)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/80 px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            New seed
          </button>
        </div>
      ) : null}
    </div>
  );
}
