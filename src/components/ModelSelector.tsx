'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COMFY_IMAGE_MODELS,
  COMFY_MODEL_CATEGORIES,
  type ComfyImageModel,
  type ComfyModelCategory,
} from '@/lib/comfy-models/client';
import { EmptyState } from '@/components/ui/ViewState';

type ModelSelectorProps = {
  value: ComfyImageModel;
  onChange: (model: ComfyImageModel) => void;
  id?: string;
  allowedModels?: readonly ComfyImageModel[];
  filterHint?: string | null;
  onShowAllModels?: () => void;
  /** When true, start expanded (default is collapsed summary). */
  defaultExpanded?: boolean;
};

export default function ModelSelector({
  value,
  onChange,
  id,
  allowedModels,
  filterHint,
  onShowAllModels,
  defaultExpanded = false,
}: ModelSelectorProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ComfyModelCategory | 'all'>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  const catalog = useMemo(() => {
    if (!allowedModels?.length) {
      return COMFY_IMAGE_MODELS;
    }
    const allowed = new Set(allowedModels);
    return COMFY_IMAGE_MODELS.filter(entry => allowed.has(entry.id));
  }, [allowedModels]);

  const visibleCategories = useMemo(() => {
    const categoryIds = new Set(catalog.map(entry => entry.category));
    return COMFY_MODEL_CATEGORIES.filter(entry => categoryIds.has(entry.id));
  }, [catalog]);

  const modelsByCategory = useMemo(() => {
    const counts = new Map<ComfyModelCategory, number>();
    for (const entry of catalog) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    return counts;
  }, [catalog]);

  const effectiveCategory =
    category !== 'all' && !visibleCategories.some(entry => entry.id === category)
      ? 'all'
      : category;

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalog.filter(entry => {
      if (effectiveCategory !== 'all' && entry.category !== effectiveCategory) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return (
        entry.label.toLowerCase().includes(normalizedQuery) ||
        entry.id.toLowerCase().includes(normalizedQuery) ||
        entry.comfyNode.toLowerCase().includes(normalizedQuery) ||
        entry.description.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [catalog, effectiveCategory, query]);

  const selected = useMemo(
    () => COMFY_IMAGE_MODELS.find(entry => entry.id === value) ?? COMFY_IMAGE_MODELS[0]!,
    [value]
  );

  const filteringActive =
    Boolean(allowedModels?.length) && allowedModels!.length < COMFY_IMAGE_MODELS.length;

  useEffect(() => {
    if (expanded) {
      searchRef.current?.focus();
    }
  }, [expanded]);

  const selectModel = (model: ComfyImageModel) => {
    onChange(model);
    setExpanded(false);
    setQuery('');
  };

  return (
    <div className="space-y-3" id={id}>
      {filteringActive && filterHint ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)]/40 px-3 py-2.5">
          <p className="type-caption text-[var(--tint-info-text)]">{filterHint}</p>
          {onShowAllModels ? (
            <button
              type="button"
              onClick={onShowAllModels}
              className="mt-2 text-xs font-medium text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]"
            >
              Show all models
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)]/50 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-overline text-[var(--text-muted)]">Selected model</p>
            <p className="type-heading mt-0.5 truncate text-[var(--text-primary)]">
              {selected.label}
            </p>
            <p className="type-caption mt-0.5 font-mono text-[var(--text-muted)]">
              {selected.comfyNode}
            </p>
          </div>
          <button
            type="button"
            data-testid="model-selector-toggle"
            aria-expanded={expanded}
            className="ui-btn-secondary ui-btn-sm shrink-0"
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? 'Done' : 'Change'}
          </button>
        </div>
        {!expanded ? (
          <p className="type-caption mt-2 line-clamp-2 text-[var(--text-muted)]">
            {selected.description}
          </p>
        ) : null}
      </div>

      {expanded ? (
        <>
          <div className="flex flex-col gap-3">
            <input
              ref={searchRef}
              id={`${id ?? 'model-selector'}-search`}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search models by name, id, or node…"
              aria-label="Search ComfyUI models"
              className="ui-input min-h-11 w-full px-(--input-padding-x) py-(--input-padding-y) type-body-lg"
            />
            <select
              value={effectiveCategory}
              onChange={e => setCategory(e.target.value as ComfyModelCategory | 'all')}
              aria-label="Filter by model family"
              className="ui-input min-h-11 w-full px-3 py-(--input-padding-y) type-body"
            >
              <option value="all">All families ({catalog.length})</option>
              {visibleCategories.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} ({modelsByCategory.get(entry.id) ?? 0})
                </option>
              ))}
            </select>
          </div>

          <p className="type-caption">
            {filteredModels.length} model{filteredModels.length === 1 ? '' : 's'}
            {effectiveCategory !== 'all' &&
              ` in ${visibleCategories.find(entry => entry.id === effectiveCategory)?.label ?? effectiveCategory}`}
            {query.trim() ? ` matching “${query.trim()}”` : ''}
          </p>

          <div
            className="ui-scroll-region sidebar-scroll max-h-52 space-y-2 overflow-y-auto overscroll-contain pr-1"
            onWheel={event => event.stopPropagation()}
          >
            {filteredModels.length === 0 ? (
              <EmptyState
                compact
                icon="search"
                title="No models match"
                description="Try a shorter search term or switch back to All categories."
                action={{
                  label: 'Clear search',
                  onClick: () => {
                    setQuery('');
                    setCategory('all');
                  },
                }}
              />
            ) : (
              filteredModels.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => selectModel(entry.id)}
                  data-active={value === entry.id ? 'true' : 'false'}
                  className={`ui-chip w-full px-4 py-3 text-left ${
                    value === entry.id ? '' : '!items-start'
                  }`}
                >
                  <div className="flex w-full flex-wrap items-center justify-between gap-2">
                    <span
                      className={`type-heading ${
                        value === entry.id
                          ? 'text-[var(--accent-text)]'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {entry.label}
                    </span>
                    <span className="type-overline !normal-case !tracking-normal font-mono">
                      {entry.comfyNode}
                    </span>
                  </div>
                  <p className="type-caption mt-1 w-full">{entry.description}</p>
                </button>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
