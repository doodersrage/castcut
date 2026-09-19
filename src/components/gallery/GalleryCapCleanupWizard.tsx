'use client';

import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { isGalleryCapKeeper } from '@/lib/gallery-cap';

type GalleryCapCleanupWizardProps = {
  evicted: ComfyGalleryEntry[];
  max: number;
  total: number;
  onShowAtRisk: () => void;
  onExportKeepers: () => void;
  onArchiveThenPurge: () => void;
  onFinishPendingPurge: () => void;
  onPurgeRestOnly: () => void;
  onDeleteEvicted: () => void;
  onFavoriteEvicted: () => void;
  onClose: () => void;
};

export default function GalleryCapCleanupWizard({
  evicted,
  max,
  total,
  onShowAtRisk,
  onExportKeepers,
  onArchiveThenPurge,
  onFinishPendingPurge,
  onPurgeRestOnly,
  onDeleteEvicted,
  onFavoriteEvicted,
  onClose,
}: GalleryCapCleanupWizardProps) {
  return (
    <div
      data-testid="gallery-cap-wizard"
      className="space-y-3 rounded-2xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--tint-warning-text)]">
            Cap cleanup
            {evicted.length > 0 ? ` · ${evicted.length} at risk of eviction` : ''}
          </p>
          <p className="type-caption text-[var(--text-secondary)]">
            {evicted.length > 0
              ? `Local store keeps ${max.toLocaleString()} (${total.toLocaleString()} now). Unrated non-favorites drop first. Favorites, 4–5★, Cast look plates, and look keepers stay.`
              : `Local store keeps ${max.toLocaleString()} (${total.toLocaleString()} now). Nothing is projected for eviction yet — use Show at-risk to browse unrated non-favorites, or Archive & purge to ZIP then remove everything except keepers and Cast look plates.`}
          </p>
        </div>
        <button type="button" className="ui-btn-ghost ui-btn-sm text-xs" onClick={onClose}>
          Close
        </button>
      </div>
      {evicted.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-[var(--text-secondary)]">
          {evicted.slice(0, 24).map(entry => (
            <li key={entry.id} className="truncate">
              {new Date(entry.completedAt ?? entry.queuedAt).toLocaleDateString()} ·{' '}
              {entry.model ?? entry.tool ?? 'job'} · {entry.prompt.slice(0, 64)}
              {isGalleryCapKeeper(entry) ? ' · keeper' : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ui-btn-secondary ui-btn-sm text-xs" onClick={onShowAtRisk}>
          Show at-risk
        </button>
        <button type="button" className="ui-btn-ghost ui-btn-sm text-xs" onClick={onExportKeepers}>
          Export keepers
        </button>
        <button
          type="button"
          className="ui-btn-ghost ui-btn-sm text-xs"
          onClick={onArchiveThenPurge}
          data-testid="gallery-cap-archive-purge"
        >
          Archive & purge rest
        </button>
        <button
          type="button"
          className="ui-btn-ghost ui-btn-sm text-xs"
          onClick={onFinishPendingPurge}
          data-testid="gallery-cap-finish-purge"
        >
          Finish purge
        </button>
        <button
          type="button"
          className="ui-btn-ghost ui-btn-sm text-xs text-[var(--tint-danger-text)]"
          onClick={onPurgeRestOnly}
          data-testid="gallery-cap-purge-rest"
        >
          Purge rest
        </button>
        <button
          type="button"
          className="ui-btn-ghost ui-btn-sm text-xs"
          onClick={onFavoriteEvicted}
          disabled={evicted.length === 0}
        >
          Favorite these
        </button>
        <button
          type="button"
          className="ui-btn-ghost ui-btn-sm text-xs text-[var(--tint-danger-text)]"
          onClick={onDeleteEvicted}
          disabled={evicted.length === 0}
        >
          Delete listed
        </button>
      </div>
    </div>
  );
}
