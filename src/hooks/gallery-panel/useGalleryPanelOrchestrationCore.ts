'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useGalleryBrowseState } from '@/hooks/useGalleryBrowseState';
import { useGalleryCardRenderer } from '@/hooks/useGalleryCardRenderer';
import { useGalleryCompareHandlers } from '@/hooks/useGalleryCompareHandlers';
import { useGalleryDisplayPlan } from '@/hooks/useGalleryDisplayPlan';
import { useGalleryExperimentGridHandlers } from '@/hooks/useGalleryExperimentGridHandlers';
import { useGalleryLightboxBindings } from '@/hooks/useGalleryLightboxBindings';
import { useGalleryPanelActions } from '@/hooks/useGalleryPanelActions';
import { useGalleryPanelLightbox } from '@/hooks/useGalleryPanelLightbox';
import { useGalleryPanelRecovery } from '@/hooks/useGalleryPanelRecovery';
import { useGalleryPanelUiState } from '@/hooks/useGalleryPanelUiState';
import { useGalleryReview } from '@/hooks/useGalleryReview';
import { useGallerySelection } from '@/hooks/useGallerySelection';
import { useComfyUiGallery } from '@/hooks/useComfyUiGallery';
import { useHeldMaxCount } from '@/hooks/useHeldMaxJobs';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { assessGalleryCapWarning } from '@/lib/gallery-cap';
import { isGalleryStoreReady } from '@/lib/comfyui-gallery';
import { parseGalleryPickTarget } from '@/lib/gallery-handoff';
import { MAX_GALLERY_ENTRIES } from '@/lib/comfyui-gallery-storage-meta';
import { computeGalleryStats } from '@/lib/gallery-stats';
import { loadActiveProjectId, loadPromptProjects } from '@/lib/prompt-projects';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';

export type UseGalleryPanelOrchestrationOptions = {
  limit?: number;
  showHeader?: boolean;
  compact?: boolean;
  showFilters?: boolean;
};

