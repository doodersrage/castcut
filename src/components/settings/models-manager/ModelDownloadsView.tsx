'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ComfyModelAssetsDownloadQueue } from '@/components/settings/comfy-model-assets/ComfyModelAssetsDownloadQueue';
import type { ComfyModelAssetsViewModel } from '@/components/settings/comfy-model-assets/useComfyModelAssets';
import type { AssetRow } from '@/components/settings/comfy-model-assets/comfy-model-assets-types';
import { COMFY_ASSET_KIND_LABELS, type ComfyAssetKind } from '@/lib/comfy-asset-kinds';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { engineFamilyLabel, formatBytes } from '@/lib/model-files';

type EngineGroup = {
  label: string;
  rows: AssetRow[];
  installed: number;
  missing: AssetRow[];
  missingBytes: number;
  unknownSize: number;
};

function engineLabel(modelId: string): string {
  const def = getComfyModelDefinition(modelId);
  return engineFamilyLabel(modelId, def.id === modelId ? def.label : modelId);
}

/** Catalog files grouped per engine: what's installed, what's left, and one-click installs. */
export function groupCatalogByEngine(rows: AssetRow[]): EngineGroup[] {
  const groups = new Map<string, EngineGroup>();
  for (const row of rows) {
    const labels = new Set(row.modelIds.filter(id => id !== 'default').map(engineLabel));
    if (labels.size === 0) labels.add('Shared helpers');
    for (const label of labels) {
      const group = groups.get(label) ?? {
        label,
        rows: [],
        installed: 0,
        missing: [],
        missingBytes: 0,
        unknownSize: 0,
      };
      group.rows.push(row);
      if (row.status === 'installed') group.installed += 1;
      else if (row.status === 'missing' && row.downloadable) {
        group.missing.push(row);
        if (row.bytes) group.missingBytes += row.bytes;
        else group.unknownSize += 1;
      }
      groups.set(label, group);
    }
  }
  // Engines you partly have first (finish those), then untouched ones, then complete ones.
  const rank = (group: EngineGroup) =>
    group.missing.length === 0 ? 2 : group.installed > 0 ? 0 : 1;
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}

function sizeText(group: Pick<EngineGroup, 'missingBytes' | 'unknownSize'>): string {
  const known = group.missingBytes ? formatBytes(group.missingBytes) : '';
  if (!group.unknownSize) return known;
  return known ? `${known} + ${group.unknownSize} of unknown size` : 'size unknown';
}

export default function ModelDownloadsView({ vm }: { vm: ComfyModelAssetsViewModel }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showComplete, setShowComplete] = useState(false);
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? vm.rows.filter(row =>
          `${row.label} ${row.filename} ${row.modelIds.join(' ')}`.toLowerCase().includes(needle)
        )
      : vm.rows;
    return groupCatalogByEngine(rows);
  }, [query, vm.rows]);
  const visible = groups.filter(group => showComplete || group.missing.length > 0 || query.trim());
  const completeCount = groups.filter(group => group.missing.length === 0).length;

  const installGroup = async (group: EngineGroup) => {
    // The server downloads one at a time; queue them all.
    for (const row of group.missing) {
      const job = vm.jobFor(row.id);
      if (!job || job.status === 'error' || job.status === 'cancelled') await vm.install(row.id);
    }
  };

  return (
    <div className="space-y-3" data-testid="model-downloads-view">
      <ComfyModelAssetsDownloadQueue
        queueJobs={vm.queueJobs}
        activeQueueCount={vm.activeQueueCount}
        busyId={vm.busyId}
        rootConfigured={vm.rootConfigured}
        rootWritable={vm.rootWritable}
        jobAction={vm.jobAction}
      />
      <p className="type-caption text-[var(--text-muted)]">
        Curated weights per engine, from allowlisted Hugging Face URLs into COMFYUI_ROOT/models.
        Downloads run one at a time and resume after a cancel.
        {!vm.rootWritable && vm.rootConfigured ? ` ${vm.rootHint ?? ''}` : ''}
      </p>
      {vm.error ? <p className="type-caption ui-status-danger">{vm.error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search engines or files…"
          aria-label="Search downloads"
          className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={showComplete}
            onChange={event => setShowComplete(event.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Show complete engines ({completeCount})
        </label>
      </div>
      {vm.loading && vm.rows.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">Checking the catalog…</p>
      ) : null}
      <ul className="space-y-2">
        {visible.map(group => {
          const expanded = open.has(group.label) || Boolean(query.trim());
          return (
            <li key={group.label} className="ui-surface-inset" data-testid="model-download-group">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setOpen(current => {
                      const next = new Set(current);
                      if (next.has(group.label)) next.delete(group.label);
                      else next.add(group.label);
                      return next;
                    })
                  }
                  aria-expanded={expanded}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="text-sm text-[var(--text-primary)]">{group.label}</span>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {group.installed} of {group.rows.length} files installed
                    {group.missing.length > 0 ? ` · ${sizeText(group)} to get` : ''}{' '}
                    {expanded ? '▴' : '▾'}
                  </span>
                </button>
                {group.missing.length > 0 ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!vm.rootConfigured || !vm.rootWritable}
                    onClick={() => void installGroup(group)}
                  >
                    Install {group.missing.length} file{group.missing.length === 1 ? '' : 's'}
                    {group.missingBytes ? ` (${formatBytes(group.missingBytes)})` : ''}
                  </Button>
                ) : (
                  <span className="text-xs text-[var(--tint-success-text)]">Complete</span>
                )}
              </div>
              {expanded ? (
                <ul className="mt-2 divide-y divide-[var(--border-subtle)]/70">
                  {group.rows.map(row => {
                    const job = vm.jobFor(row.id);
                    return (
                      <li key={row.id} className="flex flex-wrap items-center gap-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[var(--text-primary)]">{row.label}</p>
                          <p className="truncate font-mono text-[10px] text-[var(--text-muted)]">
                            {COMFY_ASSET_KIND_LABELS[row.kind as ComfyAssetKind] ?? row.kind} ·{' '}
                            {row.filename}
                          </p>
                          {row.notes ? (
                            <p className="text-[10px] text-[var(--text-muted)]">{row.notes}</p>
                          ) : null}
                        </div>
                        <span className="w-16 text-right font-mono text-[11px] text-[var(--text-secondary)]">
                          {row.bytes ? formatBytes(row.bytes) : ''}
                        </span>
                        {row.status === 'installed' ? (
                          <span className="w-20 text-right text-[11px] text-[var(--tint-success-text)]">
                            Installed
                          </span>
                        ) : job ? (
                          <span className="w-20 text-right text-[11px] text-[var(--text-secondary)]">
                            {job.status === 'downloading'
                              ? `${Math.round(job.progress * 100)}%`
                              : job.status}
                          </span>
                        ) : row.status === 'missing' && row.downloadable ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!vm.rootWritable || vm.busyId === row.id}
                            onClick={() => void vm.install(row.id)}
                          >
                            Install
                          </Button>
                        ) : (
                          <span className="w-20 text-right text-[11px] text-[var(--text-muted)]">
                            Manual
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
