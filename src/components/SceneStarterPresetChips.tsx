'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  SCENE_STARTER_CATEGORIES,
  SCENE_STARTER_TAG_OPTIONS,
  DEFAULT_SCENE_STARTER_FILTER,
  filterSceneStarters,
  getAllSceneStarterPresets,
  type SceneStarterCategory,
  type SceneStarterFilterState,
  type SceneStarterFramingFilter,
  type SceneStarterPreset,
} from '@/lib/scene-starter-presets';
import {
  buildUserSceneStarterFromHints,
  loadUserSceneStarterPresets,
  upsertUserSceneStarterPreset,
} from '@/lib/user-scene-starter-presets';
import {
  buildPresetVariationsHandoff,
  presetVariationsPath,
  savePresetVariationsHandoff,
} from '@/lib/preset-variations-handoff';
import { ROUTE_TINT_CLASSES, type ToolAccent } from '@/lib/tool-theme';
import { TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { appHasRoute } from '@/lib/app-profile';

const FRAMING_OPTIONS: { value: SceneStarterFramingFilter; label: string }[] = [
  { value: 'all', label: 'All framing' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'full-body', label: 'Full-body' },
  { value: 'action', label: 'Action' },
];

const PRESET_BATCH = 48;

type SceneStarterPresetChipsProps = {
  selectedId?: string;
  onSelect: (preset: SceneStarterPreset) => void;
  filterState?: SceneStarterFilterState;
  onFilterChange?: (filter: SceneStarterFilterState) => void;
  category?: SceneStarterCategory | 'all';
  onCategoryChange?: (category: SceneStarterCategory | 'all') => void;
  mode?: 'solo' | 'duo' | 'all';
  accent?: ToolAccent;
  title?: string;
  currentHints?: string;
  variationsTarget?: 'generate' | 'character' | 'duo';
  onUserPresetsChange?: () => void;
};

function resolveFilterState(
  filterState: SceneStarterFilterState | undefined,
  category: SceneStarterCategory | 'all'
): SceneStarterFilterState {
  if (filterState) {
    return filterState;
  }
  return {
    ...DEFAULT_SCENE_STARTER_FILTER,
    category,
  };
}

export default function SceneStarterPresetChips({
  selectedId,
  onSelect,
  filterState,
  onFilterChange,
  category = 'all',
  onCategoryChange,
  mode = 'all',
  accent = 'brand',
  title = 'Scene presets',
  currentHints = '',
  variationsTarget = 'generate',
  onUserPresetsChange,
}: SceneStarterPresetChipsProps) {
  const searchInputId = 'scene-starter-preset-search';
  const [userPresetVersion, setUserPresetVersion] = useState(0);
  const [localFilter, setLocalFilter] = useState<SceneStarterFilterState>(() =>
    resolveFilterState(filterState, category)
  );

  const activeFilter = filterState ?? localFilter;
  const activeCategory = onCategoryChange ? category : activeFilter.category;
  const activeChipClass = ROUTE_TINT_CLASSES[accent].badge;
  const [visibleCount, setVisibleCount] = useState(PRESET_BATCH);

  // userPresetVersion isn't read inside the callback — it's a deliberate cache-bust
  // counter (bumped after saving a preset, see setUserPresetVersion below) that
  // forces this to re-read from storage. Do not remove it despite the lint warning;
  // loadUserSceneStarterPresets() has no other way to know storage changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const userPresets = useMemo(() => loadUserSceneStarterPresets(), [userPresetVersion]);

  const allPresets = useMemo(() => getAllSceneStarterPresets(userPresets), [userPresets]);

  const filtered = useMemo(
    () =>
      filterSceneStarters(
        allPresets,
        {
          ...activeFilter,
          category: activeCategory,
        },
        mode
      ),
    [allPresets, activeFilter, activeCategory, mode]
  );

  const visiblePresets = filtered.slice(0, visibleCount);
  const filtersActive =
    activeFilter.query.trim().length > 0 ||
    activeFilter.framing !== 'all' ||
    activeFilter.tags.length > 0 ||
    activeCategory !== 'all';

  const selectedPreset = allPresets.find(preset => preset.id === selectedId);

  const patchFilter = (patch: Partial<SceneStarterFilterState>) => {
    const next = { ...activeFilter, ...patch };
    if (onFilterChange) {
      onFilterChange(next);
    } else {
      setLocalFilter(next);
    }
    setVisibleCount(PRESET_BATCH);
  };

  const setCategory = (next: SceneStarterCategory | 'all') => {
    if (onCategoryChange) {
      onCategoryChange(next);
    }
    patchFilter({ category: next });
  };

  const toggleTag = (tag: string) => {
    patchFilter({
      tags: activeFilter.tags.includes(tag)
        ? activeFilter.tags.filter(entry => entry !== tag)
        : [...activeFilter.tags, tag],
    });
  };

  const clearFilters = () => {
    const cleared = { ...DEFAULT_SCENE_STARTER_FILTER };
    if (onCategoryChange) {
      onCategoryChange('all');
    }
    if (onFilterChange) {
      onFilterChange(cleared);
    } else {
      setLocalFilter(cleared);
    }
    setVisibleCount(PRESET_BATCH);
  };

  const saveCurrentAsPreset = () => {
    const hints = currentHints.trim();
    if (!hints) {
      return;
    }
    const label = window.prompt('Preset name', hints.slice(0, 48));
    if (!label?.trim()) {
      return;
    }
    upsertUserSceneStarterPreset(
      buildUserSceneStarterFromHints({
        label: label.trim(),
        hints,
        category: activeCategory === 'all' ? 'lifestyle' : activeCategory,
        duo: mode === 'duo',
      })
    );
    setUserPresetVersion(version => version + 1);
    onUserPresetsChange?.();
  };

  const queueVariationsFromPreset = (preset: SceneStarterPreset) => {
    savePresetVariationsHandoff(
      buildPresetVariationsHandoff({
        hints: preset.hints,
        target: preset.duo ? 'duo' : variationsTarget,
        count: 4,
        portraitStyle: preset.portraitStyle,
        sportPresetId: preset.id.startsWith('sport-') ? preset.id : undefined,
      })
    );
    window.location.href = presetVariationsPath();
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      document.getElementById(searchInputId)?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="type-caption" aria-live="polite">
          {filtered.length} of {allPresets.length} presets
          {userPresets.length > 0 ? ` · ${userPresets.length} saved` : ''}
        </p>
      </div>

      <TextInput
        id={searchInputId}
        value={activeFilter.query}
        onChange={event => patchFilter({ query: event.target.value })}
        placeholder="Search presets (/ to focus)…"
        aria-label="Search scene presets"
      />

      <div className="flex flex-wrap gap-2">
        {SCENE_STARTER_CATEGORIES.map(item => (
          <button
            key={item.value}
            type="button"
            onClick={() => setCategory(item.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition max-md:min-h-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ring)] ${
              activeCategory === item.value
                ? activeChipClass
                : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FRAMING_OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => patchFilter({ framing: option.value })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition max-md:min-h-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ring)] ${
              activeFilter.framing === option.value
                ? activeChipClass
                : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {SCENE_STARTER_TAG_OPTIONS.filter(tag => mode !== 'solo' || tag.id !== 'duo').map(tag => (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggleTag(tag.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition max-md:min-h-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ring)] ${
              activeFilter.tags.includes(tag.id)
                ? activeChipClass
                : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {filtersActive ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
        {currentHints.trim() ? (
          <Button variant="secondary" size="sm" onClick={saveCurrentAsPreset}>
            Save current hints as preset
          </Button>
        ) : null}
        {selectedPreset && appHasRoute('/variations') ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => queueVariationsFromPreset(selectedPreset)}
          >
            Queue 4 variations
          </Button>
        ) : null}
      </div>

      <div className="ui-scroll-region sidebar-scroll max-h-56 space-y-2 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon="search"
            title="No presets match"
            description="Try clearing search or tags to see more scene starters."
            action={{
              label: 'Clear filters',
              onClick: clearFilters,
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {visiblePresets.map(preset => {
              const active = selectedId === preset.id;
              const isUser = preset.id.startsWith('user-');
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={[
                    preset.hints,
                    preset.suggestedModel ? `Suggested model: ${preset.suggestedModel}` : null,
                  ]
                    .filter(Boolean)
                    .join('\n')}
                  onClick={() => onSelect(preset)}
                  className={`rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ring)] ${
                    active
                      ? activeChipClass
                      : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="block">{preset.label}</span>
                  <span className="type-caption mt-0.5 block text-[var(--text-muted)]">
                    {[preset.duo ? 'duo' : null, isUser ? 'saved' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {filtered.length > visibleCount ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setVisibleCount(count => count + PRESET_BATCH)}
        >
          Show more ({filtered.length - visibleCount} remaining)
        </Button>
      ) : null}

      {appHasRoute('/studio') ? (
        <p className="type-caption">
          Manage saved presets in{' '}
          <Link
            href="/studio?tab=presets"
            className="text-[var(--accent-text)] hover:text-[var(--accent-text)]"
          >
            Studio → Presets
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

export { applySceneStarterWorkflowHints } from '@/lib/scene-starter-workflow-hints';
