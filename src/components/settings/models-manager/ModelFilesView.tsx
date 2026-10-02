'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import { SegmentedControl, StatCard } from '@/components/ui/ToolPageShell';
import type { AssetRow } from '@/components/settings/comfy-model-assets/comfy-model-assets-types';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  engineFamilyLabel,
  formatBytes,
  formatLastUsed,
  groupModelFilesByEngine,
  isRecentlyUsed,
  MODEL_FILE_RECENT_USE_DAYS,
  modelFileDeleteBlock,
  modelFileUses,
  type ModelFileRow,
  type ModelFileUse,
} from '@/lib/model-files';
import { loadSettingsCache } from '@/lib/settings-cache';
import { useModelFiles } from './useModelFiles';

type Filter = 'all' | 'unused' | 'partial' | 'links';
type GroupBy = 'engine' | 'folder';
type SortBy = 'size' | 'used' | 'name';

function engineLabel(modelId: string): string {
  const def = getComfyModelDefinition(modelId);
  return engineFamilyLabel(modelId, def.id === modelId ? def.label : modelId);
}

function usageLabels(uses: ModelFileUse[] | undefined): string[] {
  const labels = new Set<string>();
  for (const use of uses ?? []) {
    if (use.kind === 'engine') {
      use.modelIds.filter(id => id !== 'default').forEach(id => labels.add(engineLabel(id)));
    } else if (use.kind === 'loader-map') {
      labels.add(`Mapped: ${engineLabel(use.modelId)}`);
    } else {
      labels.add(`LoRA library: ${use.label}`);
    }
  }
  return [...labels];
}

function sortFiles(files: ModelFileRow[], sortBy: SortBy): ModelFileRow[] {
  const sorted = [...files];
  if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'used') sorted.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
  else sorted.sort((a, b) => b.bytes - a.bytes);
  return sorted;
}

type RowProps = {
  file: ModelFileRow;
  uses: ModelFileUse[] | undefined;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onDelete: (file: ModelFileRow, confirmName: string) => Promise<void>;
};

