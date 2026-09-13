'use client';

import GalleryPanelBulkSection from '@/components/gallery/GalleryPanelBulkSection';
import GalleryPanelFiltersSection from '@/components/gallery/GalleryPanelFiltersSection';
import GalleryPanelGridSection from '@/components/gallery/GalleryPanelGridSection';
import GalleryPanelReviewSlot from '@/components/gallery/GalleryPanelReviewSlot';
import GalleryPanelCapSection from '@/components/gallery/GalleryPanelCapSection';
import GalleryPanelModalsSlot from '@/components/gallery/GalleryPanelModalsSlot';
import GalleryPanelLightboxSlot from '@/components/gallery/GalleryPanelLightboxSlot';
import GalleryPanelStatusSection from '@/components/gallery/GalleryPanelStatusSection';
import GalleryPanelAuxiliarySection from '@/components/gallery/GalleryPanelAuxiliarySection';
import GalleryDerivedKindChips from '@/components/gallery/GalleryDerivedKindChips';
import { useGalleryLoraExportConfirm } from '@/hooks/useGalleryLoraExportConfirm';
import type { GalleryPanelBodyProps } from '@/components/gallery/gallery-panel-body-types';

export default function GalleryPanelBodyContent({
  chrome,
  upload,
  lightbox,
  header,
  status,
  cap,
  auxiliary,
  browse,
  selection,
  bulk,
  modals,
  grid,
  review,
  removeEntries,
  setFavorites,
  setRequeueStatus,
}: GalleryPanelBodyProps) {
  const { onLoraExportCancel, onLoraExportConfirm } = useGalleryLoraExportConfirm({
    loraExportScope: modals.loraExportScope,
    selectedEntries: selection.selectedEntries,
    entries: browse.entries,
    setLoraExportOpen: bulk.setLoraExportOpen,
    setRequeueStatus,
  });

  return (
    <>
      <GalleryPanelLightboxSlot
        uploadInputRef={upload.uploadInputRef}
        importDroppedImages={upload.importDroppedImages}
        lightbox={lightbox}
      />

      <GalleryPanelStatusSection
        showHeader={chrome.showHeader}
        leanGallery={chrome.leanGallery}
        compact={chrome.compact}
        limit={chrome.limit}
        uploadInputRef={upload.uploadInputRef}
        header={header}
        requeueStatus={status.requeueStatus}
        pickFor={chrome.pickFor}
      />

      <GalleryPanelCapSection
        showFilters={chrome.showFilters}
        galleryCapWarning={cap.galleryCapWarning}
        capWizardOpen={cap.capWizardOpen}
        setCapWizardOpen={cap.setCapWizardOpen}
        capEvictionPreview={cap.capEvictionPreview}
        entriesLength={browse.entries.length}
        setFilter={browse.setFilter}
        exportCapKeepers={cap.exportCapKeepers}
        removeEntries={removeEntries}
        setFavorites={setFavorites}
      />

      <GalleryPanelAuxiliarySection
        showFilters={chrome.showFilters}
        filter={browse.filter}
        duplicateClusters={auxiliary.duplicateClusters}
        duplicateEntriesById={auxiliary.duplicateEntriesById}
        setSelectedIds={selection.setSelectedIds}
        setFilter={browse.setFilter}
        removeEntries={removeEntries}
        setCompareOpen={selection.setCompareOpen}
        showVisionInbox={auxiliary.showVisionInbox}
        visionInboxQueue={auxiliary.visionInboxQueue}
        setReviewRating={auxiliary.setReviewRating}
        setVisionInboxSkipIds={auxiliary.setVisionInboxSkipIds}
        setVisionInboxOpen={auxiliary.setVisionInboxOpen}
      />

      <GalleryPanelFiltersSection
        showFilters={chrome.showFilters}
        leanGallery={chrome.leanGallery}
        pickFor={chrome.pickFor}
        filter={browse.filter}
        setFilter={browse.setFilter}
        entries={browse.entries}
        galleryStats={browse.galleryStats}
        activeJobs={header.activeJobs}
        heldMaxCount={browse.heldMaxCount}
        activeProjectId={browse.activeProjectId}
        projectFilterId={browse.projectFilterId}
        setProjectFilterId={browse.setProjectFilterId}
        refreshPending={browse.refreshPending}
        tools={browse.tools}
        models={browse.models}
        userTags={browse.userTags}
        customGroups={browse.customGroups}
        renameCustomGroup={browse.renameCustomGroup}
        deleteCustomGroup={browse.deleteCustomGroup}
        setRequeueStatus={setRequeueStatus}
        projects={browse.projects}
        sort={browse.sort}
        setSort={browse.setSort}
        pageSize={browse.pageSize}
        setPageSize={browse.setPageSize}
        paginationEnabled={chrome.paginationEnabled}
        embeddingSearchActive={browse.embeddingSearchActive}
        embeddingSearchLoading={browse.embeddingSearchLoading}
        similarSearchLoading={browse.similarSearchLoading}
        embeddingSearchUnavailable={browse.embeddingSearchUnavailable}
        layout={browse.layout}
        setLayout={browse.setLayout}
        density={browse.density}
        setDensity={browse.setDensity}
        totalFiltered={browse.totalFiltered}
        currentPage={browse.currentPage}
        totalPages={browse.totalPages}
        showPagination={browse.showPagination}
        pageRangeStart={browse.pageRangeStart}
        pageRangeEnd={browse.pageRangeEnd}
        slideshowAvailable={lightbox.playlistLength > 1}
        startSlideshow={browse.startSlideshow}
        startFullscreenSlideshow={browse.startFullscreenSlideshow}
        visibleEntries={browse.visibleEntries}
        selectedEntries={selection.selectedEntries}
        retryFailedEntries={browse.retryFailedEntries}
        setPage={browse.setPage}
      />

      <GalleryPanelBulkSection
        leanGallery={chrome.leanGallery}
        leanBulkEnabled={chrome.leanBulkEnabled}
        bulkEnabled={chrome.bulkEnabled}
        visibleEntries={browse.visibleEntries}
        selectedIds={selection.selectedIds}
        selectedEntries={selection.selectedEntries}
        projects={browse.projects}
        paramAxis={bulk.paramAxis}
        setParamAxis={bulk.setParamAxis}
        similarSearchActive={bulk.similarSearchActive}
        clearSelection={selection.clearSelection}
        openCompare={selection.openCompare}
        bulkExperimentHandlers={bulk.bulkExperimentHandlers}
        downloadError={bulk.downloadError}
        filter={browse.filter}
        setFilter={browse.setFilter}
        setLoraExportScope={bulk.setLoraExportScope}
        setLoraExportOpen={bulk.setLoraExportOpen}
        selectAllVisible={selection.selectAllVisible}
      />

      <GalleryDerivedKindChips filter={browse.filter} setFilter={browse.setFilter} />

      <GalleryPanelModalsSlot
        compareOpen={modals.compareOpen}
        selectedEntries={selection.selectedEntries}
        compareHandlers={modals.compareHandlers}
        onCompareClose={() => {
          selection.setCompareOpen(false);
          modals.resetCompare();
        }}
        onOpenPreviewFromCompare={entry => {
          selection.setCompareOpen(false);
          modals.openEntryLightbox(entry, 0);
        }}
        workflowEntry={modals.workflowEntry}
        onWorkflowClose={() => modals.setWorkflowEntry(null)}
        loraExportOpen={modals.loraExportOpen}
        loraExportScope={modals.loraExportScope}
        selectedEntriesForExport={selection.selectedEntries}
        allEntries={browse.entries}
        onLoraExportCancel={onLoraExportCancel}
        onLoraExportConfirm={onLoraExportConfirm}
      />

      <GalleryPanelGridSection
        visibleEntries={browse.visibleEntries}
        entriesLength={browse.entries.length}
        clearGalleryFilters={browse.clearGalleryFilters}
        onUpload={() => upload.uploadInputRef.current?.click()}
        lineageGroups={grid.lineageGroups}
        collapsedLineageGroups={grid.collapsedLineageGroups}
        toggleLineageGroup={grid.toggleLineageGroup}
        experimentGroups={grid.experimentGroups}
        collapsedExperimentGroups={grid.collapsedExperimentGroups}
        toggleExperimentGroup={grid.toggleExperimentGroup}
        experimentWinners={grid.experimentWinners}
        experimentGridHandlers={grid.experimentGridHandlers}
        layout={browse.layout}
        density={browse.density}
        compact={chrome.compact}
        galleryCardGridClass={grid.galleryCardGridClass}
        galleryVirtualGridClass={grid.galleryVirtualGridClass}
        renderGalleryCard={grid.renderGalleryCard}
        showPagination={browse.showPagination}
        currentPage={browse.currentPage}
        totalPages={browse.totalPages}
        totalFiltered={browse.totalFiltered}
        pageRangeStart={browse.pageRangeStart}
        pageRangeEnd={browse.pageRangeEnd}
        setPage={browse.setPage}
        scrollToEntryId={review.reviewFocusEntry?.id ?? browse.filter.focusEntryId?.trim() ?? null}
      />

      {browse.filter.reviewMode && review.reviewFocusEntry ? (
        <GalleryPanelReviewSlot
          reviewFocusEntry={review.reviewFocusEntry}
          reviewFocusIndex={review.reviewFocusIndex}
          visibleEntries={browse.visibleEntries}
          onReviewRating={review.handleReviewRating}
          onToggleFavorite={review.toggleFavorite}
          onSelectEntry={entryId => selection.setSelectedIds([entryId])}
        />
      ) : null}
    </>
  );
}
