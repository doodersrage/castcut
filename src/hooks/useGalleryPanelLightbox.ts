'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import { buildLightboxStateFromPlaylist } from '@/lib/gallery-lightbox-state';
import {
  buildGalleryLightboxPlaylist,
  galleryEntryLightboxUrls,
  galleryEntryMediaKinds,
  loadGalleryViewPreferences,
  resolveGalleryLightboxEntry,
  resolveGalleryLightboxOpenIndex,
  saveGalleryViewPreferences,
  GALLERY_PAGE_SIZE_ALL,
  resolveGalleryPageSize,
  type ComfyGalleryEntry,
  type GalleryPageSize,
  type GallerySlideshowIntervalMs,
  type GallerySlideshowTransition,
} from '@/lib/comfyui-gallery';
import { pageForGalleryEntryWithGroups } from '@/lib/gallery-display-rows';
import type { ExperimentGroup } from '@/lib/experiment-groups';
import { prefetchGalleryImageUrl } from '@/lib/gallery-image-prefetch';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

export type UseGalleryPanelLightboxOptions = {
  sortedSource: ComfyGalleryEntry[];
  storeReady: boolean;
  entries: ComfyGalleryEntry[];
  searchParams: ReadonlyURLSearchParams;
  /** When set, keep the gallery page on the lightbox's current entry. */
  pagination?: {
    enabled: boolean;
    page: number;
    pageSize: GalleryPageSize;
    experimentGroups: ExperimentGroup[];
    visibleEntryIds: ReadonlySet<string>;
    setPage: (page: number) => void;
  };
};

export type UseGalleryPanelLightboxResult = {
  lightbox: ImageLightboxState | null;
  setLightbox: Dispatch<SetStateAction<ImageLightboxState | null>>;
  slideshowPlaying: boolean;
  setSlideshowPlaying: Dispatch<SetStateAction<boolean>>;
  slideshowFullscreen: boolean;
  setSlideshowFullscreen: Dispatch<SetStateAction<boolean>>;
  slideshowIntervalMs: GallerySlideshowIntervalMs;
  setSlideshowIntervalMs: Dispatch<SetStateAction<GallerySlideshowIntervalMs>>;
  slideshowTransition: GallerySlideshowTransition;
  setSlideshowTransition: Dispatch<SetStateAction<GallerySlideshowTransition>>;
  lightboxEntries: ComfyGalleryEntry[];
  lightboxEntriesRef: MutableRefObject<ComfyGalleryEntry[]>;
  lightboxPlaylist: ReturnType<typeof buildGalleryLightboxPlaylist>;
  applyPlaylistState: (index: number, extras?: { playing?: boolean; fullscreen?: boolean }) => void;
  resolvedLightbox: ImageLightboxState | null;
  openEntryLightbox: (entry: ComfyGalleryEntry, imageIndex: number) => void;
  openLightboxForEntryId: (entryId: string, imageIndex: number) => void;
  prefetchLightboxForEntryId: (entryId: string, imageIndex: number) => void;
  startSlideshow: () => void;
  startFullscreenSlideshow: () => void;
  closeLightbox: () => void;
};

