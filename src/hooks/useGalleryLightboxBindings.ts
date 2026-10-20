'use client';

import { useCallback, useMemo } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ImageLightboxSlideChrome } from '@/components/ui/ImageLightbox';
import { buildGalleryLightboxSlideChrome } from '@/components/gallery/buildGalleryLightboxSlideChrome';
import { downloadGalleryImage } from '@/lib/gallery/comfyui-gallery-export';
import {
  resolveGalleryLightboxEntry,
  type ComfyGalleryEntry,
  type ComfyGalleryFilter,
} from '@/lib/gallery/comfyui-gallery';
import type { ImageLightboxState } from '@/components/ui/image-lightbox/types';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

export type UseGalleryLightboxBindingsOptions = {
  resolvedLightbox: ImageLightboxState | null;
  lightboxEntries: ComfyGalleryEntry[];
  lightboxEntriesRef: MutableRefObject<ComfyGalleryEntry[]>;
  entries: ComfyGalleryEntry[];
  entryIdsWithDerivatives: Set<string>;
  selectedIdSet: Set<string>;
  selectedIds: string[];
  router: AppRouterInstance;
  handleReviewRating: (entry: ComfyGalleryEntry, rating: 1 | 2 | 3 | 4 | 5) => void;
  toggleFavorite: (entryId: string) => void;
  toggleSelected: (entryId: string) => void;
  removeEntry: (entryId: string) => void;
  setRequeueStatus: Dispatch<SetStateAction<string | null>>;
  setCompareOpen: Dispatch<SetStateAction<boolean>>;
  setFilter: Dispatch<SetStateAction<ComfyGalleryFilter>>;
  applyPlaylistState: (index: number, extras?: { playing?: boolean; fullscreen?: boolean }) => void;
};

export type UseGalleryLightboxBindingsResult = {
  onDownloadImage: (displayIndex: number) => Promise<void>;
  lightboxSlideChrome: ImageLightboxSlideChrome | null;
};

export function useGalleryLightboxBindings({
  resolvedLightbox,
  lightboxEntries,
  lightboxEntriesRef,
  entries,
  entryIdsWithDerivatives,
  selectedIdSet,
  selectedIds,
  router,
  handleReviewRating,
  toggleFavorite,
  toggleSelected,
  removeEntry,
  setRequeueStatus,
  setCompareOpen,
  setFilter,
  applyPlaylistState,
}: UseGalleryLightboxBindingsOptions): UseGalleryLightboxBindingsResult {
  const onDownloadImage = useCallback(
    async (displayIndex: number) => {
      const resolved = resolveGalleryLightboxEntry(lightboxEntriesRef.current, displayIndex);
      if (!resolved) {
        return;
      }
      await downloadGalleryImage(resolved.entry, resolved.imageIndex);
    },
    [lightboxEntriesRef]
  );

  const lightboxSlideChrome = useMemo<ImageLightboxSlideChrome | null>(
    () =>
      buildGalleryLightboxSlideChrome({
        resolvedLightbox,
        lightboxEntries,
        entries,
        entryIdsWithDerivatives,
        selectedIdSet,
        selectedIds,
        router,
        handleReviewRating,
        toggleFavorite,
        toggleSelected,
        removeEntry,
        setRequeueStatus,
        setCompareOpen,
        setFilter,
        applyPlaylistState,
      }),
    [
      applyPlaylistState,
      entries,
      entryIdsWithDerivatives,
      handleReviewRating,
      lightboxEntries,
      removeEntry,
      resolvedLightbox,
      router,
      selectedIdSet,
      selectedIds,
      setCompareOpen,
      setFilter,
      setRequeueStatus,
      toggleFavorite,
      toggleSelected,
    ]
  );

  return {
    onDownloadImage,
    lightboxSlideChrome,
  };
}
