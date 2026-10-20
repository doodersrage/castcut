'use client';

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryPageSize,
} from '@/lib/gallery/comfyui-gallery';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

export type GalleryBrowsePageClampContext = {
  pendingRestorePageRef: MutableRefObject<number | null>;
  galleryBrowseRestoringRef: MutableRefObject<boolean>;
  galleryBrowseBaselineRef: MutableRefObject<string | null>;
  galleryUrlReady: boolean;
  galleryBrowseHydrated: boolean;
  setGalleryBrowseHydrated: Dispatch<SetStateAction<boolean>>;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  filter: ComfyGalleryFilter;
  sort: ComfyGallerySort;
  pageSize: GalleryPageSize;
  projectFilterId: string;
  paginationEnabled: boolean;
  storeReady: boolean;
  galleryEntriesSettled: boolean;
};

export function useGalleryBrowsePageClamp(
  context: GalleryBrowsePageClampContext,
  totalPages: number,
  sortedSourceLength: number
): void {
  const {
    pendingRestorePageRef,
    galleryBrowseRestoringRef,
    galleryBrowseBaselineRef,
    galleryUrlReady,
    galleryBrowseHydrated,
    setGalleryBrowseHydrated,
    page,
    setPage,
    filter,
    sort,
    pageSize,
    projectFilterId,
    paginationEnabled,
    storeReady,
    galleryEntriesSettled,
  } = context;

  useEffect(() => {
    if (
      !paginationEnabled ||
      !galleryUrlReady ||
      !storeReady ||
      !galleryEntriesSettled ||
      galleryBrowseHydrated
    ) {
      return;
    }
    const pending = pendingRestorePageRef.current;
    if (pending !== null && totalPages > 0) {
      if (pending <= totalPages) {
        pendingRestorePageRef.current = null;
        if (page !== pending) {
          setPage(pending);
        }
      } else if (sortedSourceLength > 0) {
        pendingRestorePageRef.current = null;
        setPage(totalPages);
      }
    } else if (pending === null && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
    scheduleAfterCommit(() => {
      galleryBrowseRestoringRef.current = false;
      setGalleryBrowseHydrated(true);
      const { projectId: _projectId, ...filterWithoutProject } = filter;
      galleryBrowseBaselineRef.current = JSON.stringify({
        filter: filterWithoutProject,
        sort,
        pageSize,
        projectFilterId,
      });
    });
  }, [
    filter,
    sort,
    pageSize,
    projectFilterId,
    page,
    totalPages,
    sortedSourceLength,
    galleryUrlReady,
    paginationEnabled,
    storeReady,
    galleryEntriesSettled,
    galleryBrowseHydrated,
    pendingRestorePageRef,
    galleryBrowseRestoringRef,
    galleryBrowseBaselineRef,
    setGalleryBrowseHydrated,
    setPage,
  ]);
}