export function useGalleryPanelLightbox({
  sortedSource,
  storeReady,
  entries,
  searchParams,
  pagination,
}: UseGalleryPanelLightboxOptions): UseGalleryPanelLightboxResult {
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const [slideshowFullscreen, setSlideshowFullscreen] = useState(false);
  const [slideshowIntervalMs, setSlideshowIntervalMs] = useState<GallerySlideshowIntervalMs>(5000);
  const [slideshowTransition, setSlideshowTransition] =
    useState<GallerySlideshowTransition>('slide');
  const [slideshowPrefsLoaded, setSlideshowPrefsLoaded] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const preferences = loadGalleryViewPreferences();
      setSlideshowIntervalMs(preferences.slideshowIntervalMs);
      setSlideshowTransition(preferences.slideshowTransition);
      setSlideshowPrefsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!slideshowPrefsLoaded) {
      return;
    }
    saveGalleryViewPreferences({
      ...loadGalleryViewPreferences(),
      slideshowIntervalMs,
      slideshowTransition,
    });
  }, [slideshowIntervalMs, slideshowTransition, slideshowPrefsLoaded]);

  const lightboxEntries = sortedSource;
  const lightboxEntriesRef = useRef(lightboxEntries);
  const lightboxPlaylist = useMemo(
    () => buildGalleryLightboxPlaylist(lightboxEntries),
    [lightboxEntries]
  );

  useLayoutEffect(() => {
    lightboxEntriesRef.current = lightboxEntries;
  }, [lightboxEntries]);

  const applyPlaylistState = useCallback(
    (index: number, extras?: { playing?: boolean; fullscreen?: boolean }) => {
      const next = buildLightboxStateFromPlaylist(lightboxPlaylist, index);
      if (!next) {
        return;
      }
      setLightbox(next);
      if (extras?.playing != null) {
        setSlideshowPlaying(extras.playing);
      }
      if (extras?.fullscreen != null) {
        setSlideshowFullscreen(extras.fullscreen);
      }
    },
    [lightboxPlaylist]
  );

  const resolvedLightbox = useMemo<ImageLightboxState | null>(() => {
    if (!lightbox) {
      return null;
    }
    return buildLightboxStateFromPlaylist(lightboxPlaylist, lightbox.index);
  }, [lightbox, lightboxPlaylist]);

  useEffect(() => {
    if (!lightbox || lightboxPlaylist.images.length > 0) {
      return;
    }
    scheduleAfterCommit(() => {
      setLightbox(null);
      setSlideshowPlaying(false);
      setSlideshowFullscreen(false);
    });
  }, [lightbox, lightboxPlaylist.images.length]);

  const openEntryLightbox = useCallback(
    (entry: ComfyGalleryEntry, imageIndex: number) => {
      if (lightboxPlaylist.images.length === 0) {
        return;
      }

      const index = resolveGalleryLightboxOpenIndex(
        lightboxEntriesRef.current,
        entry.id,
        imageIndex
      );

      applyPlaylistState(index, { playing: false, fullscreen: false });
    },
    [applyPlaylistState, lightboxPlaylist.images.length]
  );

  const openLightboxForEntryId = useCallback(
    (entryId: string, imageIndex: number) => {
      const entry = lightboxEntriesRef.current.find(item => item.id === entryId);
      if (entry) {
        openEntryLightbox(entry, imageIndex);
      }
    },
    [openEntryLightbox]
  );

  const prefetchLightboxForEntryId = useCallback((entryId: string, imageIndex: number) => {
    const entry = lightboxEntriesRef.current.find(item => item.id === entryId);
    if (!entry) {
      return;
    }
    const urls = galleryEntryLightboxUrls(entry);
    if (urls.length === 0) {
      return;
    }
    const safeIndex = Math.min(Math.max(imageIndex, 0), urls.length - 1);
    if (galleryEntryMediaKinds(entry)[safeIndex] === 'video') {
      return;
    }
    prefetchGalleryImageUrl(urls[safeIndex]);
  }, []);

  const startSlideshow = useCallback(() => {
    if (lightboxPlaylist.images.length === 0) {
      return;
    }
    const startIndex = resolvedLightbox?.index ?? lightbox?.index ?? 0;
    applyPlaylistState(startIndex, { playing: true, fullscreen: false });
  }, [
    applyPlaylistState,
    lightbox?.index,
    lightboxPlaylist.images.length,
    resolvedLightbox?.index,
  ]);

  const startFullscreenSlideshow = useCallback(() => {
    if (lightboxPlaylist.images.length === 0) {
      return;
    }
    const startIndex = resolvedLightbox?.index ?? lightbox?.index ?? 0;
    applyPlaylistState(startIndex, { playing: true, fullscreen: true });
  }, [
    applyPlaylistState,
    lightbox?.index,
    lightboxPlaylist.images.length,
    resolvedLightbox?.index,
  ]);

  const closeLightbox = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    setLightbox(null);
    setSlideshowPlaying(false);
    setSlideshowFullscreen(false);
  }, []);

  const deepLinkOpenedRef = useRef<string | null>(null);
  /** Preserve ?lightbox= across early URL sync clears until the store can open it. */
  const pendingLightboxDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    const id = searchParams.get('lightbox')?.trim();
    if (id) {
      pendingLightboxDeepLinkRef.current = id;
    }
  }, [searchParams]);

  useEffect(() => {
    if (!storeReady || lightboxPlaylist.images.length === 0) {
      return;
    }
    const id = pendingLightboxDeepLinkRef.current ?? searchParams.get('lightbox')?.trim();
    if (!id || deepLinkOpenedRef.current === id) {
      return;
    }
    const entry =
      lightboxEntriesRef.current.find(item => item.id === id) ??
      entries.find(item => item.id === id);
    if (!entry) {
      return;
    }
    deepLinkOpenedRef.current = id;
    openEntryLightbox(entry, 0);
  }, [storeReady, lightboxPlaylist.images.length, searchParams, entries, openEntryLightbox]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    if (!resolvedLightbox) {
      if (!storeReady) {
        return;
      }
      const pending =
        url.searchParams.get('lightbox')?.trim() || pendingLightboxDeepLinkRef.current;
      if (pending && deepLinkOpenedRef.current !== pending) {
        const exists =
          lightboxEntriesRef.current.some(item => item.id === pending) ||
          entries.some(item => item.id === pending);
        if (exists) {
          return;
        }
      }
      if (url.searchParams.has('lightbox')) {
        url.searchParams.delete('lightbox');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
      return;
    }
    const resolved = resolveGalleryLightboxEntry(lightboxEntries, resolvedLightbox.index);
    if (!resolved) {
      return;
    }
    if (url.searchParams.get('lightbox') === resolved.entry.id) {
      return;
    }
    url.searchParams.set('lightbox', resolved.entry.id);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    deepLinkOpenedRef.current = resolved.entry.id;
  }, [resolvedLightbox, lightboxEntries, storeReady, entries]);

  // Keep the underlying gallery page on the lightbox entry so closing / focus scroll lands
  // on a mounted card instead of an off-page ghost.
  useEffect(() => {
    if (!resolvedLightbox || !pagination?.enabled) {
      return;
    }
    if (pagination.pageSize === GALLERY_PAGE_SIZE_ALL) {
      return;
    }
    const resolved = resolveGalleryLightboxEntry(lightboxEntries, resolvedLightbox.index);
    if (!resolved) {
      return;
    }
    if (pagination.visibleEntryIds.has(resolved.entry.id)) {
      return;
    }
    const effectivePageSize = resolveGalleryPageSize(pagination.pageSize, sortedSource.length);
    const targetPage = pageForGalleryEntryWithGroups(
      sortedSource,
      pagination.experimentGroups,
      resolved.entry.id,
      effectivePageSize
    );
    if (targetPage !== pagination.page) {
      pagination.setPage(targetPage);
    }
  }, [resolvedLightbox, lightboxEntries, sortedSource, pagination]);

  return {
    lightbox,
    setLightbox,
    slideshowPlaying,
    setSlideshowPlaying,
    slideshowFullscreen,
    setSlideshowFullscreen,
    slideshowIntervalMs,
    setSlideshowIntervalMs,
    slideshowTransition,
    setSlideshowTransition,
    lightboxEntries,
    lightboxEntriesRef,
    lightboxPlaylist,
    applyPlaylistState,
    resolvedLightbox,
    openEntryLightbox,
    openLightboxForEntryId,
    prefetchLightboxForEntryId,
    startSlideshow,
    startFullscreenSlideshow,
    closeLightbox,
  };
}