function ModelFileRowView({ file, uses, selected, onSelect, onDelete }: RowProps) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const block = modelFileDeleteBlock(file, uses);
  const baseName = file.path.split('/').pop() ?? file.name;
  const labels = usageLabels(uses);
  return (
    <li className="py-2" data-testid="model-file-row" data-path={file.path}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          type="checkbox"
          aria-label={`Select ${baseName}`}
          checked={selected}
          disabled={Boolean(block)}
          onChange={event => onSelect(event.target.checked)}
          className="h-4 w-4 accent-[var(--accent)] disabled:opacity-30"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-[var(--text-primary)]" title={file.path}>
            {file.name}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            {file.folder}
            {file.linkTarget ? ` · link → ${file.linkTarget}` : ''}
            {file.partial ? ' · unfinished download' : ''}
            {' · '}
            <span className={isRecentlyUsed(file) ? 'text-[var(--text-secondary)]' : ''}>
              {formatLastUsed(file.lastUsedAt)}
              {file.renders ? ` (${file.renders} render${file.renders === 1 ? '' : 's'})` : ''}
            </span>
          </p>
          {labels.length > 0 ? (
            <p className="mt-0.5 flex flex-wrap gap-1">
              {labels.map(label => (
                <span
                  key={label}
                  className="rounded-full border border-[var(--border-subtle)] px-1.5 py-px text-[10px] text-[var(--text-muted)]"
                >
                  {label}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
          {file.linkTarget ? 'link' : formatBytes(file.bytes)}
        </span>
        <button
          type="button"
          onClick={() => {
            setConfirming(value => !value);
            setTyped('');
            setError(null);
          }}
          disabled={Boolean(block)}
          title={block ?? `Delete ${baseName} from disk`}
          data-testid="model-file-delete"
          className="rounded-lg border border-[var(--border-default)] px-2 py-1 text-[11px] text-[var(--text-muted)] transition hover:border-[var(--tint-danger-border)] hover:text-[var(--tint-danger-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border-default)] disabled:hover:text-[var(--text-muted)]"
        >
          Delete
        </button>
      </div>
      {block ? <p className="ml-7 text-[10px] text-[var(--text-muted)]">Kept: {block}</p> : null}
      {confirming ? (
        <form
          className="ml-7 mt-2 flex flex-wrap items-center gap-2"
          onSubmit={event => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            void onDelete(file, typed)
              .catch(caught =>
                setError(caught instanceof Error ? caught.message : 'Delete failed.')
              )
              .finally(() => setBusy(false));
          }}
        >
          <label className="text-[11px] text-[var(--text-secondary)]">
            Type <span className="font-mono">{baseName}</span> to delete it for good
            {file.linkTarget ? ' (removes the link only)' : ` — frees ${formatBytes(file.bytes)}`}:
            <input
              value={typed}
              onChange={event => setTyped(event.target.value)}
              aria-label="Confirm file name"
              data-testid="model-file-confirm"
              className="mt-1 block w-full min-w-[16rem] rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1 font-mono text-xs"
            />
          </label>
          <Button
            type="submit"
            size="sm"
            variant="danger"
            disabled={typed !== baseName}
            loading={busy}
          >
            Delete permanently
          </Button>
          {error ? <p className="w-full text-[11px] ui-status-danger">{error}</p> : null}
        </form>
      ) : null}
    </li>
  );
}

/** Everything in COMFYUI_ROOT/models: size, last use, what points at it, and delete. */
export default function ModelFilesView({
  catalogRows,
  onStatus,
  onChanged,
}: {
  catalogRows: AssetRow[];
  onStatus?: (message: string) => void;
  /** After a delete — the catalog's installed/missing status is stale. */
  onChanged?: () => void;
}) {
  const { summary, loading, error, load, remove } = useModelFiles();
  const [filter, setFilter] = useState<Filter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('engine');
  const [sortBy, setSortBy] = useState<SortBy>('size');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTyped, setBulkTyped] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState<string | null>(null);

  const files = useMemo(() => summary?.files ?? [], [summary]);
  const uses = useMemo(() => {
    const settings = loadComfyUiSettings();
    const shared = loadSettingsCache().shared;
    return modelFileUses({
      files,
      catalog: catalogRows,
      loraLibrary: settings.loraLibrary ?? [],
      loaderMaps: [
        shared.modelCheckpointMap ?? {},
        shared.modelVaeMap ?? {},
        shared.modelRefinerMap ?? {},
        shared.modelUpscaleMap ?? {},
        shared.modelLoraMap ?? {},
        (shared.modelControlNetMap as Partial<Record<string, string>> | undefined) ?? {},
      ],
    });
  }, [catalogRows, files]);

  const stats = useMemo(() => {
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    const idle = files.filter(file => !isRecentlyUsed(file) && !file.linkTarget);
    const partial = files.filter(file => file.partial);
    return {
      total,
      idleBytes: idle.reduce((sum, file) => sum + file.bytes, 0),
      idleCount: idle.length,
      partialBytes: partial.reduce((sum, file) => sum + file.bytes, 0),
      partialCount: partial.length,
    };
  }, [files]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return files.filter(file => {
      if (needle && !file.path.toLowerCase().includes(needle)) return false;
      if (filter === 'unused') return !isRecentlyUsed(file) && !file.linkTarget;
      if (filter === 'partial') return Boolean(file.partial);
      if (filter === 'links') return Boolean(file.linkTarget || file.linkedBy);
      return true;
    });
  }, [files, filter, query]);

  const groups = useMemo(() => {
    if (groupBy === 'engine') return groupModelFilesByEngine(visible, uses, engineLabel);
    const byFolder = new Map<string, ModelFileRow[]>();
    for (const file of visible)
      byFolder.set(file.folder, [...(byFolder.get(file.folder) ?? []), file]);
    return [...byFolder.entries()]
      .map(([folder, list]) => ({
        id: `folder:${folder}`,
        label: folder,
        files: list,
        bytes: list.reduce((sum, file) => sum + file.bytes, 0),
        lastUsedAt: Math.max(0, ...list.map(file => file.lastUsedAt ?? 0)) || undefined,
      }))
      .sort((a, b) => b.bytes - a.bytes);
  }, [groupBy, uses, visible]);

  const selectedFiles = files.filter(file => selected.has(file.path));
  const selectedBytes = selectedFiles.reduce((sum, file) => sum + file.bytes, 0);
  const narrowed = filter !== 'all' || query.trim() !== '';

  const deleteOne = async (file: ModelFileRow, confirmName: string) => {
    const freed = await remove(file.path, confirmName);
    setSelected(current => {
      const next = new Set(current);
      next.delete(file.path);
      return next;
    });
    onStatus?.(`Deleted ${file.name}${freed ? ` — freed ${formatBytes(freed)}` : ''}.`);
    onChanged?.();
  };

  const deleteSelected = async () => {
    setBulkBusy(true);
    setBulkNote(null);
    let freed = 0;
    const failed: string[] = [];
    for (const file of selectedFiles) {
      try {
        freed += await remove(file.path, file.path.split('/').pop() ?? '');
      } catch (caught) {
        failed.push(`${file.name}: ${caught instanceof Error ? caught.message : 'failed'}`);
      }
    }
    setSelected(new Set());
    setBulkTyped('');
    setBulkBusy(false);
    const note = `Deleted ${selectedFiles.length - failed.length} file${selectedFiles.length - failed.length === 1 ? '' : 's'}, freed ${formatBytes(freed)}.${failed.length ? ` Kept ${failed.length}: ${failed.join('; ')}` : ''}`;
    setBulkNote(note);
    onStatus?.(note);
    onChanged?.();
  };

  if (!summary && loading) {
    return <p className="type-caption text-[var(--text-muted)]">Reading the models folder…</p>;
  }
  if (error) {
    return <p className="type-caption ui-status-danger">{error}</p>;
  }
  if (!summary?.root) {
    return (
      <p className="type-caption text-[var(--text-muted)]">
        Set COMFYUI_ROOT on the server to see and manage model files.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="model-files-view">
      <div className="grid gap-2 sm:grid-cols-4">
        <StatCard
          label="Models folder"
          value={formatBytes(stats.total)}
          detail={`${files.length} files`}
        />
        <StatCard
          label="Free on disk"
          value={formatBytes(summary.freeBytes)}
          detail={summary.totalBytes ? `of ${formatBytes(summary.totalBytes)}` : undefined}
        />
        <StatCard
          label={`Not used in ${MODEL_FILE_RECENT_USE_DAYS} days`}
          value={formatBytes(stats.idleBytes)}
          detail={`${stats.idleCount} files`}
        />
        <StatCard
          label="Unfinished downloads"
          value={formatBytes(stats.partialBytes)}
          detail={`${stats.partialCount} file${stats.partialCount === 1 ? '' : 's'}`}
        />
      </div>
      <p className="type-caption text-[var(--text-muted)]">
        Last use comes from {summary.scannedOutputs.toLocaleString()} ComfyUI renders
        {summary.scannedSinceAt
          ? ` since ${new Date(summary.scannedSinceAt).toLocaleDateString()}`
          : ''}{' '}
        plus ComfyUI&rsquo;s history. Files used in the last {MODEL_FILE_RECENT_USE_DAYS} days, in
        the LoRA library, or mapped in Settings can&rsquo;t be deleted here.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search files…"
          aria-label="Search model files"
          className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
        />
        <SegmentedControl<GroupBy>
          aria-label="Group files"
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: 'engine', label: 'By engine' },
            { value: 'folder', label: 'By folder' },
          ]}
        />
        <select
          value={sortBy}
          onChange={event => setSortBy(event.target.value as SortBy)}
          aria-label="Sort files"
          className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1.5 text-xs"
        >
          <option value="size">Largest first</option>
          <option value="used">Recently used first</option>
          <option value="name">Name</option>
        </select>
        <Button size="sm" variant="ghost" onClick={() => void load()} loading={loading}>
          Rescan
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', `All (${files.length})`],
            ['unused', `Not used in ${MODEL_FILE_RECENT_USE_DAYS} days (${stats.idleCount})`],
            ['partial', `Unfinished downloads (${stats.partialCount})`],
            ['links', 'Links'],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <ChipButton
            key={value}
            active={filter === value}
            onClick={() => setFilter(value)}
            className="px-2 text-[11px]"
          >
            {label}
          </ChipButton>
        ))}
      </div>

      {selectedFiles.length > 0 ? (
        <form
          className="ui-surface-inset flex flex-wrap items-center gap-2"
          data-testid="model-files-bulk"
          onSubmit={event => {
            event.preventDefault();
            void deleteSelected();
          }}
        >
          <p className="text-xs text-[var(--text-primary)]">
            {selectedFiles.length} selected · {formatBytes(selectedBytes)}
          </p>
          <input
            value={bulkTyped}
            onChange={event => setBulkTyped(event.target.value)}
            placeholder='Type "delete" to confirm'
            aria-label="Confirm bulk delete"
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            variant="danger"
            disabled={bulkTyped.trim().toLowerCase() !== 'delete'}
            loading={bulkBusy}
          >
            Delete {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'}
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="type-caption ui-text-link"
          >
            Clear
          </button>
        </form>
      ) : null}
      {bulkNote ? <p className="type-caption text-[var(--text-secondary)]">{bulkNote}</p> : null}

      {groups.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="model-files-empty">
          No files match this view. Clear the search or pick another filter.
        </p>
      ) : null}
      <ul className="space-y-2">
        {groups.map(group => {
          const expanded = narrowed || open.has(group.id);
          return (
            <li key={group.id} className="ui-surface-inset" data-testid="model-file-group">
              <button
                type="button"
                onClick={() =>
                  setOpen(current => {
                    const next = new Set(current);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
                aria-expanded={expanded}
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
              >
                <span className="text-sm text-[var(--text-primary)]">
                  {group.label}
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {group.files.length} file{group.files.length === 1 ? '' : 's'} ·{' '}
                    {formatLastUsed(group.lastUsedAt)}
                  </span>
                </span>
                <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                  {formatBytes(group.bytes)} {expanded ? '▴' : '▾'}
                </span>
              </button>
              {expanded ? (
                <ul className="mt-1 divide-y divide-[var(--border-subtle)]/70">
                  {sortFiles(group.files, sortBy).map(file => (
                    <ModelFileRowView
                      key={file.path}
                      file={file}
                      uses={uses.get(file.path)}
                      selected={selected.has(file.path)}
                      onSelect={value =>
                        setSelected(current => {
                          const next = new Set(current);
                          if (value) next.add(file.path);
                          else next.delete(file.path);
                          return next;
                        })
                      }
                      onDelete={deleteOne}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
