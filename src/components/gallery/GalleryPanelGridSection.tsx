'use client';

import type { ReactNode } from 'react';
import GalleryDisplayGrid from '@/components/gallery/GalleryDisplayGrid';
import GalleryEmptyPanel from '@/components/gallery/GalleryEmptyPanel';
import GalleryPaginator from '@/components/gallery/GalleryPaginator';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';
import type { ExperimentWinnerRecord } from '@/lib/experiment-winners';
import type { ExperimentGroup } from '@/lib/experiment-groups';
import { buildGalleryLineageGroups } from '@/lib/gallery-lineage-groups';
import type { GalleryDensity } from '@/lib/gallery-density';

type GalleryPanelGridSectionProps = {
  visibleEntries: ComfyGalleryEntry[];
  entriesLength: number;
  clearGalleryFilters: () => void;
  onUpload: () => void;
  lineageGroups: ReturnType<typeof buildGalleryLineageGroups> | null;
  collapsedLineageGroups: Set<string>;
  toggleLineageGroup: (rootId: string) => void;
  experimentGroups: ExperimentGroup[];
  collapsedExperimentGroups: Set<string>;
  toggleExperimentGroup: (groupId: string) => void;
  experimentWinners: Record<string, ExperimentWinnerRecord>;
  experimentGridHandlers: {
    onCrownExperiment: (groupId: string, entryId: string) => void;
    onCompareExperiment: (entries: ComfyGalleryEntry[]) => void;
    onRequeueExperiment: (entries: ComfyGalleryEntry[]) => void;
    onWinnerUpscale: (entry: ComfyGalleryEntry) => void;
    onWinnerRefine: (entry: ComfyGalleryEntry) => void;
    onWinnerContinue: (entry: ComfyGalleryEntry) => void;
  };
  layout: GalleryLayoutMode;
  density: GalleryDensity;
  compact: boolean;
  galleryCardGridClass: string;
  galleryVirtualGridClass: string;
  renderGalleryCard: (entry: ComfyGalleryEntry) => ReactNode;
  showPagination: boolean;
  currentPage: number;
  totalPages: number;
  totalFiltered: number;
  pageRangeStart: number;
  pageRangeEnd: number;
  setPage: (page: number) => void;
  scrollToEntryId?: string | null;
  derivedKind?: string | null;
  characterId?: string | null;
};

export default function GalleryPanelGridSection({
  visibleEntries,
  entriesLength,
  clearGalleryFilters,
  onUpload,
  lineageGroups,
  collapsedLineageGroups,
  toggleLineageGroup,
  experimentGroups,
  collapsedExperimentGroups,
  toggleExperimentGroup,
  experimentWinners,
  experimentGridHandlers,
  layout,
  density,
  compact,
  galleryCardGridClass,
  galleryVirtualGridClass,
  renderGalleryCard,
  showPagination,
  currentPage,
  totalPages,
  totalFiltered,
  pageRangeStart,
  pageRangeEnd,
  setPage,
  scrollToEntryId = null,
  derivedKind = null,
  characterId = null,
}: GalleryPanelGridSectionProps) {
  return (
    <>
      {visibleEntries.length === 0 ? (
        <GalleryEmptyPanel
          filtered={entriesLength > 0}
          onClearFilters={clearGalleryFilters}
          onUpload={onUpload}
          derivedKind={derivedKind}
          characterId={characterId}
        />
      ) : (
        <GalleryDisplayGrid
          visibleEntries={visibleEntries}
          lineageGroups={lineageGroups}
          collapsedLineageGroups={collapsedLineageGroups}
          onToggleLineageGroup={toggleLineageGroup}
          experimentGroups={experimentGroups}
          collapsedExperimentGroups={collapsedExperimentGroups}
          onToggleExperimentGroup={toggleExperimentGroup}
          experimentWinners={experimentWinners}
          onCrownExperiment={experimentGridHandlers.onCrownExperiment}
          onCompareExperiment={experimentGridHandlers.onCompareExperiment}
          onRequeueExperiment={experimentGridHandlers.onRequeueExperiment}
          onWinnerUpscale={experimentGridHandlers.onWinnerUpscale}
          onWinnerRefine={experimentGridHandlers.onWinnerRefine}
          onWinnerContinue={experimentGridHandlers.onWinnerContinue}
          layout={layout}
          density={density}
          compact={compact}
          gridClassName={galleryCardGridClass}
          virtualGridClassName={galleryVirtualGridClass}
          renderCard={renderGalleryCard}
          scrollToEntryId={scrollToEntryId}
        />
      )}

      {showPagination && visibleEntries.length > 0 ? (
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
