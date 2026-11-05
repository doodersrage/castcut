'use client';

import {
  GalleryRatingSelect,
  GalleryTypeChips,
} from '@/components/gallery/filters/GalleryTypeChips';

import { useState } from 'react';

import { FilterChip } from '@/components/gallery/GalleryFilterChip';
import GalleryCastFilter from '@/components/gallery/GalleryCastFilter';
import GalleryRedoNeedsLook from '@/components/gallery/GalleryRedoNeedsLook';
import GalleryLookFilter from '@/components/gallery/GalleryLookFilter';
import type {
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
} from '@/lib/gallery/comfyui-gallery';
import type { GalleryDensity } from '@/lib/gallery/density';
import { useGalleryFilterQueryDraft } from '@/components/gallery/useGalleryFilterQueryDraft';
import { GalleryFiltersSearchGroup } from '@/components/gallery/filters/GalleryFiltersSearchGroup';
import { GalleryFiltersLayoutGroup } from '@/components/gallery/filters/GalleryFiltersLayoutGroup';
import { GalleryFiltersGroupsRail } from '@/components/gallery/filters/GalleryFiltersGroupsRail';
import { GalleryFiltersLeanRow } from '@/components/gallery/filters/GalleryFiltersLeanRow';
import { useGalleryManageMode } from '@/lib/gallery/manage-mode';

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
  castIds,
  customGroups = [],
  onRenameCustomGroup,
  onDeleteCustomGroup,
  sort,
  setSort,
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
    filter.characterId && filter.lookId,
    filter.playCheckMissOnly,
    filter.semanticSearch,
  ].filter(Boolean).length;
  const phoneHidden = phoneFiltersOpen ? '' : 'max-md:hidden';

  const searchProps = {
    lean,
    filter,
    setFilter,
    queryDraft,
    setQueryDraft,
    embeddingSearchActive,
    embeddingSearchLoading,
    embeddingSearchUnavailable,
    customGroups,
    onRenameCustomGroup,
    onDeleteCustomGroup,
  };

  // One slim bar (2026-11-05): search, what kind, stars, sort and size on a line, then Cast and
  // look — the rest is in Filters (GalleryFiltersMoreRow). It was ~400px of controls.
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <GalleryFiltersSearchGroup
          {...searchProps}
          part="search"
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
        />
        <div className={`contents ${phoneHidden}`}>
          <GalleryTypeChips filter={filter} setFilter={setFilter} />
          <GalleryRatingSelect filter={filter} setFilter={setFilter} />
          <GalleryFiltersLayoutGroup
            lean={lean}
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
        <GalleryCastFilter filter={filter} setFilter={setFilter} castIds={castIds ?? []} />
        <GalleryLookFilter filter={filter} setFilter={setFilter} />
      </div>
    </>
  );
}

/** The Filters panel's first row: match, status, group, model, checks (and lean paging). */
export function GalleryFiltersMoreRow({
  filter,
  setFilter,
  models,
  hasPlayChecks,
  customGroups = [],
  onRenameCustomGroup,
  onDeleteCustomGroup,
  pageSize,
  setPageSize,
  paginationEnabled,
  embeddingSearchActive,
  embeddingSearchLoading = false,
  embeddingSearchUnavailable = false,
  lean = false,
}: Pick<
  GalleryFiltersPrimaryRowProps,
  | 'filter'
  | 'setFilter'
  | 'models'
  | 'hasPlayChecks'
  | 'customGroups'
  | 'onRenameCustomGroup'
  | 'onDeleteCustomGroup'
  | 'pageSize'
  | 'setPageSize'
  | 'paginationEnabled'
  | 'embeddingSearchActive'
  | 'embeddingSearchLoading'
  | 'embeddingSearchUnavailable'
  | 'lean'
>) {
  const { queryDraft, setQueryDraft } = useGalleryFilterQueryDraft(filter, setFilter);
  const manage = useGalleryManageMode();
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <GalleryFiltersSearchGroup
          part="more"
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
        {lean && models.length > 0 ? (
          <label className="min-w-[8rem] space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Model</span>
            <select
              value={filter.model ?? ''}
              onChange={event => setFilter({ ...filter, model: event.target.value || undefined })}
              data-testid="gallery-filter-model"
              className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
            >
              <option value="">All models</option>
              {models.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {hasPlayChecks ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by checks"
        >
          <span className="type-caption text-[var(--text-muted)]">Checks</span>
          <FilterChip
            active={Boolean(filter.playCheckMissOnly)}
            label="Needs a look"
            testId="gallery-filter-play-miss"
            onClick={() =>
              setFilter(previous => ({
                ...previous,
                playCheckMissOnly: previous.playCheckMissOnly ? undefined : true,
              }))
            }
          />
          {filter.playCheckMissOnly ? <GalleryRedoNeedsLook castId={filter.characterId} /> : null}
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
