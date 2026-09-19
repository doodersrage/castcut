import type { ComfyOutputImage, ComfyOutputMediaKind } from './comfyui-outputs';
import {
  buildComfyViewSrcSet,
  GALLERY_LIGHTBOX_WIDTH,
  GALLERY_LQIP_WIDTH,
  GALLERY_STRIP_THUMB_WIDTH,
  GALLERY_THUMB_SRCSET_WIDTHS,
  GALLERY_THUMB_WIDTH,
  resolveComfyOutputMediaKind,
  isAnimatedImageViewUrl,
  isGalleryMotionOutput,
  isGalleryPassthroughOutput,
  shouldUseHtmlVideoElement,
  stripGalleryViewWidthParam,
} from './comfyui-outputs';
import { buildEngineViewPath } from './engine/view-paths';
import { isCloudEngine } from './engine/capabilities';
import { filterBySemanticQuery } from './semantic-search';
import { orderGalleryBySimilarity, orderGalleryByVisualSimilarity } from './gallery-similarity';
import { clusterGalleryDuplicates, duplicateEntryIds } from './gallery-duplicate-clusters';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import type { ComfyGalleryJobStatus } from './comfyui-gallery-types';
import { durableGalleryOriginalUrl, durableGalleryThumbUrl } from './gallery-media-client';
import {
  getGalleryCache,
  notifyGalleryUpdated,
  persistGalleryCache,
  setGalleryCache,
  clearGalleryDb,
} from './gallery-db-store';
import { COMFYUI_GALLERY_KEY, MAX_GALLERY_ENTRIES } from './comfyui-gallery-storage-meta';
import { readBrowserValue, writeBrowserValue } from './browser-storage';
import { initGalleryStore } from './app-db-init';
import { getActiveUserId } from './user-scope';
import { scheduleUserAnalyticsSync } from './user-analytics-sync';
import { capGalleryEntriesForLocalStorage } from './gallery-cap';
import { loadCharacters } from './character-os';
import { collectGalleryProtectedEntryIds } from './gallery-protected-ids';
import { rememberGalleryDeletedIds } from './gallery-deleted-ids';
import { galleryEntryCorpus } from './embedding-rank';
import {
  galleryEntryMatchesCustomGroup,
  resolveGalleryCustomGroupName,
  uniqueGalleryCustomGroups,
  renameGalleryCustomGroupEntries,
  deleteGalleryCustomGroupEntries,
} from './gallery-custom-groups';
import {
  enforceGalleryWorkflowByteBudget,
  pruneStaleGalleryWorkflowJson,
} from './gallery-workflow-hygiene';
import { loadSettingsCache } from './settings-cache';
import { celebrateSystemTray } from './system-tray-celebrate';

export type { ComfyGalleryEntry } from './comfyui-gallery-entry';
export type { ComfyGalleryJobStatus } from './comfyui-gallery-types';
export {
  COMFYUI_GALLERY_KEY,
  COMFYUI_GALLERY_UPDATED_EVENT,
  MAX_GALLERY_ENTRIES,
} from './comfyui-gallery-storage-meta';
export { initAppDb, initGalleryStore, isAppDbReady, isGalleryStoreReady } from './app-db-init';
export { getGalleryCache, getGalleryEntryById } from './gallery-db-store';

export type ComfyGalleryFilter = {
  status?: ComfyGalleryJobStatus | 'all';
  favoritesOnly?: boolean;
  tool?: string;
  /** Exact model id match. */
  model?: string;
  /** Keep entries with reviewRating >= this (1–5). */
  minRating?: 1 | 2 | 3 | 4 | 5;
  query?: string;
  semanticSearch?: boolean;
  similarToEntryId?: string;
  /** Rank similar by vision tags / aspect / aesthetic instead of prompt text. */
  similarMode?: 'prompt' | 'visual';
  /** Show only outputs derived from this gallery entry. */
  derivativeOfEntryId?: string;
  /** Show only this gallery entry (lineage jump). */
  focusEntryId?: string;
  /** Filter by derivative kind (upscale, refine, variation). */
  derivedKind?: ComfyGalleryEntry['derivedKind'];
  /** Filter by primary media kind (stills, video, audio, or 3D mesh). */
  mediaKind?: 'image' | 'video' | 'audio' | 'mesh' | 'all';
  projectId?: string;
  reviewMode?: boolean;
  unreviewedOnly?: boolean;
  reviewAutoAdvance?: boolean;
  /** Only entries with vision LLM tags. */
  visionTagsOnly?: boolean;
  /** Cap hygiene: show unrated non-favorites most at risk of eviction. */
  atRiskOnly?: boolean;
  /** Prompt-duplicate clusters (seed sweeps with near-identical prompts). */
  duplicatesOnly?: boolean;
  /** Completed stills with images but no vision tags. */
  needsVisionReview?: boolean;
  /** Exact user tag match. */
  userTag?: string;
  /** Exact custom group match, or `__ungrouped__` for entries with no group. */
  customGroup?: string;
  /** Character OS record this job was queued as. */
  characterId?: string;
};

export type ComfyGallerySort =
  | 'queued-desc'
  | 'queued-asc'
  | 'completed-desc'
  | 'tool-asc'
  | 'favorites-first'
  | 'rating-desc'
  | 'eviction-risk-desc';

export const GALLERY_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
export const GALLERY_PAGE_SIZE_ALL = 'all' as const;
/** @deprecated All page size now streams via the virtualized grid. */
export const GALLERY_ALL_RENDER_CHUNK = 48;

export function galleryEntryRenderKey(entry: ComfyGalleryEntry): string {
  // Use a more efficient key generation approach
  // Only include fields that actually affect rendering and don't change frequently
  const parts = [
    entry.id,
    entry.status,
    entry.favorite ? 1 : 0,
    entry.reviewRating ?? 0,
    entry.reviewNote ?? '',
    entry.derivedKind ?? '',
    entry.parentGalleryEntryId ?? '',
    entry.statusMessage ?? '',
    entry.promptId ?? '',
    entry.visionTags?.join(',') ?? '',
    entry.userTags?.join(',') ?? '',
    entry.customGroup ?? '',
    entry.projectId ?? '',
  ];

  // For in-flight entries, include progress info to prevent unnecessary re-renders
  if ((entry.status as string) === 'queued' || entry.status === 'running') {
    parts.push(
      entry.queuePosition ?? '',
      entry.progressValue ?? '',
      entry.progressMax ?? '',
      entry.progressNode ?? ''
    );
  }

  return parts.join('|');
}
export type GalleryPageSize =
  (typeof GALLERY_PAGE_SIZE_OPTIONS)[number] | typeof GALLERY_PAGE_SIZE_ALL;

