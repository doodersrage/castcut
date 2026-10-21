'use client';

import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import type { GalleryDuplicateCluster } from '@/lib/gallery/duplicate-clusters';

type GalleryDuplicateClustersPanelProps = {
  clusters: GalleryDuplicateCluster[];
  entriesById: Map<string, ComfyGalleryEntry>;
  onShowCluster: (ids: string[]) => void;
  onKeepHighest: (cluster: GalleryDuplicateCluster) => void;
  onKeepAllHighest: () => void;
  onCompare: (ids: string[]) => void;
};

export default function GalleryDuplicateClustersPanel({
  clusters,
  entriesById,
  onShowCluster,
  onKeepHighest,
  onKeepAllHighest,
  onCompare,
}: GalleryDuplicateClustersPanelProps) {
  if (clusters.length === 0) {
    return null;
  }

  const dropCount = clusters.reduce((sum, cluster) => sum + cluster.dropIds.length, 0);

  return (
    <div
      data-testid="gallery-duplicate-clusters"
      className="space-y-3 rounded-2xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--tint-warning-text)]">
            {clusters.length} duplicate prompt cluster{clusters.length === 1 ? '' : 's'}
          </p>
          <p className="type-caption text-[var(--text-secondary)]">
            Keep the highest-rated (or newest) still in each cluster. {dropCount} extras can go.
          </p>
        </div>
        <button
          type="button"
          onClick={onKeepAllHighest}
          className="ui-btn-secondary ui-btn-sm text-xs"
        >
          Keep highest in each
        </button>
      </div>
      <ul className="space-y-2">
        {clusters.slice(0, 8).map(cluster => {
          const keeper = entriesById.get(cluster.keeperId);
          return (
            <li
              key={cluster.ids.join('-')}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2"
            >
              <p className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
                {cluster.ids.length} stills · {Math.round(cluster.similarity * 100)}% match
                {keeper?.reviewRating ? ` · keeper ${keeper.reviewRating}★` : ''}
                {' · '}
                {cluster.prompt.slice(0, 72)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="ui-btn-ghost ui-btn-sm text-2xs"
                  onClick={() => onShowCluster(cluster.ids)}
                >
                  Show
                </button>
                {cluster.ids.length >= 2 && cluster.ids.length <= 4 ? (
                  <button
                    type="button"
                    className="ui-btn-ghost ui-btn-sm text-2xs"
                    onClick={() => onCompare(cluster.ids)}
                  >
                    Compare
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ui-btn-ghost ui-btn-sm text-2xs text-[var(--tint-danger-text)]"
                  onClick={() => onKeepHighest(cluster)}
                >
                  Keep highest
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
