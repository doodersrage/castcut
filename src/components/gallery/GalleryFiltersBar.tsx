'use client';

import type { PromptProject } from '@/lib/prompt-projects';
import type {
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
} from '@/lib/comfyui-gallery';
import type { GalleryDensity } from '@/lib/gallery-density';
import { GalleryFiltersAdvancedPanel } from '@/components/gallery/GalleryFiltersAdvancedPanel';
import GalleryFiltersPrimaryRow from '@/components/gallery/GalleryFiltersPrimaryRow';
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
    <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-[inset_0_1px_0_rgb(255_255_255_/0.03)]">
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

      {savedViewsState.savedViews.length > 0 || !lean ? (
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
      ) : null}

      <GalleryFiltersActiveChips
        chips={activeChips}
        setFilter={setFilter}
        setProjectFilterId={setProjectFilterId}
        setSort={setSort}
      />

      {!lean ? (
        <GalleryFiltersAdvancedPanel
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
      ) : null}
    </div>
  );
}