export const GALLERY_SLIDESHOW_INTERVAL_OPTIONS = [
  2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 30000, 45000, 60000, 90000, 120000,
] as const;
export type GallerySlideshowIntervalMs = (typeof GALLERY_SLIDESHOW_INTERVAL_OPTIONS)[number];

export function formatGallerySlideshowInterval(ms: number): string {
  if (ms < 60_000) {
    return `${ms / 1000}s`;
  }

  const minutes = Math.floor(ms / 60_000);
  const seconds = (ms % 60_000) / 1000;
  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

export function normalizeGallerySlideshowIntervalMs(value: unknown): GallerySlideshowIntervalMs {
  if (isGallerySlideshowIntervalMs(value)) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return GALLERY_SLIDESHOW_INTERVAL_OPTIONS.reduce((best, option) =>
      Math.abs(option - value) < Math.abs(best - value) ? option : best
    );
  }

  return DEFAULT_GALLERY_VIEW.slideshowIntervalMs;
}

export const GALLERY_SLIDESHOW_TRANSITION_OPTIONS = ['slide', 'fade', 'zoom', 'none'] as const;
export type GallerySlideshowTransition = (typeof GALLERY_SLIDESHOW_TRANSITION_OPTIONS)[number];

export const GALLERY_SLIDESHOW_TRANSITION_LABELS: Record<GallerySlideshowTransition, string> = {
  slide: 'Slide',
  fade: 'Fade',
  zoom: 'Zoom',
  none: 'Instant',
};

export function isGallerySlideshowTransition(value: unknown): value is GallerySlideshowTransition {
  return (
    typeof value === 'string' &&
    GALLERY_SLIDESHOW_TRANSITION_OPTIONS.includes(value as GallerySlideshowTransition)
  );
}

export function resolveGallerySlideshowTransition(value: unknown): GallerySlideshowTransition {
  return isGallerySlideshowTransition(value) ? value : DEFAULT_GALLERY_VIEW.slideshowTransition;
}

export const GALLERY_SLIDESHOW_TRANSITION_MS = 520;

export function resolveGallerySlideshowTransitionMs(
  transition: GallerySlideshowTransition
): number {
  return transition === 'none' ? 0 : GALLERY_SLIDESHOW_TRANSITION_MS;
}

export type GalleryLayoutMode = 'grid' | 'dense' | 'list';

export type ComfyGalleryViewPreferences = {
  sort: ComfyGallerySort;
  pageSize: GalleryPageSize;
  slideshowIntervalMs: GallerySlideshowIntervalMs;
  slideshowTransition: GallerySlideshowTransition;
  layout: GalleryLayoutMode;
  page?: number;
};

export const DEFAULT_GALLERY_VIEW: ComfyGalleryViewPreferences = {
  sort: 'queued-desc',
  pageSize: 12,
  slideshowIntervalMs: 5000,
  slideshowTransition: 'slide',
  layout: 'grid',
};

export function isGallerySlideshowIntervalMs(value: unknown): value is GallerySlideshowIntervalMs {
  return (
    typeof value === 'number' &&
    GALLERY_SLIDESHOW_INTERVAL_OPTIONS.includes(value as GallerySlideshowIntervalMs)
  );
}

export function isGalleryPageSize(value: unknown): value is GalleryPageSize {
  return (
    value === GALLERY_PAGE_SIZE_ALL ||
    (typeof value === 'number' &&
      GALLERY_PAGE_SIZE_OPTIONS.includes(value as (typeof GALLERY_PAGE_SIZE_OPTIONS)[number]))
  );
}

export function resolveGalleryPageSize(pageSize: GalleryPageSize, totalItems: number): number {
  if (pageSize === GALLERY_PAGE_SIZE_ALL) {
    return Math.max(totalItems, 1);
  }

  return pageSize;
}

export const COMFYUI_GALLERY_VIEW_KEY = 'comfyui-gallery-view-v1';

function readLegacyLocalStorageGallery(): ComfyGalleryEntry[] {
  const parsed = readBrowserValue<unknown>(COMFYUI_GALLERY_KEY);
  return Array.isArray(parsed) ? (parsed as ComfyGalleryEntry[]) : [];
}

export function loadComfyGallery(): ComfyGalleryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const cached = getGalleryCache();
  if (cached.length > 0) {
    return cached;
  }

  return readLegacyLocalStorageGallery();
}

export async function loadComfyGalleryAsync(): Promise<ComfyGalleryEntry[]> {
  await initGalleryStore();
  return loadComfyGallery();
}

export function saveComfyGallery(
  entries: ComfyGalleryEntry[],
  options?: { syncRemote?: boolean; skipMaintenance?: boolean }
): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (options?.skipMaintenance) {
    // Ephemeral progress-only patch (queue position / % done / status text, ticking
    // up to 4x/sec while a job runs — see galleryPatchIsEphemeralProgress below).
    // Update the in-memory cache so the UI reflects it live, but skip the full-list
    // maintenance passes below: age/byte-budget pruning, entry-count capping,
    // IndexedDB persistence (which fingerprints every entry just to diff one row),
    // and analytics/remote sync. None of that is time-critical for a transient
    // tick — setGalleryCache() already marks the cache dirty, so it still gets
    // flushed by the next non-ephemeral save (e.g. completed/error) or the next
    // reload/tab-sync flush, same as before this patch just less often.
    setGalleryCache(entries);
    notifyGalleryUpdated();
    return;
  }

  const shared = loadSettingsCache().shared;
  const { entries: agePruned } = pruneStaleGalleryWorkflowJson(
    entries,
    shared.galleryWorkflowRetentionDays ?? 30
  );
  const { entries: pruned } = enforceGalleryWorkflowByteBudget(
    agePruned,
    shared.galleryWorkflowMaxBytes ?? 8 * 1024 * 1024
  );
  const protectedIds = collectGalleryProtectedEntryIds(pruned, loadCharacters());
  const { kept, evicted } = capGalleryEntriesForLocalStorage(
    pruned,
    MAX_GALLERY_ENTRIES,
    protectedIds
  );
  setGalleryCache(kept);
  notifyGalleryUpdated();
  scheduleUserAnalyticsSync();
  if (options?.syncRemote !== false) {
    if (evicted.length > 0) {
      // The local cap prefers keeping favorites/high ratings — push the full,
      // untrimmed list so server storage still has the complete history.
      void import('./storage-sync').then(({ syncNamespaceToServer }) =>
        syncNamespaceToServer('comfy-gallery', entries)
      );
      // Also download a local archive of evicted entries so nothing is only on the server.
      void import('./gallery-zip-export').then(({ downloadGalleryZipBundle }) =>
        downloadGalleryZipBundle(evicted, {
          filename: `gallery-archive-evicted-${Date.now()}.zip`,
        })
      );
    }
    void import('./auto-storage-sync').then(({ scheduleAutoPushStorage }) =>
      scheduleAutoPushStorage()
    );
  }
  void initGalleryStore()
    .then(() => persistGalleryCache())
    .then(() =>
      import('./tab-sync').then(({ broadcastTabSync }) =>
        broadcastTabSync({ type: 'gallery-updated' })
      )
    );
}

