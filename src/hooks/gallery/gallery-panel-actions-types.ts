import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { GalleryExperimentPanelProps } from '@/components/gallery/GalleryExperimentPanel';
import type { ComfyGalleryEntry, ComfyGalleryFilter } from '@/lib/gallery/comfyui-gallery';
import type { ParamExperimentAxis } from '@/lib/param-experiment-queue';
import type { GalleryHandoffPayload } from '@/lib/gallery/handoff';

export type GalleryBulkExperimentHandlers = Omit<
  GalleryExperimentPanelProps,
  | 'selectedCount'
  | 'selectedEntries'
  | 'projects'
  | 'paramAxis'
  | 'setParamAxis'
  | 'similarSearchActive'
  | 'lean'
  | 'footer'
  | 'onClearSelection'
  | 'onCompare'
>;

export type UseGalleryPanelActionsInput = {
  entriesRef: MutableRefObject<ComfyGalleryEntry[]>;
  toggleSelected: (id: string, options?: { shift?: boolean }) => void;
  removeEntry: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setRequeueStatus: (status: string | null) => void;
  setDownloadError: (message: string | null) => void;
  setFilter: Dispatch<SetStateAction<ComfyGalleryFilter>>;
  setWorkflowEntry: (entry: ComfyGalleryEntry | null) => void;
  openLightboxForEntryId: (entryId: string, imageIndex: number) => void;
  prefetchLightboxForEntryId: (entryId: string, imageIndex: number) => void;
  handleReviewRating: (
    entry: ComfyGalleryEntry,
    rating: NonNullable<ComfyGalleryEntry['reviewRating']>
  ) => void;
  pickFor: GalleryHandoffPayload['target'] | null;
  router: ReturnType<typeof import('next/navigation').useRouter>;
  selectedIds: string[];
  selectedEntries: ComfyGalleryEntry[];
  setSelectedIds: (ids: string[]) => void;
  setProjectIds: (ids: string[], projectId?: string) => void;
  removeEntries: (ids: string[]) => void;
  setFavorites: (ids: string[], favorite: boolean) => void;
  setReviewRatings: (ids: string[], rating: ComfyGalleryEntry['reviewRating']) => void;
  setUserTags?: (ids: string[], tags: string[], mode?: 'add' | 'replace' | 'remove') => void;
  setCustomGroups?: (ids: string[], groupName: string | undefined) => void;
  renameCustomGroup?: (from: string, to: string) => number;
  deleteCustomGroup?: (name: string) => number;
  customGroups?: string[];
  paramAxis: ParamExperimentAxis;
  filter: ComfyGalleryFilter;
  setLoraExportScope: (scope: 'favorites' | 'selected') => void;
  setLoraExportOpen: (open: boolean) => void;
};
