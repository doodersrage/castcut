'use client';

import type { ComfyGalleryFilter, ComfyGallerySort } from '@/lib/gallery/comfyui-gallery';
import type { PromptProject } from '@/lib/prompt/projects';
import {
  buildActiveFilterChips,
  clearAllGalleryFilters,
  type ActiveFilterChip,
} from '@/components/gallery/gallery-filters-shared';
import { Button } from '@/components/ui/Button';

export type GalleryFiltersActiveChipsProps = {
  chips: ActiveFilterChip[];
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  setProjectFilterId: (value: string) => void;
  setSort: (value: ComfyGallerySort) => void;
};

export default function GalleryFiltersActiveChips({
  chips,
  setFilter,
  setProjectFilterId,
  setSort,
}: GalleryFiltersActiveChipsProps) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="gallery-active-filters"
      className="ui-gallery-dock sticky top-[calc(var(--header-offset,0px)+0.5rem)] z-10 flex flex-wrap items-center gap-2 px-3 py-2"
    >
      <span className="type-caption text-[var(--text-muted)]">Active</span>
      {chips.map(chip => (
        <Button
          variant="tint"
          key={chip.key}
          type="button"
          onClick={chip.clear}
          className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-2xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          {chip.label}
          <span aria-hidden className="text-[var(--accent-text)]">
            ×
          </span>
        </Button>
      ))}
      <button
        type="button"
        onClick={() => clearAllGalleryFilters(setFilter, setProjectFilterId, setSort)}
        className="ui-btn-ghost ui-btn-sm rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-muted)] text-xs transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
      >
        Clear all
      </button>
    </div>
  );
}

export function useGalleryActiveFilterChips({
  filter,
  projectFilterId,
  projects,
  sort,
  setFilter,
  setProjectFilterId,
  setSort,
}: {
  filter: ComfyGalleryFilter;
  projectFilterId: string;
  projects: PromptProject[];
  sort: ComfyGallerySort;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  setProjectFilterId: (value: string) => void;
  setSort: (value: ComfyGallerySort) => void;
}) {
  return buildActiveFilterChips({
    filter,
    projectFilterId,
    projects,
    sort,
    setFilter,
    setProjectFilterId,
    setSort,
  });
}