export async function saveComfyGalleryAsync(entries: ComfyGalleryEntry[]): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const protectedIds = collectGalleryProtectedEntryIds(entries, loadCharacters());
  const { kept } = capGalleryEntriesForLocalStorage(entries, MAX_GALLERY_ENTRIES, protectedIds);
  setGalleryCache(kept);
  await initGalleryStore();
  await persistGalleryCache();
  notifyGalleryUpdated();
  scheduleUserAnalyticsSync();
}

export function clearComfyGallery(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const previous = loadComfyGallery();
  const deletedIds = rememberGalleryDeletedIds(previous.map(entry => entry.id));
  saveComfyGallery([], { syncRemote: false });
  void clearGalleryDb();
  void import('./gallery-server-sync').then(({ pushGalleryDeletionsToServer }) =>
    pushGalleryDeletionsToServer([], deletedIds)
  );
}

export function filterComfyGalleryEntries(
  entries: ComfyGalleryEntry[],
  filter: ComfyGalleryFilter
): ComfyGalleryEntry[] {
  const query = filter.query?.trim();
  const needsHaystackMatch = Boolean(query) && !filter.semanticSearch;
  const needleLower = needsHaystackMatch ? query!.toLowerCase() : '';

  // Cache corpus strings once to avoid repeated join/filter during filtering.
  // Only built when a plain-text (non-semantic) query is actually active --
  // most filter changes (status/tool/favorites/rating/etc.) never touch this
  // haystack at all, so building an 8-field corpus string per entry on every
  // filter recompute was pure waste on a multi-thousand-entry gallery
  // whenever there was no text query to match against.
  const haystacks = needsHaystackMatch
    ? entries.map(
        entry =>
          [
            entry.prompt,
            entry.negativePrompt,
            entry.tool,
            entry.model,
            entry.promptId,
            entry.statusMessage,
            entry.visionTags?.join(' '),
            entry.userTags?.join(' '),
            entry.customGroup,
          ]
            .filter(Boolean)
            .join(' ') // keep original case — we'll lowercase only when needed
      )
    : null;

  let filtered: ComfyGalleryEntry[] = [];
  let idx = 0;
  for (const entry of entries) {
    // Early-exit on string match before doing any other checks when non-semantic search.
    if (needsHaystackMatch && haystacks![idx].toLowerCase().indexOf(needleLower) === -1) {
      idx += 1;
      continue;
    }

    if (filter.favoritesOnly && !(entry.favorite ?? false)) {
      idx += 1;
      continue;
    }
    if (filter.status && filter.status !== 'all' && entry.status !== filter.status) {
      idx += 1;
      continue;
    }
    if (filter.tool?.trim() && entry.tool !== filter.tool.trim()) {
      idx += 1;
      continue;
    }
    if (filter.model?.trim() && entry.model !== filter.model.trim()) {
      idx += 1;
      continue;
    }
    if (filter.minRating && (entry.reviewRating ?? 0) < filter.minRating) {
      idx += 1;
      continue;
    }
    if (filter.atRiskOnly) {
      const keeper = Boolean(entry.favorite) || (entry.reviewRating ?? 0) >= 4;
      if (keeper) {
        idx += 1;
        continue;
      }
    }
    if (filter.unreviewedOnly && entry.reviewRating) {
      idx += 1;
      continue;
    }
    if (filter.projectId?.trim() && entry.projectId !== filter.projectId.trim()) {
      idx += 1;
      continue;
    }
    if (filter.visionTagsOnly && !(entry.visionTags?.length ?? 0)) {
      idx += 1;
      continue;
    }
    if (filter.needsVisionReview) {
      if (
        entry.status !== 'completed' ||
        entry.images.length === 0 ||
        (entry.visionTags?.length ?? 0) > 0
      ) {
        idx += 1;
        continue;
      }
    }
    if (filter.userTag?.trim()) {
      const needle = filter.userTag.trim().toLowerCase();
      if (!(entry.userTags ?? []).some(tag => tag.trim().toLowerCase() === needle)) {
        idx += 1;
        continue;
      }
    }
    if (filter.customGroup?.trim() && !galleryEntryMatchesCustomGroup(entry, filter.customGroup)) {
      idx += 1;
      continue;
    }
    if (filter.focusEntryId?.trim() && entry.id !== filter.focusEntryId.trim()) {
      idx += 1;
      continue;
    }
    if (
      filter.derivativeOfEntryId?.trim() &&
      entry.parentGalleryEntryId !== filter.derivativeOfEntryId.trim()
    ) {
      idx += 1;
      continue;
    }
    if (filter.derivedKind && entry.derivedKind !== filter.derivedKind) {
      idx += 1;
      continue;
    }
    if (filter.characterId?.trim() && entry.characterId !== filter.characterId.trim()) {
      idx += 1;
      continue;
    }
    if (filter.mediaKind && filter.mediaKind !== 'all') {
      if (galleryEntryPrimaryMediaKind(entry) !== filter.mediaKind) {
        idx += 1;
        continue;
      }
    }

    filtered.push(entry);
    idx += 1;
  }

  if (filter.duplicatesOnly) {
    const ids = duplicateEntryIds(clusterGalleryDuplicates(filtered));
    filtered = filtered.filter(entry => ids.has(entry.id));
  }

  if (query && filter.semanticSearch) {
    // Pre-compute corpus strings to avoid repeated join/filter allocations during ranking.
    const corpora = new Map(filtered.map(entry => [entry.id, galleryEntryCorpus(entry)]));
    filtered = filterBySemanticQuery(filtered, query, entry => corpora.get(entry.id)!);
  }

  if (filter.similarToEntryId) {
    const reference = entries.find(entry => entry.id === filter.similarToEntryId);
    if (reference) {
      filtered =
        filter.similarMode === 'visual'
          ? orderGalleryByVisualSimilarity(filtered, reference)
          : orderGalleryBySimilarity(filtered, reference);
    }
  }

  return filtered;
}

export function paginateGalleryEntries<T>(
  entries: T[],
  page: number,
  pageSize: number
): { items: T[]; page: number; totalPages: number; totalItems: number } {
  const totalItems = entries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: entries.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    totalItems,
  };
}

