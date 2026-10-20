import type { ComfyGalleryFilter, ComfyGallerySort } from './comfyui-gallery';
import { loadGalleryViewPreferences } from './comfyui-gallery';
import { parseGalleryUrlState } from './url-state';

export type GallerySessionState = {
  filter?: Partial<ComfyGalleryFilter>;
  sort?: ComfyGallerySort;
  projectFilterId?: string;
  page?: number;
};

const SESSION_KEY = 'comfy-gallery-session-v1';

/** Query keys that represent an intentional gallery browse view (not lightbox/pick/upload). */
const GALLERY_BROWSE_PARAM_KEYS = [
  'q',
  'focus',
  'review',
  'unreviewed',
  'status',
  'tool',
  'model',
  'minRating',
  'fav',
  'atRisk',
  'media',
  'semantic',
  'similar',
  'similarMode',
  'visionTags',
  'duplicates',
  'visionInbox',
  'userTag',
  'group',
  'derivedKind',
  'character',
  'sort',
  'project',
  'page',
] as const;

export function galleryBrowseScope(pathname: string): string {
  const path = pathname.split('?')[0] || '/gallery';
  if (path === '/gallery' || path.startsWith('/gallery/')) {
    return '/gallery';
  }
  if (path === '/m/gallery' || path.startsWith('/m/gallery/')) {
    return '/m/gallery';
  }
  return path;
}

export function galleryUrlHasBrowseState(params: URLSearchParams): boolean {
  for (const key of GALLERY_BROWSE_PARAM_KEYS) {
    if (params.has(key)) {
      return true;
    }
  }
  return false;
}

function readSessionStore(): Record<string, GallerySessionState> {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, GallerySessionState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSessionStore(store: Record<string, GallerySessionState>): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    // Quota or private mode — browse state restore is optional.
  }
}

export function loadGallerySessionState(scope: string): GallerySessionState | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const entry = readSessionStore()[galleryBrowseScope(scope)];
  if (!entry) {
    return null;
  }
  const page =
    typeof entry.page === 'number' && Number.isFinite(entry.page) && entry.page >= 1
      ? Math.floor(entry.page)
      : undefined;
  return {
    filter: entry.filter ?? {},
    sort: entry.sort,
    projectFilterId: entry.projectFilterId,
    page,
  };
}

export function saveGallerySessionState(scope: string, state: GallerySessionState): void {
  if (typeof window === 'undefined') {
    return;
  }
  const key = galleryBrowseScope(scope);
  const next = readSessionStore();
  const page =
    typeof state.page === 'number' && Number.isFinite(state.page) && state.page >= 1
      ? Math.floor(state.page)
      : undefined;
  next[key] = {
    filter: state.filter ?? {},
    sort: state.sort,
    projectFilterId: state.projectFilterId,
    page,
  };
  writeSessionStore(next);
}

/** Merge just the page index — used while full browse hydration is still in flight. */
export function patchGallerySessionPage(scope: string, page: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!Number.isFinite(page) || page < 1) {
    return;
  }
  const key = galleryBrowseScope(scope);
  const next = readSessionStore();
  const existing = next[key] ?? {};
  next[key] = {
    ...existing,
    filter: existing.filter ?? {},
    page: Math.floor(page),
  };
  writeSessionStore(next);
}

/** Resolve initial gallery page: URL param, then local browse cache, else 1. */
export function readInitialGalleryPage(scope: string): number {
  if (typeof window === 'undefined') {
    return 1;
  }
  const search = typeof window.location?.search === 'string' ? window.location.search : '';
  const urlPage = parseGalleryUrlState(new URLSearchParams(search)).page;
  if (urlPage) {
    return urlPage;
  }
  const cachedPage = loadGallerySessionState(scope)?.page;
  if (cachedPage && cachedPage >= 1) {
    return cachedPage;
  }
  const prefsPage = loadGalleryViewPreferences().page;
  if (prefsPage && prefsPage >= 1) {
    return prefsPage;
  }
  return 1;
}

/** Nav/sidebar href that restores the last gallery page when returning from another tool. */
export function galleryNavHref(scope = '/gallery'): string {
  const path = galleryBrowseScope(scope);
  const page = readInitialGalleryPage(scope);
  return page > 1 ? `${path}?page=${page}` : path;
}

/** Keep specialized gallery links; expand bare /gallery with the cached page. */
export function resolveAppNavLinkHref(href: string): string {
  const [path, query] = href.split('?');
  const normalized = path || '/gallery';
  if (normalized !== '/gallery' && normalized !== '/m/gallery') {
    return href;
  }
  if (query) {
    return href;
  }
  return galleryNavHref(normalized);
}

export function clearGallerySessionState(scope?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!scope) {
    writeSessionStore({});
    return;
  }
  const key = galleryBrowseScope(scope);
  const next = readSessionStore();
  delete next[key];
  writeSessionStore(next);
}
