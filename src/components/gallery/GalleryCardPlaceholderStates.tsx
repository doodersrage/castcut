'use client';

import { Button } from '@/components/ui/Button';
import { ComfyUiGalleryJobPlaceholder } from '@/components/ui/ComfyUiJobStatusPanel';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import { galleryFailureSummary } from '@/lib/gallery/failure-summary';

type Props = {
  entry: ComfyGalleryEntry;
  isRendering: boolean;
  onCancel: () => void;
  onRequeue: (
    newSeed: boolean,
    qualityProfile?: import('@/lib/queue/quality-profile').QueueQualityProfile,
    options?: { exactGraph?: boolean; stickyHost?: boolean }
  ) => void;
  /** Unused since the extra retries moved to the More menu; kept for the callers. */
  comfyHostLabel?: string | null;
};

export function GalleryCardPlaceholderStates({ entry, isRendering, onCancel, onRequeue }: Props) {
  if (isRendering) {
    return (
      <div className="relative flex h-full flex-col">
        <ComfyUiGalleryJobPlaceholder entry={entry} />
        <Button
          variant="outline"
          tone="danger"
          type="button"
          onClick={onCancel}
          className="absolute bottom-2.5 right-2.5 z-30 rounded-full bg-[var(--bg-base)]/85 px-2.5 py-1 text-2xs max-md:min-h-8 backdrop-blur transition hover:bg-[var(--tint-danger-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
        >
          Cancel
        </Button>
      </div>
    );
  }

  // One reason line + Retry; Replay exact, Retry on host and New seed are in the card's More menu
  // (four stacked buttons and a cut-off paragraph crowded the list row — UI review 2026-10-15).
  const reason =
    entry.status === 'error' ? galleryFailureSummary(entry.statusMessage) : 'No image output';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center">
      <p
        className="line-clamp-2 text-xs text-[var(--text-muted)]"
        title={entry.statusMessage?.trim() || undefined}
        data-testid="gallery-card-failure-reason"
      >
        {reason}
      </p>
      {entry.status === 'error' ? (
        <button
          type="button"
          onClick={() => onRequeue(false)}
          title="Queue it again — Replay exact and New seed are under More"
          className="ui-btn-primary ui-btn-sm !text-2xs"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
