'use client';

import { useMemo, useState } from 'react';
import type { NsfwGeneratorPreset, NsfwPresetCategory } from '@/lib/nsfw-generator-presets';
import {
  NSFW_PRESET_CATEGORIES,
  filterNsfwPresetsByQuery,
  mergeNsfwPresetCatalog,
} from '@/lib/nsfw-generator-presets';

type NsfwGeneratorPresetChipsProps = {
  selectedId?: string;
  category?: NsfwPresetCategory | 'all';
  onCategoryChange?: (category: NsfwPresetCategory | 'all') => void;
  onSelect: (preset: NsfwGeneratorPreset) => void;
  userPresets?: NsfwGeneratorPreset[];
  favoriteIds?: string[];
  recentIds?: string[];
  onToggleFavorite?: (presetId: string) => void;
  onDeleteUserPreset?: (presetId: string) => void;
  duoOnly?: boolean;
};

function PresetChip({
  preset,
  active,
  favorite,
  isUser,
  onSelect,
  onToggleFavorite,
  onDeleteUserPreset,
}: {
  preset: NsfwGeneratorPreset;
  active: boolean;
  favorite: boolean;
  isUser: boolean;
  onSelect: () => void;
  onToggleFavorite?: () => void;
  onDeleteUserPreset?: () => void;
}) {
  return (
    <div className="group relative inline-flex max-w-full">
      <button
        type="button"
        onClick={onSelect}
        className={`max-w-full truncate rounded-lg border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
          active
            ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
            : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:bg-[var(--bg-muted)]/40 hover:text-[var(--text-primary)]'
        }`}
        title={preset.hints}
      >
        {isUser ? '★ ' : ''}
        {preset.label}
      </button>
      {onToggleFavorite ? (
        <button
          type="button"
          aria-label={favorite ? 'Remove favorite' : 'Add favorite'}
          onClick={event => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
            favorite
              ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          ★
        </button>
      ) : null}
      {isUser && onDeleteUserPreset ? (
        <button
          type="button"
          aria-label="Delete saved preset"
          onClick={event => {
            event.stopPropagation();
            onDeleteUserPreset();
          }}
          className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[10px] text-[var(--tint-danger-text)] opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function PresetSection({
  title,
  presets,
  selectedId,
  favoriteIds,
  userPresetIds,
  onSelect,
  onToggleFavorite,
  onDeleteUserPreset,
}: {
  title: string;
  presets: NsfwGeneratorPreset[];
  selectedId?: string;
  favoriteIds: Set<string>;
  userPresetIds: Set<string>;
  onSelect: (preset: NsfwGeneratorPreset) => void;
  onToggleFavorite?: (presetId: string) => void;
  onDeleteUserPreset?: (presetId: string) => void;
}) {
  if (presets.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {presets.map(preset => (
          <PresetChip
            key={preset.id}
            preset={preset}
            active={selectedId === preset.id}
            favorite={favoriteIds.has(preset.id)}
            isUser={userPresetIds.has(preset.id)}
            onSelect={() => onSelect(preset)}
            onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(preset.id) : undefined}
            onDeleteUserPreset={
              userPresetIds.has(preset.id) && onDeleteUserPreset
                ? () => onDeleteUserPreset(preset.id)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

export default function NsfwGeneratorPresetChips({
  selectedId,
  category = 'all',
  onCategoryChange,
  onSelect,
  userPresets = [],
  favoriteIds = [],
  recentIds = [],
  onToggleFavorite,
  onDeleteUserPreset,
  duoOnly = false,
}: NsfwGeneratorPresetChipsProps) {
  const [query, setQuery] = useState('');

  const catalog = useMemo(() => mergeNsfwPresetCatalog(userPresets), [userPresets]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const userPresetIds = useMemo(() => new Set(userPresets.map(preset => preset.id)), [userPresets]);
  const catalogById = useMemo(() => new Map(catalog.map(preset => [preset.id, preset])), [catalog]);

  const categoryFiltered = useMemo(() => {
    let pool = catalog;
    if (category !== 'all') {
      pool = pool.filter(preset => preset.category === category);
    }
    if (duoOnly) {
      pool = pool.filter(preset => preset.duo === true);
    }
    return pool;
  }, [catalog, category, duoOnly]);

  const filtered = useMemo(
    () => filterNsfwPresetsByQuery(categoryFiltered, query),
    [categoryFiltered, query]
  );

  const recentPresets = useMemo(
    () =>
      recentIds
        .map(id => catalogById.get(id))
        .filter((preset): preset is NsfwGeneratorPreset => Boolean(preset))
        .filter(preset => filterNsfwPresetsByQuery([preset], query).length > 0),
    [recentIds, catalogById, query]
  );

  const favoritePresets = useMemo(
    () =>
      favoriteIds
        .map(id => catalogById.get(id))
        .filter((preset): preset is NsfwGeneratorPreset => Boolean(preset))
        .filter(preset => {
          if (category !== 'all' && preset.category !== category) {
            return false;
          }
          return filterNsfwPresetsByQuery([preset], query).length > 0;
        }),
    [favoriteIds, catalogById, category, query]
  );

  const recentIdSet = useMemo(
    () => new Set(recentPresets.map(preset => preset.id)),
    [recentPresets]
  );
  const favoriteOnlyIdSet = useMemo(
    () => new Set(favoritePresets.map(preset => preset.id)),
    [favoritePresets]
  );

  const mainPresets = useMemo(
    () =>
      filtered.filter(preset => !recentIdSet.has(preset.id) && !favoriteOnlyIdSet.has(preset.id)),
    [filtered, recentIdSet, favoriteOnlyIdSet]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text-primary)]">Scene presets</p>
        <p className="text-xs text-[var(--text-muted)]">
          {filtered.length} shown · {catalog.length} total
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Search presets…"
        className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-sm"
      />

      <div className="flex flex-wrap gap-2">
        {NSFW_PRESET_CATEGORIES.map(item => (
          <button
            key={item.value}
            type="button"
            onClick={() => onCategoryChange?.(item.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition max-md:min-h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
              category === item.value
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:bg-[var(--bg-muted)]/40 hover:text-[var(--text-primary)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/20 p-3">
        <PresetSection
          title="Recent"
          presets={recentPresets}
          selectedId={selectedId}
          favoriteIds={favoriteSet}
          userPresetIds={userPresetIds}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
          onDeleteUserPreset={onDeleteUserPreset}
        />
        <PresetSection
          title="Favorites"
          presets={favoritePresets}
          selectedId={selectedId}
          favoriteIds={favoriteSet}
          userPresetIds={userPresetIds}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
          onDeleteUserPreset={onDeleteUserPreset}
        />
        <PresetSection
          title={
            recentPresets.length > 0 || favoritePresets.length > 0 ? 'All matching' : 'Presets'
          }
          presets={mainPresets}
          selectedId={selectedId}
          favoriteIds={favoriteSet}
          userPresetIds={userPresetIds}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
          onDeleteUserPreset={onDeleteUserPreset}
        />
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">
            No presets match this search.
          </p>
        ) : null}
      </div>
    </div>
  );
}
