'use client';

import { useEffect, useMemo, useState } from 'react';
import ComfyLoraPreviewThumb from '@/components/ComfyLoraPreviewThumb';
import LoraLibraryEntryRow from '@/components/settings/LoraLibraryEntryRow';
import { Button } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import type { ComfyLoraInventoryFile } from '@/lib/comfyui-object-info-cache';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { loraChangesFaceAt } from '@/lib/lora-check';
import { LORA_FAMILY_LABELS, type LoraFamily } from '@/lib/lora-family-detect';
import {
  loraStackMembership,
  normalizeLoraStackPresets,
  type LoraScanRow,
  type LoraUsageStats,
} from '@/lib/lora-library-tools';
import { fetchLoraScanRows } from '@/lib/lora-scan-client';
import { isLightningLibraryEntry, type LoraLibraryEntry } from '@/lib/lora-stack';
import { loraModelFilterLabel } from '@/lib/lora-model-compat';
import { loadSettingsCache } from '@/lib/settings-cache';

type Status = 'all' | 'active' | 'unused' | 'flagged' | 'not-added';

type Props = {
  entries: LoraLibraryEntry[];
  inventoryLoras: ComfyLoraInventoryFile[];
  inventoryNames: string[];
  inventoryLoading: boolean;
  comfyUrl?: string;
  usage: Map<string, LoraUsageStats>;
  onChange: (next: LoraLibraryEntry[]) => void;
  onUpdate: (index: number, patch: Partial<LoraLibraryEntry>) => void;
  onPatchById: (id: string, patch: Partial<LoraLibraryEntry>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onAddFiles: (filenames: string[]) => void;
  onRefreshInventory: () => void | Promise<void>;
};

const ROW_PAGE = 30;

const familyOf = (entry: LoraLibraryEntry): LoraFamily =>
  entry.family && entry.familySource !== 'missing' ? entry.family : 'unknown';

/** The LoRA library as a searchable list: compact rows, filters, bulk edits, files to add. */
export default function LoraLibraryManager({
  entries,
  inventoryLoras,
  inventoryNames,
  inventoryLoading,
  comfyUrl,
  usage,
  onChange,
  onUpdate,
  onPatchById,
  onMove,
  onRemove,
  onAddFiles,
  onRefreshInventory,
}: Props) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<LoraFamily | 'all'>('all');
  const [status, setStatus] = useState<Status>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStrength, setBulkStrength] = useState('0.7');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [scanned, setScanned] = useState<Map<string, LoraScanRow>>(new Map());
  // The full list ran ~4,500 px: show a page of rows per filter, and fold files not in the
  // library away unless the filter asks for them.
  const filterKey = `${query}|${family}|${status}`;
  const [paging, setPaging] = useState<{ key: string; limit: number; files: boolean }>({
    key: '',
    limit: ROW_PAGE,
    files: false,
  });
  const rowLimit = paging.key === filterKey ? paging.limit : ROW_PAGE;
  const showFiles =
    status === 'not-added' || Boolean(query.trim()) || (paging.key === filterKey && paging.files);

  const membership = useMemo(() => {
    void entries;
    return loraStackMembership(
      loadSettingsCache().shared.sessionActiveLoraIdsByModel,
      normalizeLoraStackPresets(loadComfyUiSettings().loraStackPresets)
    );
  }, [entries]);

  const inLibrary = useMemo(
    () => new Set(entries.map(entry => entry.tokenValue?.trim().toLowerCase()).filter(Boolean)),
    [entries]
  );
  const notAdded = useMemo(
    () => inventoryLoras.filter(file => !inLibrary.has(file.name.toLowerCase())),
    [inLibrary, inventoryLoras]
  );

  // Identify files that aren't in the library yet, once, so they can be filtered by family.
  useEffect(() => {
    const unscanned = notAdded.map(file => file.name).filter(name => !scanned.has(name));
    if (unscanned.length === 0) return;
    let cancelled = false;
    void fetchLoraScanRows(unscanned, comfyUrl)
      .then(rows => {
        if (cancelled) return;
        setScanned(current => {
          const next = new Map(current);
          for (const row of rows) next.set(row.filename, row);
          return next;
        });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [comfyUrl, notAdded, scanned]);

  const flagged = (entry: LoraLibraryEntry) =>
    entry.familySource === 'missing' ||
    loraChangesFaceAt(entry.faceCheck, entry.strengthModel ?? 1);

  const matchesQuery = (text: string) =>
    !query.trim() || text.toLowerCase().includes(query.trim().toLowerCase());

  const libraryRows = useMemo(
    () =>
      entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => {
          if (status === 'not-added') return false;
          if (family !== 'all' && familyOf(entry) !== family) return false;
          if (
            !matchesQuery(`${entry.label} ${entry.id} ${entry.tokenValue} ${entry.triggerPhrase}`)
          )
            return false;
          const inStack = (membership.get(entry.id)?.models.length ?? 0) > 0;
          if (status === 'active') return inStack || entry.enabled !== false;
          if (status === 'unused') return !inStack && !usage.get(entry.id);
          if (status === 'flagged') return flagged(entry);
          return true;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchesQuery/flagged read query + entries
    [entries, family, membership, query, status, usage]
  );

  const fileRows = useMemo(
    () =>
      status === 'all' || status === 'not-added'
        ? notAdded.filter(file => {
            const fileFamily = scanned.get(file.name)?.family ?? 'unknown';
            if (family !== 'all' && fileFamily !== family) return false;
            return matchesQuery(file.name);
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchesQuery reads query
    [family, notAdded, query, scanned, status]
  );

  const familyCounts = useMemo(() => {
    const counts = new Map<LoraFamily, number>();
    for (const entry of entries)
      counts.set(familyOf(entry), (counts.get(familyOf(entry)) ?? 0) + 1);
    for (const file of notAdded) {
      const fileFamily = scanned.get(file.name)?.family ?? 'unknown';
      counts.set(fileFamily, (counts.get(fileFamily) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries, notAdded, scanned]);

  const statusCounts = useMemo(() => {
    let active = 0;
    let unused = 0;
    let flaggedCount = 0;
    for (const entry of entries) {
      const inStack = (membership.get(entry.id)?.models.length ?? 0) > 0;
      if (inStack || entry.enabled !== false) active += 1;
      if (!inStack && !usage.get(entry.id)) unused += 1;
      if (flagged(entry)) flaggedCount += 1;
    }
    return { active, unused, flagged: flaggedCount };
  }, [entries, membership, usage]);

  const selectedIds = [...selected].filter(id => entries.some(entry => entry.id === id));
  const bulkPatch = (patch: (entry: LoraLibraryEntry) => Partial<LoraLibraryEntry>) => {
    onChange(
      entries.map(entry => (selected.has(entry.id) ? { ...entry, ...patch(entry) } : entry))
    );
  };

  const inventoryFile = (name: string) => inventoryLoras.find(file => file.name === name);

  return (
    <div className="space-y-3" data-testid="lora-manager">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search LoRAs, files, triggers…"
          aria-label="Search LoRAs"
          data-testid="lora-manager-search"
          className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => void onRefreshInventory()}
          disabled={inventoryLoading}
          className="type-caption ui-text-link disabled:opacity-50"
        >
          {inventoryLoading ? 'Refreshing…' : 'Refresh from ComfyUI'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5" data-testid="lora-manager-status">
        {(
          [
            ['all', `All (${entries.length + notAdded.length})`],
            ['active', `In use (${statusCounts.active})`],
            ['unused', `Never used (${statusCounts.unused})`],
            ['flagged', `Needs a look (${statusCounts.flagged})`],
            ['not-added', `Not added (${notAdded.length})`],
          ] as [Status, string][]
        ).map(([value, label]) => (
          <ChipButton
            key={value}
            active={status === value}
            onClick={() => setStatus(value)}
            className="px-2 text-[11px]"
          >
            {label}
          </ChipButton>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" data-testid="lora-manager-families">
        <ChipButton
          active={family === 'all'}
          onClick={() => setFamily('all')}
          className="px-2 text-[11px]"
        >
          Every model
        </ChipButton>
        {familyCounts.map(([value, count]) => (
          <ChipButton
            key={value}
            active={family === value}
            onClick={() => setFamily(value)}
            className="px-2 text-[11px]"
          >
            {LORA_FAMILY_LABELS[value]} {count}
          </ChipButton>
        ))}
      </div>

      {selectedIds.length > 0 ? (
        <div
          className="ui-surface-inset flex flex-wrap items-center gap-2 text-xs"
          data-testid="lora-manager-bulk"
        >
          <span className="text-[var(--text-primary)]">{selectedIds.length} selected</span>
          <Button size="sm" variant="ghost" onClick={() => bulkPatch(() => ({ enabled: true }))}>
            Enable
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkPatch(() => ({ enabled: false }))}>
            Disable
          </Button>
          <span className="flex items-center gap-1">
            <input
              value={bulkStrength}
              onChange={event => setBulkStrength(event.target.value)}
              aria-label="Strength for selected"
              inputMode="decimal"
              className="w-14 rounded border border-[var(--border-default)] bg-[var(--bg-base)] px-1.5 py-0.5 font-mono"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={!Number.isFinite(Number(bulkStrength))}
              onClick={() => {
                const value = Math.min(2, Math.max(0, Number(bulkStrength)));
                bulkPatch(() => ({ strengthModel: value, strengthClip: value }));
              }}
            >
              Set strength
            </Button>
          </span>
          <Button
            size="sm"
            variant={confirmRemove ? 'danger' : 'ghost'}
            onClick={() => {
              if (!confirmRemove) {
                setConfirmRemove(true);
                return;
              }
              onChange(entries.filter(entry => !selected.has(entry.id)));
              setSelected(new Set());
              setConfirmRemove(false);
            }}
          >
            {confirmRemove ? `Remove ${selectedIds.length} from library?` : 'Remove'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              setConfirmRemove(false);
            }}
            className="type-caption ui-text-link"
          >
            Clear
          </button>
        </div>
      ) : null}

      <ul className="divide-y divide-[var(--border-subtle)]/70 rounded-xl border border-[var(--border-subtle)]/80">
        {libraryRows.slice(0, rowLimit).map(({ entry, index }) => {
          const member = membership.get(entry.id);
          const stats = usage.get(entry.id);
          const open = expanded === `${entry.id}-${index}`;
          const file = inventoryFile(entry.tokenValue);
          const changesFace = loraChangesFaceAt(entry.faceCheck, entry.strengthModel ?? 1);
          return (
            <li key={`${entry.id}-${index}`} data-testid="lora-manager-row">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <input
                  type="checkbox"
                  aria-label={`Select ${entry.label || entry.id}`}
                  checked={selected.has(entry.id)}
                  onChange={event =>
                    setSelected(current => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(entry.id);
                      else next.delete(entry.id);
                      return next;
                    })
                  }
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {file ? (
                  <ComfyLoraPreviewThumb
                    filename={file.name}
                    pathIndex={file.pathIndex}
                    comfyUrl={comfyUrl}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : `${entry.id}-${index}`)}
                  aria-expanded={open}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`truncate text-sm ${entry.enabled === false ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}
                    >
                      {entry.label || entry.id}
                    </span>
                    <span className="rounded-full border border-[var(--border-subtle)] px-1.5 text-[10px] text-[var(--text-muted)]">
                      {entry.familySource === 'missing'
                        ? 'File missing'
                        : LORA_FAMILY_LABELS[familyOf(entry)]}
                    </span>
                    {isLightningLibraryEntry(entry) ? (
                      <span className="rounded-full border border-[var(--border-subtle)] px-1.5 text-[10px] text-[var(--text-muted)]">
                        Speed
                      </span>
                    ) : null}
                    {changesFace ? (
                      <span className="rounded-full border border-[var(--tint-danger-border)] px-1.5 text-[10px] text-[var(--tint-danger-text)]">
                        Changes faces
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--text-muted)]">
                    <span className="font-mono">{entry.tokenValue || 'no file'}</span>
                    {stats ? ` · ${stats.images} image${stats.images === 1 ? '' : 's'}` : ''}
                    {stats?.favorites ? ` · ${stats.favorites} ♥` : ''}
                    {member?.models.length
                      ? ` · in ${member.models.length} model stack${member.models.length === 1 ? '' : 's'}`
                      : ''}
                    {member?.savedStacks.length
                      ? ` · ${member.savedStacks.length} saved stack${member.savedStacks.length === 1 ? '' : 's'}`
                      : ''}
                  </span>
                </button>
                <span className="w-10 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                  {(entry.strengthModel ?? 1).toFixed(2)}
                </span>
                <label className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                  <input
                    type="checkbox"
                    checked={entry.enabled !== false}
                    onChange={event => onUpdate(index, { enabled: event.target.checked })}
                    aria-label={`Enabled by default: ${entry.label || entry.id}`}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  On
                </label>
              </div>
              {open ? (
                <div className="space-y-2 bg-[var(--bg-muted)]/40 px-3 pb-3 pt-1">
                  {member && (member.models.length > 0 || member.savedStacks.length > 0) ? (
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {member.models.length > 0
                        ? `Picked on: ${member.models.map(model => loraModelFilterLabel(model)).join(', ')}. `
                        : ''}
                      {member.savedStacks.length > 0
                        ? `Saved stacks: ${member.savedStacks.join(', ')}.`
                        : ''}
                    </p>
                  ) : null}
                  <ul>
                    <LoraLibraryEntryRow
                      entry={entry}
                      index={index}
                      entryCount={entries.length}
                      inventoryLoras={inventoryLoras}
                      inventoryNames={inventoryNames}
                      comfyUrl={comfyUrl}
                      usage={stats}
                      onPatchById={onPatchById}
                      onUpdate={onUpdate}
                      onMove={onMove}
                      onRemove={removed => {
                        setExpanded(null);
                        onRemove(removed);
                      }}
                    />
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
        {libraryRows.length > rowLimit ? (
          <li className="px-2 py-1.5 text-center">
            <button
              type="button"
              className="ui-text-link type-caption"
              data-testid="lora-manager-show-more"
              onClick={() =>
                setPaging({ key: filterKey, limit: rowLimit + ROW_PAGE * 3, files: showFiles })
              }
            >
              Show {Math.min(ROW_PAGE * 3, libraryRows.length - rowLimit)} more of{' '}
              {libraryRows.length - rowLimit}
            </button>
          </li>
        ) : null}
        {fileRows.length > 0 ? (
          <li className="flex flex-wrap items-center justify-between gap-2 bg-[var(--bg-muted)]/40 px-2 py-1.5">
            <button
              type="button"
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-expanded={showFiles}
              data-testid="lora-manager-files-toggle"
              onClick={() => setPaging({ key: filterKey, limit: rowLimit, files: !showFiles })}
            >
              {showFiles ? '▾' : '▸'} In ComfyUI, not in the library ({fileRows.length})
            </button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAddFiles(fileRows.map(file => file.name))}
              data-testid="lora-manager-add-all"
            >
              Add {fileRows.length === 1 ? 'it' : `all ${fileRows.length}`}
            </Button>
          </li>
        ) : null}
        {(showFiles ? fileRows : []).map(file => {
          const scan = scanned.get(file.name);
          return (
            <li
              key={file.name}
              className="flex items-center gap-2 px-2 py-1.5"
              data-testid="lora-manager-file"
            >
              <span className="w-4" />
              <ComfyLoraPreviewThumb
                filename={file.name}
                pathIndex={file.pathIndex}
                comfyUrl={comfyUrl}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-[var(--text-secondary)]">
                  {file.name}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {scan ? LORA_FAMILY_LABELS[scan.family] : 'Identifying…'}
                  {scan?.trigger ? ` · trigger “${scan.trigger}”` : ''}
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => onAddFiles([file.name])}>
                Add
              </Button>
            </li>
          );
        })}
        {libraryRows.length === 0 && fileRows.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
            Nothing matches these filters.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
