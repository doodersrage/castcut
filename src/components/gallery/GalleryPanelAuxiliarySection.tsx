'use client';

import type { Dispatch, SetStateAction } from 'react';
import GalleryDuplicateClustersPanel from '@/components/gallery/GalleryDuplicateClustersPanel';
import GalleryVisionInbox from '@/components/gallery/GalleryVisionInbox';
import type { ComfyGalleryEntry, ComfyGalleryFilter } from '@/lib/gallery/comfyui-gallery';
import { galleryEntryPrimaryViewUrl } from '@/lib/gallery/comfyui-gallery';
import type { GalleryDuplicateCluster } from '@/lib/gallery/duplicate-clusters';
import { duplicateDropIds } from '@/lib/gallery/duplicate-clusters';
import { confirmAction } from '@/components/ui/ConfirmDialog';

type GalleryPanelAuxiliarySectionProps = {
  showFilters: boolean;
  filter: ComfyGalleryFilter;
  duplicateClusters: GalleryDuplicateCluster[];
  duplicateEntriesById: Map<string, ComfyGalleryEntry> | undefined;
  setSelectedIds: (ids: string[]) => void;
  setFilter: (
    patch: Partial<ComfyGalleryFilter> | ((previous: ComfyGalleryFilter) => ComfyGalleryFilter)
  ) => void;
  removeEntries: (ids: string[]) => void;
  setCompareOpen: (open: boolean) => void;
  showVisionInbox: boolean;
  visionInboxQueue: ComfyGalleryEntry[];
  setReviewRating: (entryId: string, rating: 1 | 2 | 3 | 4 | 5) => void;
  setVisionInboxSkipIds: Dispatch<SetStateAction<Set<string>>>;
  setVisionInboxOpen: (open: boolean) => void;
};

export default function GalleryPanelAuxiliarySection({
  showFilters,
  filter,
  duplicateClusters,
  duplicateEntriesById,
  setSelectedIds,
  setFilter,
  removeEntries,
  setCompareOpen,
  showVisionInbox,
  visionInboxQueue,
  setReviewRating,
  setVisionInboxSkipIds,
  setVisionInboxOpen,
}: GalleryPanelAuxiliarySectionProps) {
  return (
    <>
      {showFilters && filter.duplicatesOnly && duplicateClusters.length > 0 ? (
        <GalleryDuplicateClustersPanel
          clusters={duplicateClusters}
          entriesById={duplicateEntriesById ?? new Map()}
          onShowCluster={ids => {
            setSelectedIds(ids);
            setFilter(previous => ({ ...previous, duplicatesOnly: true }));
          }}
          onKeepHighest={async cluster => {
            if (cluster.dropIds.length === 0) {
              return;
            }
            if (
              await confirmAction({
                title: `Delete ${cluster.dropIds.length} duplicate stills?`,
                body: 'The highest-rated still in the group stays.',
                confirmLabel: 'Delete',
                tone: 'danger',
              })
            ) {
              removeEntries(cluster.dropIds);
            }
          }}
          onKeepAllHighest={async () => {
            const dropIds = duplicateDropIds(duplicateClusters);
            if (dropIds.length === 0) {
              return;
            }
            if (
              await confirmAction({
                title: `Delete ${dropIds.length} duplicate stills?`,
                body: 'The highest-rated still in each group stays.',
                confirmLabel: 'Delete',
                tone: 'danger',
              })
            ) {
              removeEntries(dropIds);
            }
          }}
          onCompare={ids => {
            setSelectedIds(ids);
            setCompareOpen(true);
          }}
        />
      ) : null}

      {showVisionInbox ? (
        <GalleryVisionInbox
          queue={visionInboxQueue}
          previewUrl={galleryEntryPrimaryViewUrl}
          onApplyRating={(entryId, rating) => {
            setReviewRating(entryId, rating);
            setVisionInboxSkipIds(previous => new Set(previous).add(entryId));
          }}
          onSkip={() => {
            const next = visionInboxQueue[0];
            if (next) {
              setVisionInboxSkipIds(previous => new Set(previous).add(next.id));
            }
          }}
          onClose={() => {
            setVisionInboxOpen(false);
            setFilter(previous => ({ ...previous, needsVisionReview: undefined }));
          }}
        />
      ) : null}
    </>
  );
}
