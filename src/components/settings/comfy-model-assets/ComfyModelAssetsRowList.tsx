'use client';

import { Button } from '@/components/ui/Button';
import { COMFY_ASSET_KIND_LABELS, type ComfyAssetKind } from '@/lib/comfyui/comfy-asset-kinds';
import {
  formatBytes,
  statusLabel,
} from '@/components/settings/comfy-model-assets/comfy-model-assets-utils';
import type { ComfyModelAssetsViewModel } from '@/components/settings/comfy-model-assets/useComfyModelAssets';

type Props = Pick<
  ComfyModelAssetsViewModel,
  | 'loading'
  | 'visibleRows'
  | 'groupedRows'
  | 'jobFor'
  | 'busyId'
  | 'rootConfigured'
  | 'rootWritable'
  | 'jobAction'
  | 'install'
>;

export function ComfyModelAssetsRowList({
  loading,
  visibleRows,
  groupedRows,
  jobFor,
  busyId,
  rootConfigured,
  rootWritable,
  jobAction,
  install,
}: Props) {
  if (loading && visibleRows.length === 0) {
    return <p className="type-caption text-[var(--text-muted)]">Loading assets…</p>;
  }

  if (visibleRows.length === 0) {
    return <p className="type-caption text-[var(--text-muted)]">No assets match this filter.</p>;
  }

  return (
    <div className="space-y-4">
      {groupedRows.map(group => (
        <section key={group.kind} className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {COMFY_ASSET_KIND_LABELS[group.kind as ComfyAssetKind] ?? group.kind}
          </h3>
          <ul className="space-y-2">
            {group.rows.map(row => {
              const job = jobFor(row.id);
              const installing =
                job &&
                (job.status === 'queued' ||
                  job.status === 'downloading' ||
                  job.status === 'verifying');
              return (
                <li
                  key={row.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 px-3 py-2.5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{row.label}</p>
                      <p className="font-mono text-[11px] text-[var(--tint-success-text)]">
                        {row.filename}
                      </p>
                      <p className="type-caption text-[var(--text-muted)]">
                        {statusLabel(row.status)}
                        {row.inInventory ? ' · in Comfy inventory' : ''}
                        {row.onDisk ? ' · on disk' : ''}
                        {row.urlHost ? ` · ${row.urlHost}` : ''}
                        {row.requiresHfToken ? ' · needs HF_TOKEN' : ''}
                      </p>
                      {row.notes ? (
                        <p className="type-caption text-[var(--text-muted)]">{row.notes}</p>
                      ) : null}
                      {job && (installing || job.status === 'queued') ? (
                        <p className="type-caption text-[var(--tint-info-text)]/90">
                          {job.status}
                          {job.runAttempt && job.runAttempt > 1 ? ` · run ${job.runAttempt}` : null}
                          {job.attempt && job.attempt > 1 ? ` · try ${job.attempt}` : ''}
                          {' · '}
                          {job.bytesTotal && job.bytesReceived <= job.bytesTotal * 1.02
                            ? `${Math.round(job.progress * 100)}% · ${formatBytes(job.bytesReceived)} / ${formatBytes(job.bytesTotal)}`
                            : job.bytesReceived
                              ? `${formatBytes(job.bytesReceived)} received`
                              : `${Math.round(job.progress * 100)}%`}
                          {job.error ? ` · ${job.error}` : ''}
                        </p>
                      ) : null}
                      {job?.status === 'error' || job?.status === 'cancelled' ? (
                        <p className="type-caption ui-status-danger">
                          {job.error ?? (job.status === 'cancelled' ? 'Cancelled.' : null)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {installing && job ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busyId === job.id}
                          onClick={() => void jobAction(job.id, 'cancel')}
                        >
                          {busyId === job.id ? 'Cancelling…' : 'Cancel'}
                        </Button>
                      ) : null}
                      {row.downloadable && row.status !== 'installed' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={
                            !rootConfigured ||
                            !rootWritable ||
                            busyId === row.id ||
                            Boolean(installing) ||
                            row.status === 'root-missing'
                          }
                          onClick={() =>
                            job && (job.status === 'error' || job.status === 'cancelled')
                              ? void jobAction(job.id, 'retry')
                              : void install(row.id)
                          }
                        >
                          {installing
                            ? 'Downloading…'
                            : job?.status === 'error' || job?.status === 'cancelled'
                              ? busyId === row.id || busyId === job.id
                                ? 'Resuming…'
                                : 'Resume'
                              : busyId === row.id
                                ? 'Starting…'
                                : 'Install'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
