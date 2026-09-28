'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/ViewState';
import {
  createEmptyLoraLibraryEntry,
  createLoraLibraryEntryFromFilename,
  DEFAULT_LORA_STRENGTH_BUDGET,
  describeLoraStack,
  resolveActiveLoraStack,
  type LoraLibraryEntry,
} from '@/lib/lora-stack';
import { fetchLoraTriggerPhrase } from '@/lib/comfyui-object-info-cache';
import { useLoraLibraryInventory } from '@/hooks/useLoraLibraryInventory';
import LoraSearchDownloadPanel from '@/components/settings/LoraSearchDownloadPanel';
import LoraLibraryInventorySection from '@/components/settings/LoraLibraryInventorySection';
import LoraLibraryEntryRow from '@/components/settings/LoraLibraryEntryRow';
import { Button } from '@/components/ui/Button';
import { fetchLoraScanRows } from '@/lib/lora-scan-client';
import {
  applyLoraScanResults,
  auditLoraStacksByModel,
  duplicateLoraEntries,
  loraEntriesNeedingScan,
  loraUsageStats,
  LORA_STACK_WARN_SIZE,
  missingLoraEntries,
  pruneIncompatibleLoraPicks,
  removeLoraEntries,
} from '@/lib/lora-library-tools';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { loraModelFilterLabel } from '@/lib/lora-model-compat';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';

type LoraLibrarySettingsPanelProps = {
  library: LoraLibraryEntry[] | undefined;
  comfyUrl?: string;
  /** Combined strength cap for the active stack (ComfyUiSettings.loraStrengthBudget). */
  strengthBudget?: number;
  onStrengthBudgetChange?: (budget: number | undefined) => void;
  onChange: (next: LoraLibraryEntry[]) => void;
  onStatus?: (message: string) => void;
};

const STRENGTH_BUDGET_OPTIONS = [2, 2.5, 3, 4];

