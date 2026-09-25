'use client';

import GalleryPlayChecksBadge from '@/components/gallery/GalleryPlayChecksBadge';
import type { AestheticScoreResult } from '@/lib/aesthetic-score';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';
import { CustomGroupBadge, statusLabel, statusTone } from '@/components/gallery/galleryCardStatus';

type Props = {
  entry: ComfyGalleryEntry;
  layout: GalleryLayoutMode;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: (event?: { shiftKey?: boolean }) => void;
  previewUrl: string | null;
  onToggleFavorite: () => void;
  onCustomGroupClick?: (group: string) => void;
  primaryMediaKind: ReturnType<typeof import('@/lib/comfyui-gallery').galleryEntryPrimaryMediaKind>;
  aestheticScore: AestheticScoreResult;
  aestheticBusy: boolean;
  scoreWithVision: () => void;
};

export function GalleryCardTopChrome({
  entry,
  layout,
  selectable,
  selected,
  onToggleSelected,
  previewUrl,
  onToggleFavorite,
  onCustomGroupClick,
  primaryMediaKind,
  aestheticScore,
  aestheticBusy,
  scoreWithVision,
}: Props) {
  if (layout === 'list') {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusTone(entry.status)}`}
        >
          {statusLabel(entry.status, entry)}
        </span>
        {entry.reviewRating ? (
          <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)]">
            {entry.reviewRating}★
          </span>
        ) : null}
        <GalleryPlayChecksBadge entry={entry} />
        {entry.customGroup?.trim() ? (
          <CustomGroupBadge
            name={entry.customGroup.trim()}
            onClick={onCustomGroupClick}
            pointerEvents
          />
        ) : null}
        <span className="contents opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100">
          {entry.reviewNote?.trim() ? (
            <span
              className="max-w-[9rem] truncate rounded-full border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-warning-text)]"
              title={entry.reviewNote.trim()}
              data-testid="gallery-card-review-note"
            >
              Note
            </span>
          ) : null}
          {entry.hasStoredWorkflow || entry.workflowJson ? (
            <span
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
              title="Stored workflow JSON available for exact replay"
            >
              Exact graph
            </span>
          ) : entry.workflowJsonOmitted ? (
            <span
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
              title="Graph was pruned (age/size budget) or too large to store"
            >
              Graph pruned
            </span>
          ) : null}
          {primaryMediaKind === 'video' ? (
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
              {entry.sourceImageUrl?.trim() ? 'I2V' : 'Video'}
            </span>
          ) : null}
          {entry.status === 'completed' && !entry.reviewRating ? (
            <button
              type="button"
              disabled={!previewUrl || aestheticBusy}
              onClick={() => void scoreWithVision()}
              className="pointer-events-auto rounded-full border border-[var(--border-default)]/60 bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-muted)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50"
              title={
                aestheticScore.notes.join(' · ') ||
                'Click to score with vision LLM (falls back to heuristic)'
              }
            >
              {aestheticBusy
                ? '…'
                : `${aestheticScore.score}${aestheticScore.method === 'vision' ? '★' : ''}`}
            </button>
          ) : null}
        </span>
      </div>

      <div
        className={`pointer-events-auto flex items-center gap-1 ${
          layout === 'dense' && !entry.favorite
            ? 'opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100'
            : ''
        }`}
      >
        {selectable ? (
          <label
            className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition ${
              selected
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
                : 'border-[var(--border-default)]/70 bg-[var(--bg-base)]/80 hover:border-[var(--border-default)]'
            }`}
            onClick={event => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={event => {
                onToggleSelected?.({
                  shiftKey:
                    'shiftKey' in event.nativeEvent &&
                    Boolean((event.nativeEvent as MouseEvent).shiftKey),
                });
              }}
              aria-label="Select entry"
              className="h-3.5 w-3.5 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            />
          </label>
        ) : null}
        <button
          type="button"
          onClick={onToggleFavorite}
          title={entry.favorite ? 'Remove favorite' : 'Add favorite'}
          className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
            entry.favorite
              ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)] hover:bg-[var(--tint-warning-bg)]'
              : 'border-[var(--border-default)]/70 bg-[var(--bg-base)]/80 text-[var(--text-muted)] hover:border-[var(--tint-warning-border)] hover:text-[var(--tint-warning-text)]'
          }`}
        >
          {entry.favorite ? '★' : '☆'}
        </button>
      </div>
    </div>
  );
}
