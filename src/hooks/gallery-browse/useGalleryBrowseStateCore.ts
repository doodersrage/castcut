'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { applyGalleryUrlState, parseGalleryUrlState } from '@/lib/gallery/url-state';
import {
  galleryBrowseScope,
  galleryUrlHasBrowseState,
  loadGallerySessionState,
  patchGallerySessionPage,
  readInitialGalleryPage,
  saveGallerySessionState,
} from '@/lib/gallery/session-state';
import { EXPERIMENT_WINNERS_UPDATED_EVENT, loadExperimentWinners } from '@/lib/experiment-winners';
import { loadGalleryDensity, saveGalleryDensity, type GalleryDensity } from '@/lib/gallery/density';
import { loadActiveProjectId } from '@/lib/prompt-projects';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  loadGalleryViewPreferences,
  saveGalleryViewPreferences,
  type ComfyGalleryFilter,
  type ComfyGallerySort,
  type GalleryLayoutMode,
  type GalleryPageSize,
} from '@/lib/gallery/comfyui-gallery';
import type { GalleryBrowsePageClampContext } from '@/hooks/gallery-browse/useGalleryBrowsePageClamp';

export type UseGalleryBrowseStateOptions = {
  browsePaginationEnabled: boolean;
  pathname: string;
  showFilters: boolean;
  filter: ComfyGalleryFilter;
  setFilter: Dispatch<SetStateAction<ComfyGalleryFilter>>;
  paginationEnabled: boolean;
  storeReady: boolean;
  galleryEntriesSettled: boolean;
};

export type UseGalleryBrowseStateResult = {
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  sort: ComfyGallerySort;
  setSort: Dispatch<SetStateAction<ComfyGallerySort>>;
  pageSize: GalleryPageSize;
  setPageSize: Dispatch<SetStateAction<GalleryPageSize>>;
  layout: GalleryLayoutMode;
  setLayout: Dispatch<SetStateAction<GalleryLayoutMode>>;
  density: GalleryDensity;
  setDensity: Dispatch<SetStateAction<GalleryDensity>>;
  viewPrefsLoaded: boolean;
  galleryUrlReady: boolean;
  galleryBrowseHydrated: boolean;
  projectFilterId: string;
  setProjectFilterId: Dispatch<SetStateAction<string>>;
  experimentWinners: ReturnType<typeof loadExperimentWinners>;
  setExperimentWinners: Dispatch<SetStateAction<ReturnType<typeof loadExperimentWinners>>>;
  clearGalleryFilters: () => void;
  pageClamp: GalleryBrowsePageClampContext;
};

