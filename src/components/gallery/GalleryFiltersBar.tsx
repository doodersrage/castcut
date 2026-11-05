'use client';

import { useEffect, useRef } from 'react';

import type { PromptProject } from '@/lib/prompt/projects';
import type {
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
} from '@/lib/gallery/comfyui-gallery';
import type { GalleryDensity } from '@/lib/gallery/density';
import { GalleryFiltersAdvancedPanel } from '@/components/gallery/GalleryFiltersAdvancedPanel';
import GalleryFiltersPrimaryRow, {
  GalleryFiltersMoreRow,
} from '@/components/gallery/GalleryFiltersPrimaryRow';
import GalleryFiltersSavedViews, {
  useGallerySavedViewsState,
} from '@/components/gallery/GalleryFiltersSavedViews';
import GalleryFiltersActiveChips, {
  useGalleryActiveFilterChips,
} from '@/components/gallery/GalleryFiltersActiveChips';

export type GalleryFiltersBarProps = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  tools: string[];
  models: string[];
  castIds?: string[];
  hasPlayChecks?: boolean;
  userTags?: string[];
  customGroups?: string[];
  onRenameCustomGroup?: (from: string, to: string) => void;
  onDeleteCustomGroup?: (name: string) => void;
  projects: PromptProject[];
  projectFilterId: string;
  setProjectFilterId: (value: string) => void;
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
  onStartSlideshow?: () => void;
  onStartFullscreenSlideshow?: () => void;
  slideshowAvailable?: boolean;
  lean?: boolean;
};

export default function GalleryFiltersBar(props: GalleryFiltersBarProps) {
  const {
    filter,
    setFilter,
    tools,
    models,
    castIds,
    hasPlayChecks,
    userTags = [],
    customGroups = [],
    onRenameCustomGroup,
    onDeleteCustomGroup,
    projects,
    projectFilterId,
    setProjectFilterId,
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
    onStartSlideshow,
    onStartFullscreenSlideshow,
    slideshowAvailable,
    lean = false,
  } = props;

  const savedViewsState = useGallerySavedViewsState();
  // The bar's height while it sticks (desk), so the day headings pin just under it.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = barRef.current;
    if (!node) return;
    const root = document.documentElement;
    const desk = window.matchMedia('(min-width: 768px)');
    const update = () =>
      root.style.setProperty(
        '--gallery-bar-height',
        desk.matches ? `${node.offsetHeight}px` : '0px'
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    desk.addEventListener('change', update);
    return () => {
      observer.disconnect();
      desk.removeEventListener('change', update);
      root.style.removeProperty('--gallery-bar-height');
    };
  }, []);
  const activeChips = useGalleryActiveFilterChips({
    filter,
    projectFilterId,
    projects,
    sort,
    setFilter,
    setProjectFilterId,
    setSort,
  });

  return (
    // No wrapper: a sticky bar only sticks inside its parent, and a wrapper ending after Filters
    // let it scroll away with them.
    <>
      {/* The bar stays in reach while you scroll (desk); the rest folds into Filters. */}
      <div
        ref={barRef}
        className="ui-sticky-surface space-y-2 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-3 md:sticky md:top-[calc(var(--header-offset,0px)+0.25rem)] md:z-20"
        data-testid="gallery-filter-bar"
      >
        <GalleryFiltersPrimaryRow
          filter={filter}
          setFilter={setFilter}
          models={models}
          castIds={castIds}
          hasPlayChecks={hasPlayChecks}
          customGroups={customGroups}
          onRenameCustomGroup={onRenameCustomGroup}
          onDeleteCustomGroup={onDeleteCustomGroup}
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
          totalEntries={totalEntries}
          currentPage={currentPage}
          totalPages={totalPages}
          showPagination={showPagination}
          lean={lean}
        />
        <GalleryFiltersActiveChips
          chips={activeChips}
          setFilter={setFilter}
          setProjectFilterId={setProjectFilterId}
          setSort={setSort}
        />
      </div>

      <GalleryFiltersAdvancedPanel
        lean={lean}
        moreRow={
          <GalleryFiltersMoreRow
            filter={filter}
            setFilter={setFilter}
            models={models}
            customGroups={customGroups}
            onRenameCustomGroup={onRenameCustomGroup}
            onDeleteCustomGroup={onDeleteCustomGroup}
            pageSize={pageSize}
            setPageSize={setPageSize}
            paginationEnabled={paginationEnabled}
            embeddingSearchActive={embeddingSearchActive}
            embeddingSearchLoading={embeddingSearchLoading}
            embeddingSearchUnavailable={embeddingSearchUnavailable}
            lean={lean}
          />
        }
        savedViews={
          savedViewsState.savedViews.length > 0 || !lean ? (
            <GalleryFiltersSavedViews
              savedViews={savedViewsState.savedViews}
              viewNameDraft={savedViewsState.viewNameDraft}
              setViewNameDraft={savedViewsState.setViewNameDraft}
              onSaveView={() =>
                savedViewsState.saveCurrentView({
                  filter,
                  sort,
                  projectFilterId,
                  layout,
                  pageSize,
                  density,
                })
              }
              onApplyView={view => {
                setFilter(view.filter);
                if (view.sort) setSort(view.sort);
                if (view.projectFilterId !== undefined) setProjectFilterId(view.projectFilterId);
                if (view.layout) setLayout(view.layout);
                if (view.pageSize) setPageSize(view.pageSize);
                if (view.density) setDensity(view.density);
              }}
              onDeleteView={savedViewsState.deleteView}
              lean={lean}
            />
          ) : null
        }
        filter={filter}
        setFilter={setFilter}
        tools={tools}
        models={models}
        userTags={userTags}
        projects={projects}
        projectFilterId={projectFilterId}
        setProjectFilterId={setProjectFilterId}
        pageSize={pageSize}
        setPageSize={setPageSize}
        paginationEnabled={paginationEnabled}
        embeddingSearchActive={embeddingSearchActive}
        embeddingSearchUnavailable={embeddingSearchUnavailable}
        onStartSlideshow={onStartSlideshow}
        onStartFullscreenSlideshow={onStartFullscreenSlideshow}
        slideshowAvailable={slideshowAvailable}
      />
    </>
  );
}
