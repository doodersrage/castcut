'use client';

import { useCallback } from 'react';
import type { GalleryCardActions } from '@/components/gallery/GalleryCardItem';
import GalleryCardItem from '@/components/gallery/GalleryCardItem';
import {
  galleryEntryHeroPreviewUrl,
  galleryEntryPrimaryMediaKind,
  galleryEntryStripThumbUrls,
  type ComfyGalleryEntry,
  type ComfyGalleryFilter,
  type GalleryLayoutMode,
} from '@/lib/gallery/comfyui-gallery';
import { galleryPickActionLabel, type GalleryHandoffPayload } from '@/lib/gallery/handoff';
import { suggestRatingMutations } from '@/lib/prompt/rating-prompt-mutations';
import type { MutableRefObject } from 'react';

export type UseGalleryCardRendererOptions = {
  galleryCardActionsRef: MutableRefObject<GalleryCardActions>;
  compact: boolean;
  layout: GalleryLayoutMode;
  bulkEnabled: boolean;
  pickFor: GalleryHandoffPayload['target'] | null;
  selectedIdSet: Set<string>;
  filter: ComfyGalleryFilter;
  reviewFocusEntry: ComfyGalleryEntry | null | undefined;
  entryIdsWithDerivatives: Set<string>;
  leanGallery: boolean;
};

export function useGalleryCardRenderer({
  galleryCardActionsRef,
  compact,
  layout,
  bulkEnabled,
  pickFor,
  selectedIdSet,
  filter,
  reviewFocusEntry,
  entryIdsWithDerivatives,
  leanGallery,
}: UseGalleryCardRendererOptions) {
  return useCallback(
    (entry: ComfyGalleryEntry) => (
      <GalleryCardItem
        entry={entry}
        actionsRef={galleryCardActionsRef}
        compact={compact || layout === 'dense'}
        layout={layout}
        selectable={bulkEnabled && !pickFor}
        selected={selectedIdSet.has(entry.id)}
        reviewFocus={
          (filter.reviewMode === true && reviewFocusEntry?.id === entry.id) ||
          filter.focusEntryId === entry.id
        }
        previewUrl={galleryEntryHeroPreviewUrl(entry)}
        imageUrls={galleryEntryStripThumbUrls(entry)}
        reviewMode={filter.reviewMode === true && !pickFor}
        reviewMutationHints={
          filter.reviewMode && !pickFor && reviewFocusEntry?.id === entry.id && !entry.reviewRating
            ? suggestRatingMutations(entry, 2).map(item => item.detail)
            : undefined
        }
        hasDerivatives={entryIdsWithDerivatives.has(entry.id)}
        pickMode={Boolean(pickFor)}
        pickable={
          Boolean(pickFor) &&
          entry.status === 'completed' &&
          galleryEntryPrimaryMediaKind(entry) === 'image'
        }
        pickLabel={pickFor ? galleryPickActionLabel(pickFor) : undefined}
        leanActions={leanGallery}
      />
    ),
    [
      bulkEnabled,
      compact,
      entryIdsWithDerivatives,
      filter.focusEntryId,
      filter.reviewMode,
      galleryCardActionsRef,
      layout,
      leanGallery,
      pickFor,
      reviewFocusEntry?.id,
      selectedIdSet,
    ]
  );
}