export function sortGalleryEntries(
  entries: ComfyGalleryEntry[],
  sort: ComfyGallerySort = DEFAULT_GALLERY_VIEW.sort
): ComfyGalleryEntry[] {
  // Skip the copy when no sorting is needed — default (queued-desc) is typically already correct.
  if (sort === 'queued-desc' && entries.length <= 1) return entries;
  const sorted = [...entries];

  switch (sort) {
    case 'queued-asc':
      return sorted.sort((a, b) => a.queuedAt - b.queuedAt);
    case 'completed-desc':
      return sorted.sort((a, b) => (b.completedAt ?? b.queuedAt) - (a.completedAt ?? a.queuedAt));
    case 'tool-asc':
      return sorted.sort((a, b) => {
        const ta = a.tool ?? '';
        const tb = b.tool ?? '';
        if (ta === '') return 1; // empty sorts last
        if (tb === '') return -1;
        return ta.localeCompare(tb) || b.queuedAt - a.queuedAt;
      });
    case 'favorites-first':
      return sorted.sort(
        (a, b) =>
          Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.queuedAt - a.queuedAt
      );
    case 'rating-desc':
      return sorted.sort(
        (a, b) => (b.reviewRating ?? 0) - (a.reviewRating ?? 0) || b.queuedAt - a.queuedAt
      );
    case 'eviction-risk-desc': {
      const keeperScore = (entry: ComfyGalleryEntry) =>
        Number(Boolean(entry.favorite)) * 10 + (entry.reviewRating ?? 0);
      return sorted.sort((a, b) => {
        const risk = keeperScore(a) - keeperScore(b);
        if (risk !== 0) {
          return risk;
        }
        return (a.completedAt ?? a.queuedAt) - (b.completedAt ?? b.queuedAt);
      });
    }
    case 'queued-desc':
    default:
      return sorted.sort((a, b) => b.queuedAt - a.queuedAt);
  }
}

export function loadGalleryViewPreferences(): ComfyGalleryViewPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_GALLERY_VIEW;
  }

  try {
    const parsed = readBrowserValue<Partial<ComfyGalleryViewPreferences>>(COMFYUI_GALLERY_VIEW_KEY);
    if (!parsed) {
      return DEFAULT_GALLERY_VIEW;
    }
    const pageSize = isGalleryPageSize(parsed.pageSize)
      ? parsed.pageSize
      : DEFAULT_GALLERY_VIEW.pageSize;

    const sortValues: ComfyGallerySort[] = [
      'queued-desc',
      'queued-asc',
      'completed-desc',
      'tool-asc',
      'favorites-first',
      'rating-desc',
      'eviction-risk-desc',
    ];
    const sort = sortValues.includes(parsed.sort as ComfyGallerySort)
      ? (parsed.sort as ComfyGallerySort)
      : DEFAULT_GALLERY_VIEW.sort;
    const slideshowIntervalMs = normalizeGallerySlideshowIntervalMs(parsed.slideshowIntervalMs);
    const slideshowTransition = resolveGallerySlideshowTransition(parsed.slideshowTransition);
    const layoutValues: GalleryLayoutMode[] = ['grid', 'dense', 'list'];
    const layout = layoutValues.includes(parsed.layout as GalleryLayoutMode)
      ? (parsed.layout as GalleryLayoutMode)
      : DEFAULT_GALLERY_VIEW.layout;
    const page =
      typeof parsed.page === 'number' && Number.isFinite(parsed.page) && parsed.page >= 1
        ? Math.floor(parsed.page)
        : undefined;

    return { sort, pageSize, slideshowIntervalMs, slideshowTransition, layout, page };
  } catch {
    return DEFAULT_GALLERY_VIEW;
  }
}

export function saveGalleryViewPreferences(preferences: ComfyGalleryViewPreferences): void {
  if (typeof window === 'undefined') {
    return;
  }

  writeBrowserValue(COMFYUI_GALLERY_VIEW_KEY, preferences);
}

export function uniqueGalleryTools(entries: ComfyGalleryEntry[]): string[] {
  return [...new Set(entries.map(entry => entry.tool).filter(Boolean) as string[])].sort();
}

export function uniqueGalleryModels(entries: ComfyGalleryEntry[]): string[] {
  return [...new Set(entries.map(entry => entry.model).filter(Boolean) as string[])].sort();
}

