'use client';

import ComfyLoraPreviewThumb from '@/components/ComfyLoraPreviewThumb';
import { fetchLoraTriggerPhrase } from '@/lib/comfyui-object-info-cache';
import type { ComfyLoraInventoryFile } from '@/lib/comfyui-object-info-cache';
import type { LoraLibraryEntry } from '@/lib/lora-stack';
import { LORA_FAMILY_LABELS } from '@/lib/lora-family-detect';

type LoraLibraryEntryRowProps = {
  entry: LoraLibraryEntry;
  index: number;
  entryCount: number;
  inventoryLoras: ComfyLoraInventoryFile[];
  inventoryNames: string[];
  comfyUrl?: string;
  onUpdate: (index: number, patch: Partial<LoraLibraryEntry>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
};

export default function LoraLibraryEntryRow({
  entry,
  index,
  entryCount,
  inventoryLoras,
  inventoryNames,
  comfyUrl,
  onUpdate,
  onMove,
  onRemove,
}: LoraLibraryEntryRowProps) {
  const enabled = entry.enabled !== false;
  const strengthModel = entry.strengthModel ?? 1;
  const strengthClip = entry.strengthClip ?? 1;
  const tokenOptions = (() => {
    const current = entry.tokenValue?.trim() ?? '';
    const set = new Set(inventoryNames);
    if (current && !set.has(current)) {
      return [current, ...inventoryNames];
    }
    return inventoryNames;
  })();
  const selectedFile = inventoryLoras.find(file => file.name === entry.tokenValue);

  return (
    <li className={`ui-surface-inset space-y-2 transition-opacity ${enabled ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={event => onUpdate(index, { enabled: event.target.checked })}
              className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            />
            Enabled
          </label>
          {entry.family ? (
            <span
              className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
              title={
                entry.familySource === 'missing'
                  ? 'This file is no longer in ComfyUI — remove the entry or re-download it'
                  : entry.familySource === 'unreadable'
                    ? "Couldn't read the file — family unknown"
                    : `Read from the file's ${entry.familySource === 'keys' ? 'layer names' : 'training metadata'}`
              }
              data-testid="lora-entry-family"
            >
              {entry.familySource === 'missing' ? 'File missing' : LORA_FAMILY_LABELS[entry.family]}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label="Move LoRA up"
            className="rounded-lg border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border-default)] disabled:hover:text-[var(--text-muted)]"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === entryCount - 1}
            aria-label="Move LoRA down"
            className="rounded-lg border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border-default)] disabled:hover:text-[var(--text-muted)]"
          >
            ↓
          </button>
        </div>
      </div>
      <label className="space-y-1 text-xs text-[var(--text-muted)]">
        LoRA file
        <span className="flex items-center gap-2">
          {selectedFile ? (
            <ComfyLoraPreviewThumb
              filename={selectedFile.name}
              pathIndex={selectedFile.pathIndex}
              comfyUrl={comfyUrl}
            />
          ) : null}
          <select
            value={entry.tokenValue}
            onChange={event => onUpdate(index, { tokenValue: event.target.value })}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
          >
            <option value="">Select a LoRA…</option>
            {tokenOptions.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </span>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-[var(--text-muted)]">
          ID
          <input
            value={entry.id}
            onChange={event => onUpdate(index, { id: event.target.value })}
            placeholder="portrait-style"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-muted)]">
          Label
          <input
            value={entry.label}
            onChange={event => onUpdate(index, { label: event.target.value })}
            placeholder="Portrait style LoRA"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </label>
      </div>
      <label className="space-y-1 text-xs text-[var(--text-muted)]">
        <span className="flex items-center justify-between gap-2">
          Trigger phrase
          <button
            type="button"
            onClick={() => {
              const filename = entry.tokenValue?.trim();
              if (!filename) {
                return;
              }
              void fetchLoraTriggerPhrase(filename, comfyUrl?.trim() || undefined).then(trigger => {
                if (trigger) {
                  onUpdate(index, { triggerPhrase: trigger });
                }
              });
            }}
            className="type-caption ui-text-link"
          >
            From metadata
          </button>
        </span>
        <input
          value={entry.triggerPhrase}
          onChange={event => onUpdate(index, { triggerPhrase: event.target.value })}
          placeholder="activation tags from the safetensors header"
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-[var(--text-muted)]">
          <span className="flex items-center justify-between">
            <span>Model strength</span>
            <span className="font-mono text-[var(--text-secondary)]">
              {strengthModel.toFixed(2)}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={strengthModel}
            onChange={event => onUpdate(index, { strengthModel: Number(event.target.value) })}
            className="h-8 w-full cursor-pointer accent-[var(--accent)]"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-muted)]">
          <span className="flex items-center justify-between">
            <span>Clip strength</span>
            <span className="font-mono text-[var(--text-secondary)]">
              {strengthClip.toFixed(2)}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={strengthClip}
            onChange={event => onUpdate(index, { strengthClip: Number(event.target.value) })}
            className="h-8 w-full cursor-pointer accent-[var(--accent)]"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="text-xs text-[var(--accent-text)]">
          {entry.id.trim() ? `{{LORA_${entry.id.trim()}}}` : '{{LORA_<id>}}'}
        </code>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--tint-danger-border)] hover:text-[var(--tint-danger-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--tint-danger-text)]"
        >
          Remove
        </button>
      </div>
    </li>
  );
}
