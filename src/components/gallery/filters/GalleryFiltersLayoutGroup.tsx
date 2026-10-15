'use client';

import type {
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
} from '@/lib/comfyui-gallery';
import type { GalleryDensity } from '@/lib/gallery-density';
import { SegmentedControl } from '@/components/ui/ToolPageShell';
import { GALLERY_SORT_OPTIONS } from '@/components/gallery/gallery-filters-shared';

type Props = {
  lean: boolean;
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  sort: ComfyGallerySort;
  setSort: (value: ComfyGallerySort) => void;
  paginationEnabled: boolean;
  layout: GalleryLayoutMode;
  setLayout: (value: GalleryLayoutMode) => void;
  density: GalleryDensity;
  setDensity: (value: GalleryDensity) => void;
  totalFiltered: number;
  totalEntries: number;
  currentPage: number;
  totalPages: number;
  showPagination: boolean;
  embeddingSearchLoading: boolean;
  embeddingSearchUnavailable: boolean;
  similarSearchLoading: boolean;
};

export function GalleryFiltersLayoutGroup({
  lean,
  filter,
  setFilter,
  sort,
  setSort,
  paginationEnabled,
  layout,
  setLayout,
  density,
  setDensity,
  totalFiltered,
  totalEntries,
  currentPage,
  totalPages,
  showPagination,
  embeddingSearchLoading,
  embeddingSearchUnavailable,
  similarSearchLoading,
}: Props) {
  return (
    <>
      {paginationEnabled ? (
        <label className="min-w-[8rem] space-y-1.5">
          <span className="type-caption text-[var(--text-muted)]">Sort</span>
          <select
            value={sort}
            onChange={event => setSort(event.target.value as ComfyGallerySort)}
            className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
          >
            {(lean
              ? GALLERY_SORT_OPTIONS.filter(option =>
                  [
                    'queued-desc',
                    'queued-asc',
                    'completed-desc',
                    'favorites-first',
                    'rating-desc',
                    'eviction-risk-desc',
                    'play-match-desc',
                  ].includes(option.value)
                )
              : GALLERY_SORT_OPTIONS
            ).map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid w-full gap-3 md:hidden sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="type-caption text-[var(--text-muted)]">Layout</span>
          <select
            value={layout}
            onChange={event => setLayout(event.target.value as GalleryLayoutMode)}
            className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
          >
            <option value="grid">Grid</option>
            <option value="dense">Dense</option>
            <option value="list">List</option>
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="type-caption text-[var(--text-muted)]">Density</span>
          <select
            value={density}
            onChange={event => setDensity(event.target.value as GalleryDensity)}
            className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
          >
            <option value="comfortable">Comfort</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="type-caption text-[var(--text-muted)]">Min rating</span>
          <select
            value={filter.minRating ?? ''}
            onChange={event =>
              setFilter(previous => ({
                ...previous,
                minRating: event.target.value
                  ? (Number(event.target.value) as 1 | 2 | 3 | 4 | 5)
                  : undefined,
              }))
            }
            className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
          >
            <option value="">Any ★</option>
            <option value="5">5★ only</option>
            <option value="4">≥4★</option>
            <option value="3">≥3★</option>
            <option value="1">≥1★</option>
          </select>
        </label>
      </div>

      {/* Segmented, like every other either/or picker (chips here read as filters). */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <SegmentedControl
          aria-label="Layout"
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'grid', label: 'Grid', testId: 'gallery-layout-grid' },
            { value: 'dense', label: 'Dense', testId: 'gallery-layout-dense' },
            { value: 'list', label: 'List', testId: 'gallery-layout-list' },
          ]}
        />
        <SegmentedControl
          aria-label="Density"
          value={density}
          onChange={setDensity}
          options={[
            { value: 'comfortable', label: 'Comfort', testId: 'gallery-density-comfortable' },
            { value: 'compact', label: 'Compact', testId: 'gallery-density-compact' },
          ]}
        />
      </div>

      <p className="shrink-0 type-caption text-[var(--text-muted)]">
        {totalFiltered} of {totalEntries}
        {showPagination ? ` · page ${currentPage}/${totalPages}` : ''}
        {!lean && embeddingSearchLoading ? ' · searching…' : null}
        {!lean && embeddingSearchUnavailable ? ' · semantic unavailable' : null}
        {!lean && similarSearchLoading ? ' · ranking similar…' : null}
      </p>
    </>
  );
}