export function uniqueGalleryUserTags(entries: ComfyGalleryEntry[]): string[] {
  const tags = new Set<string>();
  for (const entry of entries) {
    for (const tag of entry.userTags ?? []) {
      const trimmed = tag.trim();
      if (trimmed) {
        tags.add(trimmed);
      }
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export { uniqueGalleryCustomGroups };

export function addComfyGalleryEntry(
  input: Omit<ComfyGalleryEntry, 'id' | 'queuedAt' | 'images' | 'status'> & {
    id?: string;
    status?: ComfyGalleryJobStatus;
    images?: ComfyOutputImage[];
  }
): ComfyGalleryEntry {
  const userId = getActiveUserId();
  const entry: ComfyGalleryEntry = {
    queuedAt: Date.now(),
    status: input.status ?? 'pending',
    images: input.images ?? [],
    ...input,
    id: input.id?.trim() || crypto.randomUUID(),
    userId: input.userId ?? userId ?? undefined,
  };

  (entry as { _corpus?: string })._corpus = galleryEntryCorpus(entry);
  saveComfyGallery([entry, ...loadComfyGallery()]);
  void import('./gallery-server-sync').then(({ pushGallerySnapshotToServer }) => {
    void pushGallerySnapshotToServer();
  });
  return entry;
}

function applyGalleryEntryPatch<T extends Partial<ComfyGalleryEntry>>(
  entry: ComfyGalleryEntry,
  patch: T
): ComfyGalleryEntry {
  const updated: ComfyGalleryEntry = { ...entry, ...patch };
  // Drop stale semantic corpus when corpus-affecting fields change.
  if (
    patch.prompt !== undefined ||
    patch.negativePrompt !== undefined ||
    patch.statusMessage !== undefined ||
    patch.promptId !== undefined ||
    patch.reviewNote !== undefined ||
    patch.visionTags !== undefined ||
    patch.userTags !== undefined ||
    patch.customGroup !== undefined
  ) {
    delete updated._corpus;
    updated._corpus = galleryEntryCorpus(updated);
  }
  return updated;
}

export function updateComfyGalleryEntryById(
  id: string,
  patch: Partial<
    Pick<
      ComfyGalleryEntry,
      | 'status'
      | 'statusMessage'
      | 'queuePosition'
      | 'progressValue'
      | 'progressMax'
      | 'progressNode'
      | 'completedAt'
      | 'renderDurationMs'
      | 'executionStartedAt'
      | 'images'
      | 'comfyUrl'
      | 'favorite'
      | 'historyId'
      | 'prompt'
      | 'negativePrompt'
      | 'queueParams'
      | 'reviewRating'
      | 'reviewNote'
      | 'projectId'
      | 'visionTags'
      | 'userTags'
      | 'customGroup'
      | 'aestheticScore'
      | 'aestheticScoreMethod'
      | 'workflowJson'
      | 'hasStoredWorkflow'
      | 'workflowJsonOmitted'
      | 'durableThumbPath'
      | 'durableOriginalPath'
      | 'sourceImageUrl'
      | 'characterId'
      | 'lookId'
    >
  >
): ComfyGalleryEntry | null {
  const entries = loadComfyGallery();
  let updated: ComfyGalleryEntry | null = null;
  const next = entries.map(entry => {
    if (entry.id !== id) {
      return entry;
    }
    updated = applyGalleryEntryPatch(entry, patch);
    return updated;
  });
  if (!updated) {
    return null;
  }
  if (patch.status === 'completed') {
    const prior = entries.find(entry => entry.id === id);
    if (prior && prior.status !== 'completed') {
      void import('./notification-center').then(({ pushNotification }) =>
        pushNotification({
          title: 'ComfyUI job completed',
          body: updated!.prompt.slice(0, 80),
          href: '/gallery',
          kind: 'job',
        })
      );
      celebrateSystemTray('job');
    }
  }
  saveComfyGallery(next);
  if (patch.status === 'completed' || patch.status === 'error') {
    void import('./gallery-server-sync').then(({ pushGallerySnapshotToServer }) => {
      void pushGallerySnapshotToServer();
    });
  }
  return updated;
}

function galleryPatchIsEphemeralProgress(patch: Partial<ComfyGalleryEntry>): boolean {
  if (patch.status === 'completed' || patch.status === 'error') {
    return false;
  }
  if (patch.images || patch.completedAt != null || patch.favorite != null) {
    return false;
  }
  if (patch.historyId || patch.queueParams || patch.reviewRating != null || patch.projectId) {
    return false;
  }
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    return false;
  }
  return keys.every(key =>
    [
      'status',
      'statusMessage',
      'queuePosition',
      'progressValue',
      'progressMax',
      'progressNode',
      'comfyUrl',
    ].includes(key)
  );
}

export function updateComfyGalleryByPromptId(
  promptId: string,
  patch: Partial<
    Pick<
      ComfyGalleryEntry,
      | 'status'
      | 'statusMessage'
      | 'queuePosition'
      | 'progressValue'
      | 'progressMax'
      | 'progressNode'
      | 'completedAt'
      | 'renderDurationMs'
      | 'executionStartedAt'
      | 'images'
      | 'comfyUrl'
      | 'clientId'
      | 'favorite'
      | 'historyId'
      | 'queueParams'
      | 'reviewRating'
      | 'projectId'
      | 'oomRetryAttempted'
    >
  >
): ComfyGalleryEntry | null {
  const entries = loadComfyGallery();
  const prior = entries.find(entry => entry.promptId === promptId);
  let updated: ComfyGalleryEntry | null = null;
  const next = entries.map(entry => {
    if (entry.promptId !== promptId) {
      return entry;
    }
    updated = applyGalleryEntryPatch(entry, patch);
    return updated;
  });

  if (!updated) {
    return null;
  }

  if (patch.status === 'completed' && prior && prior.status !== 'completed') {
    celebrateSystemTray('job');
  }

  const ephemeral = galleryPatchIsEphemeralProgress(patch);
  saveComfyGallery(next, {
    syncRemote: !ephemeral,
    skipMaintenance: ephemeral,
  });
  if (patch.status === 'completed' || patch.status === 'error') {
    void import('./gallery-server-sync').then(({ pushGallerySnapshotToServer }) => {
      void pushGallerySnapshotToServer();
    });
  }
  return updated;
}

export function toggleComfyGalleryFavorite(id: string): void {
  saveComfyGallery(
    loadComfyGallery().map(entry =>
      entry.id === id ? { ...entry, favorite: !entry.favorite } : entry
    )
  );
}

export function setGalleryReviewRating(
  id: string,
  reviewRating: ComfyGalleryEntry['reviewRating']
): void {
  saveComfyGallery(
    loadComfyGallery().map(entry =>
      entry.id === id
        ? { ...entry, reviewRating, favorite: reviewRating === 5 ? true : entry.favorite }
        : entry
    )
  );
}

export function setGalleryReviewNote(id: string, reviewNote?: string): void {
  const trimmed = reviewNote?.trim() || undefined;
  updateComfyGalleryEntryById(id, { reviewNote: trimmed });
}

function pruneComfyHistoryForEntries(entries: ComfyGalleryEntry[]): void {
  const byHost = new Map<string, string[]>();
  for (const entry of entries) {
    const promptId = entry.promptId?.trim();
    if (!promptId) {
      continue;
    }
    const host = entry.comfyUrl?.trim() || '';
    const list = byHost.get(host) ?? [];
    list.push(promptId);
    byHost.set(host, list);
  }
  if (byHost.size === 0) {
    return;
  }
  void import('./comfyui-queue-control').then(({ deleteComfyHistoryPrompts }) => {
    for (const [comfyUrl, promptIds] of byHost) {
      void deleteComfyHistoryPrompts({
        promptIds,
        ...(comfyUrl ? { comfyUrl } : {}),
      });
    }
  });
}

export function removeComfyGalleryEntry(id: string): void {
  const existing = loadComfyGallery().find(entry => entry.id === id);
  const deletedIds = rememberGalleryDeletedIds([id]);
  const next = loadComfyGallery().filter(entry => entry.id !== id);
  saveComfyGallery(next, { syncRemote: false });
  void import('./gallery-server-sync').then(({ pushGalleryDeletionsToServer }) =>
    pushGalleryDeletionsToServer(next, deletedIds)
  );
  if (existing) {
    pruneComfyHistoryForEntries([existing]);
  }
}

export function removeComfyGalleryEntries(ids: string[]): void {
  if (ids.length === 0) {
    return;
  }
  const idSet = new Set(ids);
  const removed = loadComfyGallery().filter(entry => idSet.has(entry.id));
  const deletedIds = rememberGalleryDeletedIds(ids);
  const next = loadComfyGallery().filter(entry => !idSet.has(entry.id));
  saveComfyGallery(next, { syncRemote: false });
  void import('./gallery-server-sync').then(({ pushGalleryDeletionsToServer }) =>
    pushGalleryDeletionsToServer(next, deletedIds)
  );
  pruneComfyHistoryForEntries(removed);
}

export function setComfyGalleryProjectIds(ids: string[], projectId: string | undefined): void {
  const idSet = new Set(ids);
  saveComfyGallery(
    loadComfyGallery().map(entry =>
      idSet.has(entry.id) ? { ...entry, projectId: projectId || undefined } : entry
    )
  );
}

export function setComfyGalleryCustomGroups(ids: string[], groupName: string | undefined): void {
  if (ids.length === 0) {
    return;
  }
  const existing = uniqueGalleryCustomGroups(loadComfyGallery());
  const nextName =
    groupName == null || !groupName.trim()
      ? undefined
      : resolveGalleryCustomGroupName(groupName, existing);
  const idSet = new Set(ids);
  saveComfyGallery(
    loadComfyGallery().map(entry =>
      idSet.has(entry.id) ? { ...entry, customGroup: nextName } : entry
    )
  );
}

/** Rename a custom group across the whole gallery. Returns how many entries changed. */
export function renameComfyGalleryCustomGroup(from: string, to: string): number {
  const { entries, changed } = renameGalleryCustomGroupEntries(loadComfyGallery(), from, to);
  if (changed > 0) {
    saveComfyGallery(entries);
  }
  return changed;
}

/** Remove a custom group name from every entry that uses it. Returns how many cleared. */
export function deleteComfyGalleryCustomGroup(name: string): number {
  const { entries, changed } = deleteGalleryCustomGroupEntries(loadComfyGallery(), name);
  if (changed > 0) {
    saveComfyGallery(entries);
  }
  return changed;
}

/** Drop character/look stamps so the still leaves Cast without deleting the file. */
export function clearGalleryCharacterStamp(ids: string[]): number {
  const idSet = new Set(ids.map(id => id.trim()).filter(Boolean));
  if (idSet.size === 0) {
    return 0;
  }
  let cleared = 0;
  const next = loadComfyGallery().map(entry => {
    if (!idSet.has(entry.id) || !entry.characterId) {
      return entry;
    }
    cleared += 1;
    const copy = { ...entry };
    delete copy.characterId;
    delete copy.lookId;
    return copy;
  });
  if (cleared > 0) {
    saveComfyGallery(next);
  }
  return cleared;
}

export function setComfyGalleryFavorites(ids: string[], favorite: boolean): void {
  if (ids.length === 0) {
    return;
  }
  const idSet = new Set(ids);
  saveComfyGallery(
    loadComfyGallery().map(entry => (idSet.has(entry.id) ? { ...entry, favorite } : entry))
  );
}

export function setComfyGalleryReviewRatings(
  ids: string[],
  reviewRating: ComfyGalleryEntry['reviewRating']
): void {
  if (ids.length === 0) {
    return;
  }
  const idSet = new Set(ids);
  saveComfyGallery(
    loadComfyGallery().map(entry =>
      idSet.has(entry.id)
        ? {
            ...entry,
            reviewRating,
            favorite: reviewRating === 5 ? true : entry.favorite,
          }
        : entry
    )
  );
}

export function setComfyGalleryUserTags(
  ids: string[],
  tags: string[],
  mode: 'add' | 'replace' | 'remove' = 'add'
): void {
  if (ids.length === 0) {
    return;
  }
  const cleaned = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
  const idSet = new Set(ids);
  saveComfyGallery(
    loadComfyGallery().map(entry => {
      if (!idSet.has(entry.id)) {
        return entry;
      }
      if (mode === 'replace') {
        return { ...entry, userTags: cleaned.length ? cleaned : undefined };
      }
      const current = entry.userTags ?? [];
      if (mode === 'remove') {
        const drop = new Set(cleaned.map(tag => tag.toLowerCase()));
        const next = current.filter(tag => !drop.has(tag.toLowerCase()));
        return { ...entry, userTags: next.length ? next : undefined };
      }
      const seen = new Set(current.map(tag => tag.toLowerCase()));
      const next = [...current];
      for (const tag of cleaned) {
        if (!seen.has(tag.toLowerCase())) {
          seen.add(tag.toLowerCase());
          next.push(tag);
        }
      }
      return { ...entry, userTags: next };
    })
  );
}

function galleryEntryIsMotionJob(entry: Pick<ComfyGalleryEntry, 'tool' | 'derivedKind'>): boolean {
  return (
    entry.tool === 'video' ||
    entry.derivedKind === 'i2v' ||
    entry.derivedKind === 't2v' ||
    entry.derivedKind === 'extend' ||
    entry.derivedKind === 'film'
  );
}

function galleryOutputIsMotion(
  image: Pick<ComfyGalleryEntry['images'][number], 'filename' | 'format'>,
  entry: Pick<ComfyGalleryEntry, 'tool' | 'derivedKind'>
): boolean {
  if (isGalleryMotionOutput(image)) {
    return true;
  }
  return galleryEntryIsMotionJob(entry) && isAnimatedImageViewUrl(image.filename);
}

function galleryOutputSkipsThumbProxy(
  image: Pick<ComfyGalleryEntry['images'][number], 'filename' | 'format'>,
  entry: Pick<ComfyGalleryEntry, 'tool' | 'derivedKind'>
): boolean {
  return galleryOutputIsMotion(image, entry) || isGalleryPassthroughOutput(image);
}

function galleryResolvedMediaKind(
  image: Pick<ComfyGalleryEntry['images'][number], 'filename' | 'format'>,
  entry: Pick<ComfyGalleryEntry, 'tool' | 'derivedKind'>
): ComfyOutputMediaKind {
  const kind = resolveComfyOutputMediaKind(image);
  if (kind === 'audio' || kind === 'mesh') {
    return kind;
  }
  if (galleryOutputIsMotion(image, entry)) {
    return 'video';
  }
  return kind;
}

/**
 * Looks up a per-image durable path, falling back to the legacy single-value
 * field for index 0 — entries persisted before multi-image batches were
 * supported (or via the single-image upload/film-assemble/identity paths,
 * which never write the arrays) only ever set the singular field.
 */
function durableOriginalPathAt(entry: ComfyGalleryEntry, index: number): string | undefined {
  return (
    entry.durableOriginalPaths?.[index] ??
    (index === 0 ? entry.durableOriginalPath : undefined) ??
    undefined
  );
}
function durableThumbPathAt(entry: ComfyGalleryEntry, index: number): string | undefined {
  return (
    entry.durableThumbPaths?.[index] ??
    (index === 0 ? entry.durableThumbPath : undefined) ??
    undefined
  );
}

function galleryEntryBuildViewPath(
  entry: ComfyGalleryEntry,
  image: ComfyGalleryEntry['images'][number],
  index: number,
  options?: { width?: number }
): string {
  // Durable storage (see gallery-media-store.ts) now holds full-res originals
  // for video/animated outputs too, not just stills, and for every image in a
  // multi-image batch — prefer it whenever it's there so playback and "open
  // original" never depend on the source engine (ComfyUI, a cloud API, etc.)
  // still having the file at request time.
  const durableOriginal = durableOriginalPathAt(entry, index);
  if (durableOriginal) {
    return durableGalleryOriginalUrl(entry.id, index);
  }
  const width =
    options?.width && galleryOutputSkipsThumbProxy(image, entry) ? undefined : options?.width;
  return buildEngineViewPath(entry.engineId, entry.comfyUrl, image, width ? { width } : undefined);
}

/** Bounded per-entry URL cache to avoid re-allocating URLSearchParams on every render pass. */
const _entryUrlCacheMaxSize = 4096;
const _entryUrlCache = new Map<
  string,
  {
    thumb: string[] | null;
    stripThumb: string[] | null;
    lightbox: string[] | null;
    view: string[] | null;
    primaryView: string | null;
    primaryThumb: string | null;
    primaryMediaKind: ComfyOutputMediaKind;
    lqip: string | null;
    download: { url: string[]; filename: string[] } | null;
  }
>();

/** Must include image identity + host — length alone leaves stale thumbs after replace/rewrite. */
function galleryEntryUrlCacheKey(entry: ComfyGalleryEntry): string {
  const images = entry.images
    .map(image => `${image.filename}:${image.subfolder}:${image.type}`)
    .join(',');
  const durableThumbs = entry.durableThumbPaths?.join(',') ?? '';
  const durableOriginals = entry.durableOriginalPaths?.join(',') ?? '';
  return `${entry.id}|${entry.engineId ?? ''}|${entry.comfyUrl ?? ''}|${images}|${entry.durableThumbPath ?? ''}|${entry.durableOriginalPath ?? ''}|${durableThumbs}|${durableOriginals}|${entry.tool ?? ''}|${entry.derivedKind ?? ''}`;
}

function _evictUrlCacheIfNeeded(key: string): void {
  if (_entryUrlCache.size < _entryUrlCacheMaxSize || _entryUrlCache.has(key)) {
    return;
  }
  const half = Math.floor(_entryUrlCacheMaxSize / 2);
  let evicted = 0;
  for (const existingKey of _entryUrlCache.keys()) {
    if (evicted >= half) break;
    _entryUrlCache.delete(existingKey);
    evicted += 1;
  }
}

function _updateUrlCache(
  key: string,
  partial:
    | { thumb?: string[] | null }
    | { stripThumb?: string[] | null }
    | { lightbox?: string[] | null }
    | { view?: string[] | null }
    | { primaryView?: string | null }
    | { primaryThumb?: string | null }
    | { primaryMediaKind?: ComfyOutputMediaKind }
    | { lqip?: string | null }
    | { download?: { url: string[]; filename: string[] } | null }
) {
  _evictUrlCacheIfNeeded(key);
  let entry = _entryUrlCache.get(key);
  if (!entry) {
    entry = {
      thumb: null,
      stripThumb: null,
      lightbox: null,
      view: null,
      primaryView: null,
      primaryThumb: null,
      primaryMediaKind: 'image',
      lqip: null,
      download: null,
    };
  }
  Object.assign(entry, partial);
  _entryUrlCache.set(key, entry);
}

export function galleryEntryViewUrls(entry: ComfyGalleryEntry): string[] {
  const key = galleryEntryUrlCacheKey(entry);
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.view) return entryCache.view;

  const urls = entry.images.map((image, index) => galleryEntryBuildViewPath(entry, image, index));
  _updateUrlCache(key, { view: urls });
  return urls;
}

export function galleryEntryThumbUrls(entry: ComfyGalleryEntry): string[] {
  const key = galleryEntryUrlCacheKey(entry);
  let cached = _entryUrlCache.get(key)?.thumb;
  if (cached) return cached;

  cached = entry.images.map((image, index) => {
    const durableThumb = durableThumbPathAt(entry, index);
    return galleryOutputSkipsThumbProxy(image, entry)
      ? galleryEntryBuildViewPath(entry, image, index)
      : durableThumb
        ? durableGalleryThumbUrl(entry.id, index)
        : galleryEntryBuildViewPath(entry, image, index, { width: GALLERY_THUMB_WIDTH });
  });

  const mediaKind =
    cached.length > 0
      ? resolveComfyOutputMediaKind(
          entry.images[galleryEntryPrimaryPlaybackIndex(entry)] ?? entry.images[0]!
        )
      : 'image';

  _updateUrlCache(key, {
    thumb: cached,
    primaryThumb: cached[0] ?? null,
    primaryMediaKind: mediaKind,
  });

  return cached;
}

export function galleryEntryStripThumbUrls(entry: ComfyGalleryEntry): string[] {
  const key = galleryEntryUrlCacheKey(entry);
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.stripThumb) return entryCache.stripThumb;

  const urls = entry.images.map((image, index) => {
    const durableThumb = durableThumbPathAt(entry, index);
    return galleryOutputSkipsThumbProxy(image, entry)
      ? galleryEntryBuildViewPath(entry, image, index)
      : durableThumb
        ? durableGalleryThumbUrl(entry.id, index)
        : galleryEntryBuildViewPath(entry, image, index, {
            width: GALLERY_STRIP_THUMB_WIDTH,
          });
  });

  _updateUrlCache(key, { stripThumb: urls });
  return urls;
}

