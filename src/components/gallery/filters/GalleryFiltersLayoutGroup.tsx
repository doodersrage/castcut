'use client';

import type { ComfyGallerySort, GalleryLayoutMode } from '@/lib/gallery/comfyui-gallery';
import type { GalleryDensity } from '@/lib/gallery/density';
import { SegmentedControl } from '@/components/ui/ToolPageShell';
import { GALLERY_SORT_OPTIONS } from '@/components/gallery/gallery-filters-shared';

type Props = {
  lean: boolean;
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

const GALLERY_SIZES: Array<{
  value: 'small' | 'medium' | 'large' | 'list';
  label: string;
  layout: GalleryLayoutMode;
  density?: GalleryDensity;
}> = [
  { value: 'small', label: 'Small', layout: 'dense', density: 'compact' },
  { value: 'medium', label: 'Medium', layout: 'grid', density: 'compact' },
  { value: 'large', label: 'Large', layout: 'grid', density: 'comfortable' },
  { value: 'list', label: 'List', layout: 'list' },
];

/** The size a layout and density amount to. */
export function gallerySizeOf(layout: GalleryLayoutMode, density: GalleryDensity) {
  if (layout === 'list') return 'list';
  if (layout === 'dense') return 'small';
  return density === 'compact' ? 'medium' : 'large';
}

export function GalleryFiltersLayoutGroup({
  lean,
  sort,
  setSort,
  paginationEnabled,
  layout,
  setLayout,
  density,
  setDensity,
  totalFiltered,
  totalEntries,
  embeddingSearchLoading,
  embeddingSearchUnavailable,
  similarSearchLoading,
}: Props) {
  return (
    <>
      {paginationEnabled ? (
        <label className="min-w-[8rem]">
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={event => setSort(event.target.value as ComfyGallerySort)}
            className="ui-select h-9 w-auto"
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

      {/* One choice for how big the pictures are (2026-11-05): Grid / Dense / List and Comfort /
          Compact were two controls for it. */}
      <SegmentedControl
        aria-label="Picture size"
        value={gallerySizeOf(layout, density)}
        onChange={value => {
          const next = GALLERY_SIZES.find(size => size.value === value);
          if (!next) return;
          setLayout(next.layout);
          if (next.density) setDensity(next.density);
        }}
        options={GALLERY_SIZES.map(size => ({
          value: size.value,
          label: size.label,
          testId: `gallery-size-${size.value}`,
        }))}
      />

      <p className="shrink-0 type-caption text-[var(--text-muted)]">
        {/* The paginator says the range and page; here only how many match a filter. */}
        {totalFiltered !== totalEntries ? `${totalFiltered} of ${totalEntries} match` : null}
        {!lean && embeddingSearchLoading ? ' · searching…' : null}
        {!lean && embeddingSearchUnavailable ? ' · semantic unavailable' : null}
        {!lean && similarSearchLoading ? ' · ranking similar…' : null}
      </p>
    </>
  );
}