export default function LoraLibrarySettingsPanel({
  library,
  comfyUrl,
  strengthBudget,
  onStrengthBudgetChange,
  onChange,
  onStatus,
}: LoraLibrarySettingsPanelProps) {
  const entries = useMemo(() => library ?? [], [library]);
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const libraryFilenames = useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      const name = entry.tokenValue?.trim();
      if (name) {
        set.add(name.toLowerCase());
      }
    }
    return set;
  }, [entries]);

  const activeSummary = useMemo(
    () => describeLoraStack(resolveActiveLoraStack(entries)),
    [entries]
  );

  const updateEntry = useCallback(
    (index: number, patch: Partial<LoraLibraryEntry>) => {
      onChange(
        entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry))
      );
    },
    [entries, onChange]
  );

  const patchEntryById = useCallback(
    (id: string, patch: Partial<LoraLibraryEntry>) => {
      const next = entriesRef.current.map(entry =>
        entry.id === id ? { ...entry, ...patch } : entry
      );
      entriesRef.current = next;
      onChange(next);
    },
    [onChange]
  );

  const usage = useMemo(() => loraUsageStats(entries, loadComfyGallery()), [entries]);

  // Housekeeping: entries whose file is gone, and several entries for one file.
  const missing = useMemo(() => missingLoraEntries(entries), [entries]);
  const duplicates = useMemo(() => duplicateLoraEntries(entries), [entries]);
  const removeFromLibrary = useCallback(
    (ids: string[], replaceWith?: Record<string, string>) => {
      const shared = loadSettingsCache().shared;
      const next = removeLoraEntries(
        entriesRef.current,
        shared.sessionActiveLoraIdsByModel,
        ids,
        replaceWith
      );
      entriesRef.current = next.library;
      onChange(next.library);
      const current = next.byModel[shared.model];
      saveSharedSettings(
        {
          ...shared,
          sessionActiveLoraIdsByModel: next.byModel as typeof shared.sessionActiveLoraIdsByModel,
          ...(current ? { sessionActiveLoraIds: current } : {}),
        },
        { notify: true }
      );
    },
    [onChange]
  );
  const removeMissing = useCallback(() => {
    removeFromLibrary(missing.map(entry => entry.id));
    onStatus?.(
      `Removed ${missing.length} LoRA entr${missing.length === 1 ? 'y' : 'ies'} whose file is gone.`
    );
  }, [missing, onStatus, removeFromLibrary]);
  const mergeDuplicates = useCallback(() => {
    const replaceWith: Record<string, string> = {};
    for (const [keep, ...extras] of duplicates) {
      for (const extra of extras) replaceWith[extra.id] = keep!.id;
    }
    const ids = Object.keys(replaceWith);
    removeFromLibrary(ids, replaceWith);
    onStatus?.(`Merged ${ids.length} duplicate LoRA entr${ids.length === 1 ? 'y' : 'ies'}.`);
  }, [duplicates, onStatus, removeFromLibrary]);

  const addBlank = useCallback(() => {
    onChange([...entries, createEmptyLoraLibraryEntry()]);
  }, [entries, onChange]);

  const addFromInventory = useCallback(
    (filename: string) => {
      const entry = createLoraLibraryEntryFromFilename(filename, entries);
      const next = [...entries, entry];
      entriesRef.current = next;
      onChange(next);
      void fetchLoraTriggerPhrase(filename, comfyUrl?.trim() || undefined).then(trigger => {
        if (!trigger) {
          return;
        }
        onChange(
          entriesRef.current.map(item =>
            item.tokenValue === filename && !item.triggerPhrase.trim()
              ? { ...item, triggerPhrase: trigger }
              : item
          )
        );
      });
    },
    [comfyUrl, entries, onChange]
  );

  const removeEntry = useCallback(
    (index: number) => {
      onChange(entries.filter((_, entryIndex) => entryIndex !== index));
    },
    [entries, onChange]
  );

  const moveEntry = useCallback(
    (index: number, direction: -1 | 1) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= entries.length) {
        return;
      }
      const next = [...entries];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      onChange(
        next.map((entry, order) => ({
          ...entry,
          order,
        }))
      );
    },
    [entries, onChange]
  );

  const { inventoryLoras, inventoryNames, inventoryLoading, inventoryError, refreshInventory } =
    useLoraLibraryInventory(comfyUrl);

  // Identify every LoRA from its file (family + trigger) — automatically for new entries, or
  // all again on request.
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const scan = useCallback(
    async (force: boolean) => {
      const targets = force
        ? entriesRef.current.filter(entry => entry.tokenValue?.trim())
        : loraEntriesNeedingScan(entriesRef.current);
      if (targets.length === 0) {
        if (force) setScanNote('Nothing to scan.');
        return;
      }
      setScanning(true);
      try {
        const rows = await fetchLoraScanRows(
          targets.map(entry => entry.tokenValue.trim()),
          comfyUrl
        );
        const merged = applyLoraScanResults(entriesRef.current, rows);
        if (merged.changed > 0) onChange(merged.library);
        const unreadable = rows.filter(row => row.source === 'unreadable').length;
        const missing = rows.filter(row => row.source === 'missing').length;
        setScanNote(
          `Scanned ${rows.length} LoRA file${rows.length === 1 ? '' : 's'}${
            missing ? ` — ${missing} no longer in ComfyUI (marked File missing)` : ''
          }${unreadable ? ` — ${unreadable} couldn't be read` : ''}.`
        );
      } catch (error) {
        setScanNote(error instanceof Error ? error.message : 'LoRA scan failed.');
      } finally {
        setScanning(false);
      }
    },
    [comfyUrl, onChange]
  );
  const autoScanned = useRef(false);
  useEffect(() => {
    if (autoScanned.current || loraEntriesNeedingScan(entries).length === 0) return;
    autoScanned.current = true;
    void scan(false);
  }, [entries, scan]);

  // Per-model stacks with picks that can't apply (wrong family) or that are oversized.
  const [auditTick, setAuditTick] = useState(0);
  const audit = useMemo(() => {
    void auditTick;
    return auditLoraStacksByModel(entries, loadSettingsCache().shared.sessionActiveLoraIdsByModel);
  }, [auditTick, entries]);
  const cleanUpStacks = useCallback(() => {
    const shared = loadSettingsCache().shared;
    const pruned = pruneIncompatibleLoraPicks(entries, shared.sessionActiveLoraIdsByModel);
    const current = pruned.byModel[shared.model];
    saveSharedSettings(
      {
        ...shared,
        sessionActiveLoraIdsByModel: pruned.byModel as typeof shared.sessionActiveLoraIdsByModel,
        ...(current ? { sessionActiveLoraIds: current } : {}),
      },
      { notify: true }
    );
    onStatus?.(
      `Removed ${pruned.removed} LoRA pick${pruned.removed === 1 ? '' : 's'} that couldn't apply.`
    );
    setAuditTick(value => value + 1);
  }, [entries, onStatus]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Pick LoRAs from your ComfyUI inventory, then set ID and label. New entries start unchecked —
        turn on <span className="text-[var(--text-secondary)]">Enabled</span> for Settings defaults,
        or use the tool sidebar <span className="text-[var(--text-secondary)]">LoRA stack</span> for
        the current session.
      </p>

      <LoraSearchDownloadPanel
        comfyUrl={comfyUrl}
        libraryFilenames={libraryFilenames}
        onAddToLibrary={addFromInventory}
        onRefreshInventory={refreshInventory}
        onStatus={onStatus}
      />

      <LoraLibraryInventorySection
        comfyUrl={comfyUrl}
        libraryFilenames={libraryFilenames}
        inventoryLoras={inventoryLoras}
        inventoryLoading={inventoryLoading}
        inventoryError={inventoryError}
        onRefreshInventory={refreshInventory}
        onAddFromInventory={addFromInventory}
      />

      {audit.length > 0 ? (
        <div className="ui-surface-inset space-y-2" data-testid="lora-stack-audit">
          <p className="text-sm text-[var(--text-primary)]">Stacks that need a look</p>
          <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
            {audit.map(row => (
              <li key={row.model}>
                <span className="text-[var(--text-primary)]">
                  {loraModelFilterLabel(row.model)}
                </span>
                {' — '}
                {row.incompatible.length > 0
                  ? `${row.incompatible.length} of ${row.ids.length} picked LoRAs can't apply (wrong model family)`
                  : null}
                {row.incompatible.length > 0 && row.oversized ? '; ' : null}
                {row.oversized
                  ? `${row.ids.length - row.incompatible.length} active — stacks over ${LORA_STACK_WARN_SIZE} tend to fight each other`
                  : null}
              </li>
            ))}
          </ul>
          {audit.some(row => row.incompatible.length > 0) ? (
            <Button type="button" size="sm" variant="secondary" onClick={cleanUpStacks}>
              Remove picks that can&rsquo;t apply
            </Button>
          ) : null}
        </div>
      ) : null}

      {missing.length > 0 || duplicates.length > 0 ? (
        <div className="ui-surface-inset space-y-2" data-testid="lora-library-tidy">
          <p className="text-sm text-[var(--text-primary)]">Tidy the library</p>
          <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
            {missing.length > 0 ? (
              <li>
                {missing.length} entr{missing.length === 1 ? 'y points' : 'ies point'} at files no
                longer in ComfyUI.
              </li>
            ) : null}
            {duplicates.map(group => (
              <li key={group[0]!.id}>
                {group.length} entries for <span className="font-mono">{group[0]!.tokenValue}</span>{' '}
                ({group.map(entry => entry.label || entry.id).join(', ')})
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {missing.length > 0 ? (
              <Button type="button" size="sm" variant="secondary" onClick={removeMissing}>
                Remove missing files
              </Button>
            ) : null}
            {duplicates.length > 0 ? (
              <Button type="button" size="sm" variant="secondary" onClick={mergeDuplicates}>
                Merge duplicates
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {onStrengthBudgetChange ? (
        <label className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <span>
            Combined strength cap
            <span className="block text-[11px]">
              When the active LoRAs add up to more than this, all are scaled down together
              (Lightning excluded). Big stacks at full strength leak content, swap outfits and move
              faces.
            </span>
          </span>
          <select
            value={String(strengthBudget ?? DEFAULT_LORA_STRENGTH_BUDGET)}
            onChange={event => onStrengthBudgetChange(Number(event.target.value))}
            data-testid="lora-strength-budget"
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            <option value="0">Off</option>
            {STRENGTH_BUDGET_OPTIONS.map(value => (
              <option key={value} value={String(value)}>
                {value.toFixed(1)}
                {value === DEFAULT_LORA_STRENGTH_BUDGET ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--text-muted)]">Library entries</p>
          <button
            type="button"
            onClick={() => void scan(true)}
            disabled={scanning}
            data-testid="lora-library-scan"
            className="type-caption ui-text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50"
          >
            {scanning ? 'Scanning files…' : 'Rescan files'}
          </button>
          <button
            type="button"
            onClick={addBlank}
            className="type-caption ui-text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Add blank
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          For Qwen Lightning, set ID to{' '}
          <code className="rounded bg-[var(--bg-muted)] px-1 text-[var(--accent-text)]">
            LIGHTNING
          </code>{' '}
          (suggested automatically for Lightning filenames).
        </p>
        {entries.length > 0 ? (
          <p className="ui-surface-inset text-xs text-[var(--text-secondary)]">{activeSummary}</p>
        ) : null}
        {scanNote ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="lora-library-scan-note">
            {scanNote}
          </p>
        ) : null}
        {entries.length === 0 ? (
          <EmptyState
            compact
            icon="catalog"
            title="No LoRA entries yet"
            description="Add from the inventory list above, or create a blank entry and pick a file."
            action={{
              label: 'Add blank',
              onClick: addBlank,
            }}
          />
        ) : (
          <ul className="space-y-3">
            {entries.map((entry, index) => (
              <LoraLibraryEntryRow
                key={`${entry.id}-${index}`}
                entry={entry}
                index={index}
                entryCount={entries.length}
                inventoryLoras={inventoryLoras}
                inventoryNames={inventoryNames}
                comfyUrl={comfyUrl}
                usage={usage.get(entry.id)}
                onPatchById={patchEntryById}
                onUpdate={updateEntry}
                onMove={moveEntry}
                onRemove={removeEntry}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