export function useGalleryPanelOrchestrationCore({
  limit,
  showHeader = true,
  compact = false,
  showFilters = false,
}: UseGalleryPanelOrchestrationOptions) {
  const pathname = usePathname();
  const browsePaginationEnabled = showFilters && !compact && !limit;
  const workspaceMode = useWorkspaceMode();
  const leanGallery = isLeanWorkspaceMode(workspaceMode) && showFilters && !compact;

  const gallery = useComfyUiGallery();
  const {
    storeReady,
    entries,
    filteredEntries,
    filter,
    setFilter,
    tools,
    models,
    userTags,
    customGroups,
    removeEntry,
    removeEntries,
    toggleFavorite,
    setFavorites,
    setReviewRatings,
    setUserTags,
    setCustomGroups,
    renameCustomGroup,
    deleteCustomGroup,
    setProjectIds,
    clearAll,
    refreshPending,
    setReviewRating,
    embeddingSearchActive,
    similarSearchActive,
    embeddingSearchLoading,
    similarSearchLoading,
    embeddingSearchUnavailable,
  } = gallery;

  useEffect(() => {
    if (!leanGallery) {
      return;
    }
    setFilter(previous => ({
      ...previous,
      semanticSearch: undefined,
      similarToEntryId: undefined,
      similarMode: undefined,
      visionTagsOnly: undefined,
    }));
  }, [leanGallery, setFilter]);

  const searchParams = useSearchParams();
  const pickFor = useMemo(
    () => parseGalleryPickTarget(searchParams.get('pickFor')),
    [searchParams]
  );

  const router = useRouter();
  const heldMaxCount = useHeldMaxCount();
  const [projects] = useState(() => loadPromptProjects());

  const { galleryEntriesSettled, setGalleryEntriesSettled, ...ui } =
    useGalleryPanelUiState(searchParams);

  const bulkEnabled = showFilters && !compact;
  const leanBulkEnabled = bulkEnabled;
  const paginationEnabled = browsePaginationEnabled;

  const browse = useGalleryBrowseState({
    browsePaginationEnabled,
    pathname,
    showFilters,
    filter,
    setFilter,
    paginationEnabled,
    storeReady,
    galleryEntriesSettled,
  });

  const galleryStats = useMemo(() => computeGalleryStats(entries), [entries]);
  const galleryCapWarning = useMemo(
    () => assessGalleryCapWarning(entries.length, MAX_GALLERY_ENTRIES),
    [entries.length]
  );
  const activeJobs = galleryStats.pending + galleryStats.running;

  const displayPlan = useGalleryDisplayPlan({
    showFilters,
    filteredEntries,
    entries,
    filter,
    paginationEnabled,
    sort: browse.sort,
    page: browse.page,
    pageSize: browse.pageSize,
    limit,
    pageClamp: browse.pageClamp,
    layout: browse.layout,
    density: browse.density,
    compact,
    capWizardOpen: ui.capWizardOpen,
    visionInboxOpen: ui.visionInboxOpen,
    visionInboxSkipIds: ui.visionInboxSkipIds,
  });

  const visibleEntryIds = useMemo(
    () => new Set(displayPlan.visibleEntries.map(entry => entry.id)),
    [displayPlan.visibleEntries]
  );

  const lightboxState = useGalleryPanelLightbox({
    sortedSource: displayPlan.sortedSource,
    storeReady,
    entries,
    searchParams,
    pagination: paginationEnabled
      ? {
          enabled: true,
          page: displayPlan.currentPage,
          pageSize: browse.pageSize,
          experimentGroups: displayPlan.experimentGroups,
          visibleEntryIds,
          setPage: browse.setPage,
        }
      : undefined,
  });

  useEffect(() => {
    if (!storeReady) {
      return;
    }
    if (entries.length > 0) {
      scheduleAfterCommit(() => {
        setGalleryEntriesSettled(true);
      });
      return;
    }
    if (!isGalleryStoreReady()) {
      return;
    }
    let cancelled = false;
    const frameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) {
          setGalleryEntriesSettled(true);
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [storeReady, entries.length, setGalleryEntriesSettled]);

  const { retryFailedEntries, exportCapKeepers, archiveThenPurgeRest } = useGalleryPanelRecovery({
    entries,
    setRequeueStatus: ui.setRequeueStatus,
    removeEntries,
  });

  const selection = useGallerySelection(displayPlan.visibleEntries);

  const { compareHandlers, resetCompare } = useGalleryCompareHandlers({
    selectedEntries: selection.selectedEntries,
    setFavorites,
    setReviewRating,
    toggleFavorite,
  });

  const review = useGalleryReview({
    filter,
    visibleEntries: displayPlan.visibleEntries,
    selectedIds: selection.selectedIds,
    setSelectedIds: selection.setSelectedIds,
    selectedIdSet: selection.selectedIdSet,
    setReviewRating,
    toggleFavorite,
    onStatusMessage: ui.setRequeueStatus,
    keyboardEnabled: !lightboxState.lightbox,
  });

  const activeProjectId = useMemo(() => loadActiveProjectId(), []);

  const entriesRef = useRef(entries);
  const entryIdsWithDerivatives = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (entry.parentGalleryEntryId) {
        ids.add(entry.parentGalleryEntryId);
      }
    }
    return ids;
  }, [entries]);

  const { onDownloadImage, lightboxSlideChrome } = useGalleryLightboxBindings({
    resolvedLightbox: lightboxState.resolvedLightbox,
    lightboxEntries: lightboxState.lightboxEntries,
    lightboxEntriesRef: lightboxState.lightboxEntriesRef,
    entries,
    entryIdsWithDerivatives,
    selectedIdSet: selection.selectedIdSet,
    selectedIds: selection.selectedIds,
    router,
    handleReviewRating: review.handleReviewRating,
    toggleFavorite,
    toggleSelected: selection.toggleSelected,
    removeEntry,
    setRequeueStatus: ui.setRequeueStatus,
    setCompareOpen: ui.setCompareOpen,
    setFilter,
    applyPlaylistState: lightboxState.applyPlaylistState,
  });

  const { galleryCardActionsRef, bulkExperimentHandlers } = useGalleryPanelActions({
    entriesRef,
    toggleSelected: selection.toggleSelected,
    removeEntry,
    toggleFavorite,
    setRequeueStatus: ui.setRequeueStatus,
    setDownloadError: ui.setDownloadError,
    setFilter,
    setWorkflowEntry: ui.setWorkflowEntry,
    openLightboxForEntryId: lightboxState.openLightboxForEntryId,
    prefetchLightboxForEntryId: lightboxState.prefetchLightboxForEntryId,
    handleReviewRating: review.handleReviewRating,
    pickFor,
    router,
    selectedIds: selection.selectedIds,
    selectedEntries: selection.selectedEntries,
    setSelectedIds: selection.setSelectedIds,
    setProjectIds,
    removeEntries,
    setFavorites,
    setReviewRatings,
    setUserTags,
    setCustomGroups,
    renameCustomGroup,
    deleteCustomGroup,
    customGroups,
    paramAxis: ui.paramAxis,
    filter,
    setLoraExportScope: ui.setLoraExportScope,
    setLoraExportOpen: ui.setLoraExportOpen,
  });

  useLayoutEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const renderGalleryCard = useGalleryCardRenderer({
    galleryCardActionsRef,
    compact,
    layout: browse.layout,
    bulkEnabled,
    pickFor,
    selectedIdSet: selection.selectedIdSet,
    filter,
    reviewFocusEntry: review.reviewFocusEntry,
    entryIdsWithDerivatives,
    leanGallery,
  });

  const experimentGridHandlers = useGalleryExperimentGridHandlers({
    experimentWinners: browse.experimentWinners,
    setExperimentWinners: browse.setExperimentWinners,
    setReviewRatings,
    setSelectedIds: selection.setSelectedIds,
    setCompareOpen: ui.setCompareOpen,
    setRequeueStatus: ui.setRequeueStatus,
    galleryCardActionsRef,
  });

  const showSkeleton = entries.length === 0 && !storeReady;

  return {
    showHeader,
    showFilters,
    compact,
    limit,
    leanGallery,
    leanBulkEnabled,
    bulkEnabled,
    paginationEnabled,
    pickFor,
    storeReady,
    entries,
    filter,
    setFilter,
    tools,
    models,
    userTags,
    customGroups,
    renameCustomGroup,
    deleteCustomGroup,
    removeEntry,
    removeEntries,
    toggleFavorite,
    setFavorites,
    setReviewRatings,
    refreshPending,
    clearAll,
    activeJobs,
    galleryCapWarning,
    galleryStats,
    heldMaxCount,
    activeProjectId,
    projects,
    browse,
    displayPlan,
    lightboxState,
    ui,
    selection,
    compareHandlers,
    resetCompare,
    review,
    onDownloadImage,
    lightboxSlideChrome,
    bulkExperimentHandlers,
    experimentGridHandlers,
    renderGalleryCard,
    retryFailedEntries,
    exportCapKeepers,
    archiveThenPurgeRest,
    showSkeleton,
    embeddingSearchActive,
    similarSearchActive,
    embeddingSearchLoading,
    similarSearchLoading,
    embeddingSearchUnavailable,
    setReviewRating,
  };
}

export type GalleryPanelOrchestrationCore = ReturnType<typeof useGalleryPanelOrchestrationCore>;