export function galleryEntryLightboxUrls(entry: ComfyGalleryEntry): string[] {
  const key = galleryEntryUrlCacheKey(entry);
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.lightbox) return entryCache.lightbox;

  const urls = entry.images.map((image, index) =>
    galleryOutputSkipsThumbProxy(image, entry)
      ? galleryEntryBuildViewPath(entry, image, index)
      : galleryEntryBuildViewPath(entry, image, index, { width: GALLERY_LIGHTBOX_WIDTH })
  );

  _updateUrlCache(key, { lightbox: urls });
  return urls;
}

export function galleryEntryPrimaryPlaybackIndex(entry: ComfyGalleryEntry): number {
  const index = entry.images.findIndex(image => galleryResolvedMediaKind(image, entry) !== 'image');
  return index >= 0 ? index : 0;
}

export function galleryEntryPrimaryViewUrl(entry: ComfyGalleryEntry): string | null {
  const key = galleryEntryUrlCacheKey(entry);
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.primaryView) return entryCache.primaryView;

  const urls = galleryEntryViewUrls(entry);
  const index = galleryEntryPrimaryPlaybackIndex(entry);
  const primary = urls[index] ?? urls[0] ?? null;
  _updateUrlCache(key, { primaryView: primary });
  return primary;
}

export function galleryEntryPrimaryThumbUrl(entry: ComfyGalleryEntry): string | null {
  // Reuse the thumb cache so we don't double-build.
  const all = galleryEntryThumbUrls(entry);
  return all[0] ?? null;
}

