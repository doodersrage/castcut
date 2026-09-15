'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/ViewState';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { DIFFUSERS_DEFAULT_MODEL } from '@/lib/diffusers-defaults';
import { buildDiffusersLightningPresets } from '@/lib/diffusers-presets';
import { loadEngineSettings } from '@/lib/engine-settings';

export type DiffusersCheckpointOption = {
  id: string;
  label: string;
  kind: 'single_file' | 'diffusers_dir';
  family: string;
  default: boolean;
  bucket?: string;
  /** Actual UNET/checkpoint filename when `id` is a Studio preset (Lightning). */
  weightId?: string;
  /** Studio model id for workflow auto-select (Lightning presets). */
  studioModelId?: string;
  variant?: 'base' | 'lightning-4' | 'lightning-8';
};

export type DiffusersAssetFamilyFilter = 'all' | 'sdxl' | 'sd15' | 'flux' | 'qwen' | 'other';

type DiffusersCheckpointSelectorProps = {
  /** Currently selected weight filename (checkpoint or UNET). */
  value: string;
  onChange: (asset: DiffusersCheckpointOption) => void;
  id?: string;
};

function mergeInventory(data: {
  models?: DiffusersCheckpointOption[];
  checkpoints?: DiffusersCheckpointOption[];
  diffusionModels?: DiffusersCheckpointOption[];
}): DiffusersCheckpointOption[] {
  const byId = new Map<string, DiffusersCheckpointOption>();
  const push = (item: DiffusersCheckpointOption | undefined) => {
    if (!item?.id?.trim()) {
      return;
    }
    const id = item.id.trim();
    if (byId.has(id)) {
      return;
    }
    byId.set(id, {
      ...item,
      id,
      label: item.label?.trim() || id,
      family: item.family?.trim() || 'other',
      kind: item.kind === 'diffusers_dir' ? 'diffusers_dir' : 'single_file',
      default: Boolean(item.default),
    });
  };

  for (const item of data.checkpoints ?? []) {
    push({ ...item, bucket: item.bucket ?? 'checkpoints' });
  }
  for (const item of data.diffusionModels ?? []) {
    push({ ...item, bucket: item.bucket ?? 'diffusion_models' });
  }
  // Always merge `models` too (engine may put UNETs there as the combined list).
  for (const item of data.models ?? []) {
    push({
      ...item,
      bucket:
        item.bucket ??
        (item.family === 'flux' || item.family === 'qwen' ? 'diffusion_models' : 'checkpoints'),
    });
  }

  return [...byId.values()].sort((a, b) => {
    const familyRank = (family: string) =>
      family === 'qwen'
        ? 0
        : family === 'flux'
          ? 1
          : family === 'sdxl'
            ? 2
            : family === 'sd15'
              ? 3
              : 4;
    const rank = familyRank(a.family) - familyRank(b.family);
    if (rank !== 0) {
      return rank;
    }
    return a.id.localeCompare(b.id);
  });
}

