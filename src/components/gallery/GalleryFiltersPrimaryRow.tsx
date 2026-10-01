'use client';

import { useState } from 'react';

import { FilterChip } from '@/components/gallery/GalleryFilterChip';
import GalleryCastFilter from '@/components/gallery/GalleryCastFilter';
import type {
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
} from '@/lib/comfyui-gallery';
import type { GalleryDensity } from '@/lib/gallery-density';
import { useGalleryFilterQueryDraft } from '@/components/gallery/useGalleryFilterQueryDraft';
import { GalleryFiltersSearchGroup } from '@/components/gallery/filters/GalleryFiltersSearchGroup';
import { GalleryFiltersLayoutGroup } from '@/components/gallery/filters/GalleryFiltersLayoutGroup';
import { GalleryFiltersGroupsRail } from '@/components/gallery/filters/GalleryFiltersGroupsRail';
import { GalleryFiltersRatingModelRow } from '@/components/gallery/filters/GalleryFiltersRatingModelRow';
import { GalleryFiltersLeanRow } from '@/components/gallery/filters/GalleryFiltersLeanRow';
import { useGalleryManageMode } from '@/lib/gallery-manage-mode';

export type GalleryFiltersPrimaryRowProps = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  models: string[];
  castIds?: string[];
  hasPlayChecks?: boolean;
  customGroups?: string[];
  onRenameCustomGroup?: (from: string, to: string) => void;
  onDeleteCustomGroup?: (name: string) => void;
  sort: ComfyGallerySort;
  setSort: (value: ComfyGallerySort) => void;
  pageSize: GalleryPageSize;
  setPageSize: (value: GalleryPageSize) => void;
  paginationEnabled: boolean;
  embeddingSearchActive: boolean;
  embeddingSearchLoading?: boolean;
  similarSearchLoading?: boolean;
  embeddingSearchUnavailable?: boolean;
  layout: GalleryLayoutMode;
  setLayout: (value: GalleryLayoutMode) => void;
  density: GalleryDensity;
  setDensity: (value: GalleryDensity) => void;
  totalFiltered: number;
  totalEntries: number;
  currentPage: number;
  totalPages: number;
  showPagination: boolean;
  lean?: boolean;
};

export default function GalleryFiltersPrimaryRow({
  filter,
  setFilter,
  models,
  castIds,
  hasPlayChecks,
  customGroups = [],
  onRenameCustomGroup,
  onDeleteCustomGroup,
  sort,
  setSort,
  pageSize,
  setPageSize,
  paginationEnabled,
  embeddingSearchActive,
  embeddingSearchLoading = false,
  similarSearchLoading = false,
  embeddingSearchUnavailable = false,
  layout,
  setLayout,
  density,
  setDensity,
  totalFiltered,
  totalEntries,
  currentPage,
  totalPages,
  showPagination,
  lean = false,
}: GalleryFiltersPrimaryRowProps) {
  const { queryDraft, setQueryDraft } = useGalleryFilterQueryDraft(filter, setFilter);
  // Browse: the quick-filter row repeated the stat chips above it; custom groups are Manage work.
  const manage = useGalleryManageMode();
  // Phones: results start ~1400px down behind every filter — fold all but Search.
  const [phoneFiltersOpen, setPhoneFiltersOpen] = useState(false);
  const activeFilterCount = [
    filter.status && filter.status !== 'all',
    filter.customGroup,
    filter.minRating,
    filter.model,
    filter.characterId,
    filter.playCheckMissOnly,
    filter.semanticSearch,
  ].filter(Boolean).length;
  const phoneHidden = phoneFiltersOpen ? '' : 'max-md:hidden';

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <GalleryFiltersSearchGroup
          collapsedOnPhone={!phoneFiltersOpen}
          phoneToggle={
            // A wrapper owns the breakpoint — .ui-btn sets its own display.
            <span className="basis-full md:hidden">
              <button
                type="button"
                className="ui-btn-secondary ui-btn-sm whitespace-nowrap"
                aria-expanded={phoneFiltersOpen}
                data-testid="gallery-filters-phone-toggle"
                onClick={() => setPhoneFiltersOpen(open => !open)}
              >
                {phoneFiltersOpen ? 'Hide filters' : 'Filters'}
                {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
              </button>
            </span>
          }
          lean={lean}
          filter={filter}
          setFilter={setFilter}
          queryDraft={queryDraft}
          setQueryDraft={setQueryDraft}
          embeddingSearchActive={embeddingSearchActive}
          embeddingSearchLoading={embeddingSearchLoading}
          embeddingSearchUnavailable={embeddingSearchUnavailable}
          customGroups={customGroups}
          onRenameCustomGroup={onRenameCustomGroup}
          onDeleteCustomGroup={onDeleteCustomGroup}
        />
        <div className={`contents ${phoneHidden}`}>
          <GalleryFiltersLayoutGroup
            lean={lean}
            filter={filter}
            setFilter={setFilter}
            sort={sort}
            setSort={setSort}
            paginationEnabled={paginationEnabled}
            layout={layout}
            setLayout={setLayout}
            density={density}
            setDensity={setDensity}
            totalFiltered={totalFiltered}
            totalEntries={totalEntries}
            currentPage={currentPage}
            totalPages={totalPages}
            showPagination={showPagination}
            embeddingSearchLoading={embeddingSearchLoading}
            embeddingSearchUnavailable={embeddingSearchUnavailable}
            similarSearchLoading={similarSearchLoading}
          />
        </div>
      </div>

      {manage ? (
        <GalleryFiltersGroupsRail
          filter={filter}
          setFilter={setFilter}
          customGroups={customGroups}
        />
      ) : null}

      <div className={`contents ${phoneHidden}`}>
        <GalleryFiltersRatingModelRow filter={filter} setFilter={setFilter} models={models} />
        <GalleryCastFilter filter={filter} setFilter={setFilter} castIds={castIds ?? []} />
      </div>

      {hasPlayChecks ? (
        <div
          className={`flex flex-wrap items-center gap-1.5 ${phoneHidden}`}
          role="group"
          aria-label="Filter by checks"
        >
          <span className="type-caption text-[var(--text-muted)]">Checks</span>
          <FilterChip
            active={Boolean(filter.playCheckMissOnly)}
            label="Missed pose / face"
            testId="gallery-filter-play-miss"
            onClick={() =>
              setFilter(previous => ({
                ...previous,
                playCheckMissOnly: previous.playCheckMissOnly ? undefined : true,
              }))
            }
          />
        </div>
      ) : null}

      {lean && manage ? (
        <GalleryFiltersLeanRow
          filter={filter}
          setFilter={setFilter}
          paginationEnabled={paginationEnabled}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />
      ) : null}
    </>
  );
}
