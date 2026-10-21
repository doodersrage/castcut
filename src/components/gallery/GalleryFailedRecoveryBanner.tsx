'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import { applyQueueFailureFix, resolveQueueFailureFixes } from '@/lib/queue/failure-fix';
import {
  resolveQueueFailureGuideLabel,
  resolveQueueFailureHref,
} from '@/lib/queue/failure-playbook';
import {
  loadLastFailedQueue,
  requestRetryLastFailedQueue,
  type LastFailedQueuePayload,
} from '@/lib/queue/last-failed-queue';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

export type GalleryFailedRetryMode = 'same' | 'new' | 'exact';

type FailedCluster = {
  key: string;
  label: string;
  entries: ComfyGalleryEntry[];
};

type GalleryFailedRecoveryBannerProps = {
  failedEntries: ComfyGalleryEntry[];
  onRetrySelected: (mode: GalleryFailedRetryMode) => void;
  onRetryAllVisible: (mode: GalleryFailedRetryMode) => void;
  onRetryCluster: (entries: ComfyGalleryEntry[], mode: GalleryFailedRetryMode) => void;
  onClearFailedFilter: () => void;
  selectedFailedCount: number;
};

function clusterFailedEntries(entries: ComfyGalleryEntry[]): FailedCluster[] {
  const map = new Map<string, ComfyGalleryEntry[]>();
  for (const entry of entries) {
    const raw = entry.statusMessage?.trim() || 'Unknown error';
    const label = raw.length > 96 ? `${raw.slice(0, 96)}…` : raw;
    const key = label.toLowerCase();
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }
  return [...map.entries()]
    .map(([key, clusterEntries]) => ({
      key,
      label: clusterEntries[0]?.statusMessage?.trim() || 'Unknown error',
      entries: clusterEntries,
    }))
    .sort((a, b) => b.entries.length - a.entries.length);
}

export default function GalleryFailedRecoveryBanner({
  failedEntries,
  onRetrySelected,
  onRetryAllVisible,
  onRetryCluster,
  onClearFailedFilter,
  selectedFailedCount,
}: GalleryFailedRecoveryBannerProps) {
  const [lastFailed, setLastFailed] = useState<LastFailedQueuePayload | null>(null);
  const [retryMode, setRetryMode] = useState<GalleryFailedRetryMode>('same');
  const clusters = useMemo(() => clusterFailedEntries(failedEntries), [failedEntries]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setLastFailed(loadLastFailedQueue());
    });
  }, [failedEntries.length]);

  if (failedEntries.length === 0 && !lastFailed) {
    return null;
  }

  return (
    <div
      data-testid="gallery-failed-recovery"
      className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-4 py-3 shadow-[inset_0_1px_0_rgb(255_255_255_/0.03)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-[var(--tint-danger-text)]">
            {failedEntries.length > 0
              ? `${failedEntries.length} failed job${failedEntries.length === 1 ? '' : 's'}`
              : 'Last failed queue ready'}
            {clusters.length > 1 ? ` · ${clusters.length} error groups` : ''}
          </p>
          <p className="type-caption text-[var(--text-muted)]">
            Retry with the same seed, a new seed, exact graph, or a one-click fix for the error.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 type-caption text-[var(--tint-danger-text)] opacity-80">
            Mode
            <select
              value={retryMode}
              onChange={event => setRetryMode(event.target.value as GalleryFailedRetryMode)}
              data-testid="gallery-failed-retry-mode"
              className="ui-input px-2 py-1 text-2xs"
            >
              <option value="same">Same seed</option>
              <option value="new">New seed</option>
              <option value="exact">Exact graph</option>
            </select>
          </label>
          {selectedFailedCount > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onRetrySelected(retryMode)}
            >
              Retry selected ({selectedFailedCount})
            </Button>
          ) : null}
          {failedEntries.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onRetryAllVisible(retryMode)}
            >
              Retry all visible
            </Button>
          ) : null}
          {lastFailed ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => requestRetryLastFailedQueue()}
            >
              Retry last failed
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onClearFailedFilter}>
            Clear filter
          </Button>
        </div>
      </div>

      {clusters.length > 0 ? (
        <div className="flex flex-col gap-2">
          {clusters.slice(0, 6).map(cluster => (
            <div
              key={cluster.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--tint-danger-border)] bg-[var(--bg-base)]/35 px-3 py-2"
            >
              <p
                className="min-w-0 flex-1 truncate text-2xs text-[var(--tint-danger-text)]"
                title={cluster.label}
              >
                <span className="mr-2 font-medium text-[var(--tint-danger-text)]">
                  {cluster.entries.length}×
                </span>
                {cluster.label.length > 120 ? `${cluster.label.slice(0, 120)}…` : cluster.label}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {(() => {
                  const settingsHref = resolveQueueFailureHref(cluster.label);
                  if (!settingsHref) {
                    return null;
                  }
                  return (
                    <ButtonLink
                      href={settingsHref}
                      size="sm"
                      variant="ghost"
                      data-testid="gallery-failed-fix-guide"
                    >
                      {resolveQueueFailureGuideLabel(settingsHref)}
                    </ButtonLink>
                  );
                })()}
                {resolveQueueFailureFixes(cluster.entries[0]!).map(fix => (
                  <Button
                    key={fix.kind}
                    type="button"
                    variant="secondary"
                    size="sm"
                    title={fix.reason}
                    data-testid={`failed-job-fix-${fix.kind}`}
                    onClick={() => {
                      void Promise.all(
                        cluster.entries.map(entry => applyQueueFailureFix(entry, fix.kind))
                      );
                    }}
                  >
                    {fix.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRetryCluster(cluster.entries, retryMode)}
                >
                  Retry group
                </Button>
              </div>
            </div>
          ))}
          {clusters.length > 6 ? (
            <p className="type-caption text-[var(--text-muted)]">
              +{clusters.length - 6} more error group{clusters.length - 6 === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