async function fetchInventory(
  engineUrl?: string,
  autoStart = true
): Promise<DiffusersCheckpointOption[]> {
  const params = new URLSearchParams();
  if (engineUrl?.trim()) {
    params.set('engineUrl', engineUrl.trim());
  }
  if (!autoStart) {
    params.set('autoStart', '0');
  }
  const query = params.toString();
  const response = await fetch(query ? `/api/diffusers/models?${query}` : '/api/diffusers/models');
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error?.trim() || `Diffusers unavailable (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as {
    models?: DiffusersCheckpointOption[];
    checkpoints?: DiffusersCheckpointOption[];
    diffusionModels?: DiffusersCheckpointOption[];
    loras?: DiffusersCheckpointOption[];
  };
  const weights = mergeInventory(data);
  const presets = buildDiffusersLightningPresets(data);
  // Presets first within Qwen so Lightning is visible above raw UNETs.
  return [...presets, ...weights];
}

export default function DiffusersCheckpointSelector({
  value,
  onChange,
  id,
}: DiffusersCheckpointSelectorProps) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<DiffusersAssetFamilyFilter>('qwen');
  const [expanded, setExpanded] = useState(false);
  const [models, setModels] = useState<DiffusersCheckpointOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoading(true);
      const engine = loadEngineSettings();
      void fetchInventory(engine.diffusersApiUrl, engine.diffusersAutoStart)
        .then(next => {
          if (cancelled) {
            return;
          }
          setModels(next);
          setError(null);
          const matched = next.find(
            item => item.id === value || item.studioModelId === value || item.weightId === value
          );
          // Keep the family tab on whatever is already selected (Flux stays on Flux).
          if (matched) {
            if (
              matched.family === 'qwen' ||
              matched.family === 'flux' ||
              matched.family === 'sdxl' ||
              matched.family === 'sd15'
            ) {
              setFamily(matched.family);
            } else {
              setFamily('all');
            }
          } else {
            const qwenCount = next.filter(item => item.family === 'qwen').length;
            const fluxCount = next.filter(item => item.family === 'flux').length;
            if (qwenCount > 0) {
              setFamily('qwen');
            } else if (fluxCount > 0) {
              setFamily('flux');
            } else {
              setFamily('all');
            }
          }
          if (next.length > 0 && !matched) {
            const preferred =
              next.find(item => item.default)?.id ||
              next.find(item => item.variant === 'lightning-8')?.id ||
              next.find(item => item.id === DIFFUSERS_DEFAULT_MODEL)?.id ||
              next.find(
                item => item.family === 'qwen' && !/edit/i.test(item.id) && item.bucket !== 'preset'
              )?.id ||
              next.find(item => item.family === 'flux')?.id ||
              next[0]!.id;
            const asset = next.find(item => item.id === preferred) ?? next[0]!;
            onChange(asset);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setModels([]);
            setError(err instanceof Error ? err.message : 'Could not load Diffusers inventory.');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    };
    scheduleAfterCommit(load);
    return () => {
      cancelled = true;
    };
    // Re-fetch when engine URL changes via settings; value/onChange intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter(item => {
      if (family !== 'all' && item.family !== family) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        item.label.toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle) ||
        item.family.toLowerCase().includes(needle) ||
        (item.bucket ?? '').toLowerCase().includes(needle)
      );
    });
  }, [family, models, query]);

  const selected = models.find(
    item => item.id === value || item.studioModelId === value || item.weightId === value
  );

  // Keep the family tab aligned when the parent resolves a weight (e.g. Flux filename).
  // Adjust during render (React-approved) instead of syncing via useEffect/setState.
  const selectedFamilyTab =
    selected?.family === 'qwen' ||
    selected?.family === 'flux' ||
    selected?.family === 'sdxl' ||
    selected?.family === 'sd15'
      ? selected.family
      : null;
  const selectedSyncKey = selected ? `${selected.id}:${selected.family}` : '';
  const [syncedSelectionKey, setSyncedSelectionKey] = useState(selectedSyncKey);
  if (selectedSyncKey !== syncedSelectionKey) {
    setSyncedSelectionKey(selectedSyncKey);
    if (selectedFamilyTab) {
      setFamily(selectedFamilyTab);
    }
  }

  const isActive = (item: DiffusersCheckpointOption) =>
    item.id === value ||
    item.studioModelId === value ||
    (Boolean(item.weightId) && item.weightId === value && !selected?.studioModelId);
  const countFor = (fam: DiffusersAssetFamilyFilter) =>
    fam === 'all' ? models.length : models.filter(item => item.family === fam).length;

  const pickAsset = (asset: DiffusersCheckpointOption) => {
    onChange(asset);
    setExpanded(false);
    setQuery('');
  };

  return (
    <div className="space-y-3" id={id}>
      <div className="rounded-[var(--radius-md)] border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)]/40 px-3 py-2.5">
        <p className="type-caption text-[var(--tint-info-text)]">
          Diffusers-first · native <strong>Qwen</strong> and <strong>Flux</strong> from Comfy{' '}
          <code className="font-mono">models/diffusion_models</code> (and Rapid-AIO checkpoints).
          Pick a weight + mapped workflow; unsupported graphs fall back to ComfyUI.
        </p>
      </div>

      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)]/50 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-overline text-[var(--text-muted)]">Selected weight</p>
            <p className="type-heading mt-0.5 truncate text-[var(--text-primary)]">
              {selected?.label ?? (loading ? 'Loading…' : value || 'None')}
            </p>
            <p className="type-caption mt-0.5 font-mono text-[var(--text-muted)]">
              {selected
                ? `${selected.family.toUpperCase()}${selected.bucket ? ` · ${selected.bucket}` : ''}`
                : 'Diffusers inventory'}
            </p>
          </div>
          <button
            type="button"
            data-testid="diffusers-selector-toggle"
            aria-expanded={expanded}
            className="ui-btn-secondary ui-btn-sm shrink-0"
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? 'Done' : 'Change'}
          </button>
        </div>
      </div>

      {expanded ? (
        <>
          <div className="flex flex-col gap-3">
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search Qwen / Flux weights…"
              aria-label="Search Diffusers model inventory"
              className="ui-input min-h-11 w-full px-(--input-padding-x) py-(--input-padding-y) type-body-lg"
            />
            <select
              value={family}
              onChange={event => setFamily(event.target.value as DiffusersAssetFamilyFilter)}
              aria-label="Filter by model family"
              className="ui-input min-h-11 w-full px-3 py-(--input-padding-y) type-body"
            >
              <option value="qwen">Qwen ({countFor('qwen')})</option>
              <option value="flux">Flux ({countFor('flux')})</option>
              <option value="all">All families ({countFor('all')})</option>
              <option value="sdxl">SDXL ({countFor('sdxl')})</option>
              <option value="sd15">SD1.5 ({countFor('sd15')})</option>
              <option value="other">Other ({countFor('other')})</option>
            </select>
          </div>

          <p className="type-caption">
            {loading
              ? 'Loading inventory…'
              : `${filtered.length} weight${filtered.length === 1 ? '' : 's'}`}
          </p>

          {error ? (
            <EmptyState compact icon="alert" title="Diffusers unreachable" description={error} />
          ) : (
            <div
              className="ui-scroll-region sidebar-scroll max-h-52 space-y-2 overflow-y-auto overscroll-contain pr-1"
              onWheel={event => event.stopPropagation()}
            >
              {!loading && filtered.length === 0 ? (
                <EmptyState
                  compact
                  icon="search"
                  title="No weights found"
                  description="Drop Qwen/Flux UNETs into models/diffusion_models (or Rapid-AIO into models/checkpoints)."
                />
              ) : (
                filtered.map(entry => (
                  <button
                    key={`${entry.bucket ?? 'asset'}:${entry.id}`}
                    type="button"
                    onClick={() => pickAsset(entry)}
                    data-active={isActive(entry) ? 'true' : 'false'}
                    className={`ui-chip w-full px-4 py-3 text-left ${
                      isActive(entry) ? '' : '!items-start'
                    }`}
                  >
                    <div className="flex w-full flex-wrap items-center justify-between gap-2">
                      <span
                        className={`type-heading ${
                          isActive(entry)
                            ? 'text-[var(--accent-text)]'
                            : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {entry.label}
                        {entry.variant?.startsWith('lightning') ? (
                          <span className="ml-2 type-overline !normal-case">lightning</span>
                        ) : null}
                        {entry.default ? (
                          <span className="ml-2 type-overline !normal-case">default</span>
                        ) : null}
                      </span>
                      <span className="type-overline !normal-case !tracking-normal font-mono">
                        {entry.family.toUpperCase()}
                        {entry.bucket === 'preset'
                          ? ' · PRESET'
                          : entry.bucket === 'diffusion_models'
                            ? ' · UNET'
                            : ''}
                      </span>
                    </div>
                    <p className="type-caption mt-1 w-full font-mono">
                      {entry.weightId ?? entry.id}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