export function galleryEntryPrimaryThumbSrcSet(entry: ComfyGalleryEntry): string | null {
  const index = galleryEntryPrimaryPlaybackIndex(entry);
  const image = entry.images[index] ?? entry.images[0];
  if (!image || galleryOutputSkipsThumbProxy(image, entry)) {
    return null;
  }
  if (durableThumbPathAt(entry, index)) {
    return `${durableGalleryThumbUrl(entry.id, index)} ${GALLERY_THUMB_WIDTH}w`;
  }
  if (entry.engineId === 'diffusers' || isCloudEngine(entry.engineId)) {
    return GALLERY_THUMB_SRCSET_WIDTHS.map(
      width => `${galleryEntryBuildViewPath(entry, image, index, { width })} ${width}w`
    ).join(', ');
  }
  return buildComfyViewSrcSet(entry.comfyUrl, image);
}

/** Per-image media kind (image, video, audio, or mesh) for gallery rendering. */
export function galleryEntryMediaKinds(entry: ComfyGalleryEntry): ComfyOutputMediaKind[] {
  return entry.images.map(image => galleryResolvedMediaKind(image, entry));
}

/** Media kind of the entry's playable hero (clip/audio/mesh if present, otherwise the first output). */
export function galleryEntryPrimaryMediaKind(entry: ComfyGalleryEntry): ComfyOutputMediaKind {
  const playback = entry.images[galleryEntryPrimaryPlaybackIndex(entry)];
  return playback ? galleryResolvedMediaKind(playback, entry) : 'image';
}

