import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import type { GalleryComparePanelProps } from '@/components/GalleryComparePanel';
import type { GalleryBulkExperimentHandlers } from '@/hooks/useGalleryPanelActions';
import type { GalleryHandoffPayload } from '@/lib/gallery-handoff';
import type {
  ComfyGalleryEntry,
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
  GallerySlideshowIntervalMs,
  GallerySlideshowTransition,
} from '@/lib/comfyui-gallery';
import type { ParamExperimentAxis } from '@/lib/param-experiment-queue';
import type { PromptProject } from '@/lib/prompt-projects';
import type { GalleryStats } from '@/lib/gallery-stats';
import type { GalleryDuplicateCluster } from '@/lib/gallery-duplicate-clusters';
import type { ExperimentWinnerRecord } from '@/lib/experiment-winners';
import type { ExperimentGroup } from '@/lib/experiment-groups';
import { buildGalleryLineageGroups } from '@/lib/gallery-lineage-groups';
import type {
  ImageLightboxSlideChrome,
  ImageLightboxState,
} from '@/components/ui/image-lightbox/types';
import type { GalleryCapWarningLevel } from '@/lib/gallery-cap';
import type { GalleryDensity } from '@/lib/gallery-density';

export type GalleryFilterSetter = (
  patch: Partial<ComfyGalleryFilter> | ((previous: ComfyGalleryFilter) => ComfyGalleryFilter)
) => void;

export type GalleryPanelLightboxSlotProps = {
  resolvedLightbox: ImageLightboxState | null;
  closeLightbox: () => void;
  onIndexChange: (index: number) => void;
  onDownloadImage: ((index: number) => Promise<void>) | undefined;
  slideChrome: ImageLightboxSlideChrome | null;
  slideshowPlaying: boolean;
  slideshowIntervalMs: GallerySlideshowIntervalMs;
  slideshowTransition: GallerySlideshowTransition;
  slideshowFullscreen: boolean;
  setSlideshowPlaying: (playing: boolean) => void;
  setSlideshowIntervalMs: (ms: GallerySlideshowIntervalMs) => void;
  setSlideshowTransition: (transition: GallerySlideshowTransition) => void;
  setSlideshowFullscreen: (fullscreen: boolean) => void;
  playlistLength: number;
};

export type GalleryPanelChromeProps = {
  showHeader: boolean;
  showFilters: boolean;
  compact: boolean;
  limit?: number;
  leanGallery: boolean;
  leanBulkEnabled: boolean;
  bulkEnabled: boolean;
  paginationEnabled: boolean;
  pickFor: GalleryHandoffPayload['target'] | null;
};

export type GalleryPanelUploadProps = {
  uploadInputRef: RefObject<HTMLInputElement | null>;
  importDroppedImages: (files: File[]) => Promise<void>;
};

export type GalleryPanelHeaderSlotProps = {
  activeJobs: number;
  entriesLength: number;
  uploadingImages: boolean;
  onRefreshPending: () => void;
  onArchiveThenPurge: () => void;
};

export type GalleryPanelCapProps = {
  galleryCapWarning: { level: GalleryCapWarningLevel; message: string | null };
  capWizardOpen: boolean;
  setCapWizardOpen: (open: boolean) => void;
  capEvictionPreview: ComfyGalleryEntry[];
  exportCapKeepers: () => void;
  archiveThenPurgeRest: () => void;
};

export type GalleryPanelAuxiliaryProps = {
  duplicateClusters: GalleryDuplicateCluster[];
  duplicateEntriesById: Map<string, ComfyGalleryEntry> | undefined;
  showVisionInbox: boolean;
  visionInboxQueue: ComfyGalleryEntry[];
  setReviewRating: (entryId: string, rating: 1 | 2 | 3 | 4 | 5) => void;
  setVisionInboxSkipIds: Dispatch<SetStateAction<Set<string>>>;
  setVisionInboxOpen: (open: boolean) => void;
};

export type GalleryPanelBrowseProps = {
  filter: ComfyGalleryFilter;
  setFilter: GalleryFilterSetter;
  entries: ComfyGalleryEntry[];
  visibleEntries: ComfyGalleryEntry[];
  galleryStats: GalleryStats;
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
  projects: PromptProject[];
  sort: ComfyGallerySort;
  setSort: (sort: ComfyGallerySort) => void;
  pageSize: GalleryPageSize;
  setPageSize: (size: GalleryPageSize) => void;
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
  startSlideshow: () => void;
  startFullscreenSlideshow: () => void;
  retryFailedEntries: (entries: ComfyGalleryEntry[], mode?: 'same' | 'new' | 'exact') => void;
  setPage: (page: number) => void;
  effectivePageSize: number;
  clearGalleryFilters: () => void;
};

export type GalleryPanelSelectionProps = {
  selectedEntries: ComfyGalleryEntry[];
  selectedIds: string[];
  selectAllVisible: () => void;
  clearSelection: () => void;
  openCompare: () => void;
  setSelectedIds: (ids: string[]) => void;
  setCompareOpen: (open: boolean) => void;
};

export type GalleryPanelBulkProps = {
  paramAxis: ParamExperimentAxis;
  setParamAxis: (axis: ParamExperimentAxis) => void;
  similarSearchActive: boolean;
  bulkExperimentHandlers: GalleryBulkExperimentHandlers;
  downloadError: string | null;
  setLoraExportScope: (scope: 'favorites' | 'selected') => void;
  setLoraExportOpen: (open: boolean) => void;
};

export type GalleryPanelModalsProps = {
  compareOpen: boolean;
  compareHandlers: Omit<GalleryComparePanelProps, 'entries' | 'onClose'>;
  resetCompare: () => void;
  openEntryLightbox: (entry: ComfyGalleryEntry, index: number) => void;
  workflowEntry: ComfyGalleryEntry | null;
  setWorkflowEntry: (entry: ComfyGalleryEntry | null) => void;
  loraExportOpen: boolean;
  loraExportScope: 'favorites' | 'selected';
};

export type GalleryPanelGridProps = {
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
  galleryCardGridClass: string;
  galleryVirtualGridClass: string;
  renderGalleryCard: (entry: ComfyGalleryEntry) => ReactNode;
};

export type GalleryPanelReviewProps = {
  reviewFocusEntry: ComfyGalleryEntry | null;
  reviewFocusIndex: number;
  handleReviewRating: (entry: ComfyGalleryEntry, rating: 1 | 2 | 3 | 4 | 5) => void;
  toggleFavorite: (entryId: string) => void;
};

export type GalleryPanelBodyProps = {
  chrome: GalleryPanelChromeProps;
  upload: GalleryPanelUploadProps;
  lightbox: GalleryPanelLightboxSlotProps;
  header: GalleryPanelHeaderSlotProps;
  status: { requeueStatus: string | null };
  cap: GalleryPanelCapProps;
  auxiliary: GalleryPanelAuxiliaryProps;
  browse: GalleryPanelBrowseProps;
  selection: GalleryPanelSelectionProps;
  bulk: GalleryPanelBulkProps;
  modals: GalleryPanelModalsProps;
  grid: GalleryPanelGridProps;
  review: GalleryPanelReviewProps;
  removeEntries: (ids: string[]) => void;
  setFavorites: (entryIds: string[], favorite: boolean) => void;
  setRequeueStatus: (status: string | null) => void;
};