export function useGalleryBrowseStateCore({
  browsePaginationEnabled,
  pathname,
  showFilters,
  filter,
  setFilter,
  paginationEnabled,
  storeReady,
  galleryEntriesSettled,
}: UseGalleryBrowseStateOptions): UseGalleryBrowseStateResult {
  const [page, setPage] = useState(() =>
    browsePaginationEnabled ? readInitialGalleryPage(window.location.pathname) : 1
  );
  const [sort, setSort] = useState<ComfyGallerySort>('queued-desc');
  const [pageSize, setPageSize] = useState<GalleryPageSize>(12);
  const [layout, setLayout] = useState<GalleryLayoutMode>('grid');
  const [viewPrefsLoaded, setViewPrefsLoaded] = useState(false);
  const [projectFilterId, setProjectFilterId] = useState<string>('');
  const [density, setDensity] = useState<GalleryDensity>('comfortable');
  const [galleryUrlReady, setGalleryUrlReady] = useState(false);
  const [galleryBrowseHydrated, setGalleryBrowseHydrated] = useState(false);
  const [experimentWinners, setExperimentWinners] = useState(loadExperimentWinners);

  const galleryBrowseBaselineRef = useRef<string | null>(null);
  const pendingRestorePageRef = useRef<number | null>(null);
  const galleryBrowsePathRef = useRef<string | null>(
    browsePaginationEnabled ? galleryBrowseScope(pathname) : null
  );
  const galleryBrowseSaveRef = useRef<{
    filter: ComfyGalleryFilter;
    sort: ComfyGallerySort;
    projectFilterId: string;
    page: number;
  }>({
    filter: { status: 'all' },
    sort: 'queued-desc',
    projectFilterId: '',
    page: 1,
  });
  const galleryBrowseRestoringRef = useRef(false);

  useLayoutEffect(() => {
    if (!browsePaginationEnabled) {
      return;
    }
    const initial = readInitialGalleryPage(window.location.pathname);
    if (initial > 1) {
      pendingRestorePageRef.current = initial;
      galleryBrowseRestoringRef.current = true;
    }
  }, [browsePaginationEnabled]);

  const resolvedProjectFilterId = useMemo(() => {
    if (projectFilterId === 'active') {
      return loadActiveProjectId();
    }
    return projectFilterId || undefined;
  }, [projectFilterId]);

  const clearGalleryFilters = useCallback(() => {
    setFilter({ status: 'all' });
    setProjectFilterId('');
    setSort('queued-desc');
    setPage(1);
  }, [setFilter]);

  useEffect(() => {
    setFilter(previous => ({
      ...previous,
      projectId: resolvedProjectFilterId,
    }));
  }, [resolvedProjectFilterId, setFilter]);

  useEffect(() => {
    if (!browsePaginationEnabled) {
      return;
    }
    const scope = galleryBrowseScope(pathname);
    if (scope === '/gallery' || scope === '/m/gallery') {
      galleryBrowsePathRef.current = scope;
    }
  }, [pathname, browsePaginationEnabled]);

  useEffect(() => {
    galleryBrowseSaveRef.current = { filter, sort, projectFilterId, page };
  }, [filter, sort, projectFilterId, page]);

  useEffect(() => {
    if (!browsePaginationEnabled || typeof window === 'undefined') {
      return;
    }
    patchGallerySessionPage(galleryBrowseScope(pathname), page);
  }, [page, browsePaginationEnabled, pathname]);

  useEffect(() => {
    if (!browsePaginationEnabled) {
      return;
    }
    return () => {
      const scope = galleryBrowsePathRef.current;
      if (!scope) {
        return;
      }
      saveGallerySessionState(scope, galleryBrowseSaveRef.current);
    };
  }, [browsePaginationEnabled]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const preferences = loadGalleryViewPreferences();
      setSort(preferences.sort);
      setPageSize(preferences.pageSize);
      setLayout(preferences.layout);
      setDensity(loadGalleryDensity());
      setExperimentWinners(loadExperimentWinners());
      setViewPrefsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!viewPrefsLoaded || typeof window === 'undefined') {
      return;
    }
    scheduleAfterCommit(() => {
      const params = new URLSearchParams(window.location.search);
      const hasUrlBrowse = galleryUrlHasBrowseState(params);
      const cached = loadGallerySessionState(window.location.pathname);
      const urlParsed = parseGalleryUrlState(params);
      if (hasUrlBrowse) {
        const hasFilter = Object.keys(urlParsed.filter).length > 0;
        if (hasFilter) {
          setFilter(previous => ({
            ...previous,
            ...urlParsed.filter,
            ...(urlParsed.filter.query?.trim() ? { semanticSearch: true } : {}),
          }));
        }
        if (urlParsed.sort) {
          setSort(urlParsed.sort);
        }
        if (urlParsed.projectFilterId !== undefined) {
          setProjectFilterId(urlParsed.projectFilterId);
        }
      } else if (cached) {
        const cachedFilter = cached.filter ?? {};
        if (Object.keys(cachedFilter).length > 0) {
          setFilter(previous => ({
            ...previous,
            ...cachedFilter,
            status: cachedFilter.status ?? previous.status ?? 'all',
            ...(cachedFilter.query?.trim() ? { semanticSearch: true } : {}),
          }));
        }
        if (cached.sort) {
          setSort(cached.sort);
        }
        if (cached.projectFilterId !== undefined) {
          setProjectFilterId(cached.projectFilterId);
        }
      }
      const prefs = loadGalleryViewPreferences();
      const restoredPage =
        urlParsed.page ?? cached?.page ?? (prefs.page && prefs.page >= 1 ? prefs.page : undefined);
      if (restoredPage) {
        pendingRestorePageRef.current = restoredPage;
        setPage(restoredPage);
      }
      setGalleryUrlReady(true);
    });
  }, [viewPrefsLoaded, setFilter]);

  useEffect(() => {
    if (!galleryUrlReady || !showFilters || typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    applyGalleryUrlState(url.searchParams, { filter, sort, projectFilterId, page });
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(null, '', next);
    }
  }, [filter, sort, projectFilterId, page, galleryUrlReady, showFilters]);

  useEffect(() => {
    if (
      !galleryUrlReady ||
      !paginationEnabled ||
      typeof window === 'undefined' ||
      !galleryBrowseHydrated
    ) {
      return;
    }
    saveGallerySessionState(window.location.pathname, {
      filter,
      sort,
      projectFilterId,
      page,
    });
  }, [
    filter,
    sort,
    projectFilterId,
    page,
    galleryUrlReady,
    paginationEnabled,
    galleryBrowseHydrated,
  ]);

  useEffect(() => {
    const onWinners = () => setExperimentWinners(loadExperimentWinners());
    window.addEventListener(EXPERIMENT_WINNERS_UPDATED_EVENT, onWinners);
    return () => window.removeEventListener(EXPERIMENT_WINNERS_UPDATED_EVENT, onWinners);
  }, []);

  useEffect(() => {
    if (!viewPrefsLoaded || !paginationEnabled) {
      return;
    }
    saveGalleryViewPreferences({
      ...loadGalleryViewPreferences(),
      sort,
      pageSize,
      layout,
      page: galleryBrowseHydrated ? page : undefined,
    });
    saveGalleryDensity(density);
  }, [
    sort,
    pageSize,
    layout,
    density,
    page,
    viewPrefsLoaded,
    paginationEnabled,
    galleryBrowseHydrated,
  ]);

  useEffect(() => {
    if (!galleryUrlReady || !paginationEnabled || !galleryBrowseHydrated) {
      return;
    }
    if (galleryBrowseRestoringRef.current) {
      return;
    }
    const { projectId: _projectId, ...filterWithoutProject } = filter;
    const sig = JSON.stringify({
      filter: filterWithoutProject,
      sort,
      pageSize,
      projectFilterId,
    });
    if (galleryBrowseBaselineRef.current === null) {
      galleryBrowseBaselineRef.current = sig;
      return;
    }
    if (galleryBrowseBaselineRef.current !== sig) {
      galleryBrowseBaselineRef.current = sig;
      setPage(1);
    }
  }, [
    filter,
    sort,
    pageSize,
    projectFilterId,
    galleryUrlReady,
    paginationEnabled,
    galleryBrowseHydrated,
  ]);

  const pageClamp = useMemo(
    (): GalleryBrowsePageClampContext => ({
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
    }),
    [
      galleryUrlReady,
      galleryBrowseHydrated,
      page,
      filter,
      sort,
      pageSize,
      projectFilterId,
      paginationEnabled,
      storeReady,
      galleryEntriesSettled,
    ]
  );

  return {
    page,
    setPage,
    sort,
    setSort,
    pageSize,
    setPageSize,
    layout,
    setLayout,
    density,
    setDensity,
    viewPrefsLoaded,
    galleryUrlReady,
    galleryBrowseHydrated,
    projectFilterId,
    setProjectFilterId,
    experimentWinners,
    setExperimentWinners,
    clearGalleryFilters,
    pageClamp,
  };
}
