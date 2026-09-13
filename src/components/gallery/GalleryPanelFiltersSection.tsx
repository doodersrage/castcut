'use client';

import type { Dispatch, SetStateAction } from 'react';
import GalleryFiltersBar from '@/components/gallery/GalleryFiltersBar';
import GalleryFailedRecoveryBanner from '@/components/gallery/GalleryFailedRecoveryBanner';
import GalleryReviewBanner from '@/components/gallery/GalleryReviewBanner';
import GalleryStatsBar from '@/components/gallery/GalleryStatsBar';
import GalleryPaginator from '@/components/gallery/GalleryPaginator';
import type { GalleryHandoffPayload } from '@/lib/gallery-handoff';
import type {
  ComfyGalleryEntry,
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
} from '@/lib/comfyui-gallery';
import type { PromptProject } from '@/lib/prompt-projects';
import type { GalleryStats } from '@/lib/gallery-stats';
import type { GalleryDensity } from '@/lib/gallery-density';

type GalleryPanelFiltersSectionProps = {
  showFilters: boolean;
  leanGallery: boolean;
  pickFor: GalleryHandoffPayload['target'] | null;
  filter: ComfyGalleryFilter;
  setFilter: (
    patch: Partial<ComfyGalleryFilter> | ((previous: ComfyGalleryFilter) => ComfyGalleryFilter)
  ) => void;
  entries: ComfyGalleryEntry[];
  galleryStats: GalleryStats;
  activeJobs: number;
  heldMaxCount: number;
  activeProjectId: string | undefined;
  projectFilterId: string;
  setProjectFilterId: Dispatch<SetStateAction<string>>;
  refreshPending: () => Promise<void>;
  tools: string[];
  models: string[];
  userTags: string[];
  customGroups: string[];
  renameCustomGroup: (from: string, to: string) => number;
  deleteCustomGroup: (name: string) => number;
  setRequeueStatus: (status: string | null) => void;
  projects: PromptProject[];
  sort: ComfyGallerySort;
  setSort: (sort: ComfyGallerySort) => void;
  pageSize: GalleryPageSize;
  setPageSize: (size: GalleryPageSize) => void;
  paginationEnabled: boolean;
  embeddingSearchActive: boolean;
  embeddingSearchLoading: boolean;
  similarSearchLoading: boolean;
  embeddingSearchUnavailable: boolean;
  layout: GalleryLayoutMode;
  setLayout: (layout: GalleryLayoutMode) => void;
  density: GalleryDensity;
  setDensity: (density: GalleryDensity) => void;
  totalFiltered: number;
  currentPage: number;
  totalPages: number;
  showPagination: boolean;
  pageRangeStart: number;
  pageRangeEnd: number;
  slideshowAvailable: boolean;
  startSlideshow: () => void;
  startFullscreenSlideshow: () => void;
  visibleEntries: ComfyGalleryEntry[];
  selectedEntries: ComfyGalleryEntry[];
  retryFailedEntries: (entries: ComfyGalleryEntry[], mode?: 'same' | 'new' | 'exact') => void;
  setPage: (page: number) => void;
};

export default function GalleryPanelFiltersSection({
  showFilters,
  leanGallery,
  pickFor,
  filter,
  setFilter,
  entries,
  galleryStats,
  activeJobs,
  heldMaxCount,
  activeProjectId,
  projectFilterId,
  setProjectFilterId,
  refreshPending,
  tools,
  models,
  userTags,
  customGroups,
  renameCustomGroup,
  deleteCustomGroup,
  setRequeueStatus,
  projects,
  sort,
  setSort,
  pageSize,
  setPageSize,
  paginationEnabled,
  embeddingSearchActive,
  embeddingSearchLoading,
  similarSearchLoading,
  embeddingSearchUnavailable,
  layout,
  setLayout,
  density,
  setDensity,
  totalFiltered,
  currentPage,
  totalPages,
  showPagination,
  pageRangeStart,
  pageRangeEnd,
  slideshowAvailable,
  startSlideshow,
  startFullscreenSlideshow,
  visibleEntries,
  selectedEntries,
  retryFailedEntries,
  setPage,
}: GalleryPanelFiltersSectionProps) {
  return (
    <>
      {showFilters && entries.length > 0 ? (
        <GalleryStatsBar
          stats={galleryStats}
          filter={filter}
          activeJobs={activeJobs}
          heldMaxJobs={heldMaxCount}
          activeProjectId={activeProjectId}
          projectFilterActive={projectFilterId === 'active'}
          onProjectFilter={setProjectFilterId}
          onRefreshPending={() => void refreshPending()}
          onQuickFilter={patch => setFilter(previous => ({ ...previous, ...patch }))}
        />
      ) : null}

      {showFilters ? (
        <GalleryFiltersBar
          lean={leanGallery}
          filter={filter}
          setFilter={setFilter}
          tools={tools}
          models={models}
          userTags={userTags}
          customGroups={customGroups}
          onRenameCustomGroup={(from, to) => {
            const changed = renameCustomGroup(from, to);
            if (changed > 0) {
              setRequeueStatus(`Renamed group to ${to.trim()} (${changed} items)`);
            }
          }}
          onDeleteCustomGroup={name => {
            const changed = deleteCustomGroup(name);
            if (changed > 0) {
              setRequeueStatus(`Cleared group “${name}” from ${changed} items`);
            }
          }}
          projects={projects}
          projectFilterId={projectFilterId}
          setProjectFilterId={setProjectFilterId}
          sort={sort}
          setSort={setSort}
          pageSize={pageSize}
          setPageSize={setPageSize}
          paginationEnabled={paginationEnabled}
          embeddingSearchActive={embeddingSearchActive}
          embeddingSearchLoading={embeddingSearchLoading}
          similarSearchLoading={similarSearchLoading}
          embeddingSearchUnavailable={embeddingSearchUnavailable}
          layout={layout}
          setLayout={setLayout}
          density={density}
          setDensity={setDensity}
          totalFiltered={totalFiltered}
          totalEntries={entries.length}
          currentPage={currentPage}
          totalPages={totalPages}
          showPagination={showPagination}
          slideshowAvailable={slideshowAvailable}
          onStartSlideshow={startSlideshow}
          onStartFullscreenSlideshow={startFullscreenSlideshow}
        />
      ) : null}

      {filter.status === 'error' ? (
        <GalleryFailedRecoveryBanner
          failedEntries={visibleEntries.filter(entry => entry.status === 'error')}
          selectedFailedCount={selectedEntries.filter(entry => entry.status === 'error').length}
          onRetrySelected={mode =>
            retryFailedEntries(
              selectedEntries.filter(entry => entry.status === 'error'),
              mode
            )
          }
          onRetryAllVisible={mode =>
            retryFailedEntries(
              visibleEntries.filter(entry => entry.status === 'error'),
              mode
            )
          }
          onRetryCluster={(clusterEntries, mode) => retryFailedEntries(clusterEntries, mode)}
          onClearFailedFilter={() => setFilter(previous => ({ ...previous, status: 'all' }))}
        />
      ) : null}

      {filter.reviewMode && !pickFor ? <GalleryReviewBanner filter={filter} /> : null}

      {showPagination ? (
        <GalleryPaginator
          page={currentPage}
          totalPages={totalPages}
          totalItems={totalFiltered}
          rangeStart={pageRangeStart}
          rangeEnd={pageRangeEnd}
          onPageChange={setPage}
        />
      ) : null}
    </>
  );
}