/** Grid/lightbox hero: original clip/animation URL — never the stills `w=` proxy. */
export function galleryEntryHeroPreviewUrl(entry: ComfyGalleryEntry): string | null {
  const view = galleryEntryPrimaryViewUrl(entry);
  if (view) {
    const image = entry.images[galleryEntryPrimaryPlaybackIndex(entry)];
    if (image && galleryOutputSkipsThumbProxy(image, entry)) {
      return view;
    }
    if (shouldUseHtmlVideoElement(galleryEntryPrimaryMediaKind(entry), view)) {
      return view;
    }
  }
  return galleryEntryPrimaryThumbUrl(entry);
}

export function galleryEntryPrimaryLqipUrl(entry: ComfyGalleryEntry): string | null {
  const key = galleryEntryUrlCacheKey(entry);
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.lqip) return entryCache.lqip;

  const index = galleryEntryPrimaryPlaybackIndex(entry);
  const image = entry.images[index] ?? entry.images[0];
  if (!image || galleryOutputSkipsThumbProxy(image, entry)) {
    _updateUrlCache(key, { lqip: null });
    return null;
  }

  const durableThumb = durableThumbPathAt(entry, index);
  const url = durableThumb
    ? durableGalleryThumbUrl(entry.id, index)
    : galleryEntryBuildViewPath(entry, image, index, { width: GALLERY_LQIP_WIDTH });
  _updateUrlCache(key, { lqip: url });
  return url;
}

export function galleryEntryDownloadUrls(entry: ComfyGalleryEntry): {
  url: string[];
  filename: string[];
} {
  const key = galleryEntryUrlCacheKey(entry);
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.download) return entryCache.download;

  const urls = entry.images.map((image, index) => galleryEntryBuildViewPath(entry, image, index));
  const filenames = entry.images.map(image => image.filename ?? '');
  _updateUrlCache(key, { download: { url: urls, filename: filenames } });
  return { url: urls, filename: filenames };
}

export type GalleryLightboxPlaylist = {
  /** Mid-res proxy URLs for in-lightbox display. */
  images: string[];
  /** Grid-thumb proxy URLs (usually already cached) for blur-up placeholders. */
  thumbImages: string[];
  /** Full-res view URLs (no width resize) for "Open original". */
  originalImages: string[];
  /** Download-ready Comfy view URLs (with width param) parallel to `images`. */
  downloadUrls: string[];
  /** Per-slide filenames for naming the downloaded file. */
  downloadFilenames: string[];
  titles: string[];
  /** Per-slide media kind, parallel to `images`/`originalImages`. */
  mediaKinds: ComfyOutputMediaKind[];
};

export function buildGalleryLightboxPlaylist(
  entries: readonly ComfyGalleryEntry[],
  titleLength = 120
): GalleryLightboxPlaylist {
  const images: string[] = [];
  const thumbImages: string[] = [];
  const originalImages: string[] = [];
  const downloadUrls: string[] = [];
  const downloadFilenames: string[] = [];
  const titles: string[] = [];
  const mediaKinds: ComfyOutputMediaKind[] = [];

  for (const entry of entries) {
    const urls = galleryEntryLightboxUrls(entry);
    const thumbs = galleryEntryThumbUrls(entry);
    const originals = galleryEntryViewUrls(entry);
    const downloadMeta = galleryEntryDownloadUrls(entry);
    const kinds = galleryEntryMediaKinds(entry);
    if (urls.length === 0) {
      continue;
    }

    const title = entry.prompt.slice(0, titleLength);
    for (let i = 0; i < urls.length; i += 1) {
      images.push(urls[i]!);
      thumbImages.push(thumbs[i] ?? urls[i]!);
      originalImages.push(stripGalleryViewWidthParam(originals[i] ?? urls[i]!));
      downloadUrls.push(downloadMeta.url[i] ?? originals[i] ?? urls[i]!);
      downloadFilenames.push(downloadMeta.filename[i] ?? '');
      titles.push(title);
      mediaKinds.push(kinds[i] ?? 'image');
    }
  }

  return {
    images,
    thumbImages,
    originalImages,
    downloadUrls,
    downloadFilenames,
    titles,
    mediaKinds,
  };
}

export function resolveGalleryLightboxOpenIndex(
  entries: readonly ComfyGalleryEntry[],
  entryId: string,
  imageIndex = 0
): number {
  let flatIndex = 0;

  for (const entry of entries) {
    const urls = galleryEntryLightboxUrls(entry);
    if (urls.length === 0) {
      continue;
    }

    if (entry.id === entryId) {
      return flatIndex + Math.min(Math.max(imageIndex, 0), urls.length - 1);
    }

    flatIndex += urls.length;
  }

  return 0;
}

export function resolveGalleryLightboxEntry(
  entries: readonly ComfyGalleryEntry[],
  flatIndex: number
): { entry: ComfyGalleryEntry; imageIndex: number } | null {
  let cumulative = 0;

  for (const entry of entries) {
    const urls = galleryEntryLightboxUrls(entry);
    if (urls.length === 0) {
      continue;
    }

    if (flatIndex >= cumulative && flatIndex < cumulative + urls.length) {
      return { entry, imageIndex: flatIndex - cumulative };
    }

    cumulative += urls.length;
  }

  return null;
}
