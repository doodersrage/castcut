'use client';

import { useCallback, useEffect, useMemo, useState, startTransition } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  clearComfyGallery,
  COMFYUI_GALLERY_UPDATED_EVENT,
  filterComfyGalleryEntries,
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
  initGalleryStore,
  isGalleryStoreReady,
  loadComfyGallery,
  removeComfyGalleryEntries,
  removeComfyGalleryEntry,
  setComfyGalleryFavorites,
  setComfyGalleryProjectIds,
  setComfyGalleryReviewRatings,
  setComfyGalleryUserTags,
  setComfyGalleryCustomGroups,
  renameComfyGalleryCustomGroup,
  deleteComfyGalleryCustomGroup,
  setGalleryReviewRating,
  toggleComfyGalleryFavorite,
  type ComfyGalleryEntry,
  type ComfyGalleryFilter,
  uniqueGalleryCastIds,
  uniqueGalleryModels,
  uniqueGalleryTools,
  uniqueGalleryUserTags,
  uniqueGalleryCustomGroups,
} from '@/lib/comfyui-gallery';
import { primeGalleryCacheSync } from '@/lib/gallery-db-store';
import { pullAndMergeGalleryFromServer } from '@/lib/gallery-server-sync';
import { scheduleComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import { fetchEmbeddingRankIds, galleryEntryCorpus, sortByRankIds } from '@/lib/embedding-rank';
import { galleryVisualCorpus } from '@/lib/gallery-similarity';
import { loadSettingsCache } from '@/lib/settings-cache';

/** Guards the opportunistic server-gallery merge to run once per page session. */
let serverGalleryMergeAttempted = false;

export function useComfyUiGallery(initialFilter?: ComfyGalleryFilter) {
  // Keep first client render identical to SSR (empty / not ready) to avoid hydration mismatch.
  const [storeReady, setStoreReady] = useState(false);
  const [entries, setEntries] = useState<ComfyGalleryEntry[]>([]);
  const [filter, setFilter] = useState<ComfyGalleryFilter>(initialFilter ?? { status: 'all' });
  const [embeddingRankIds, setEmbeddingRankIds] = useState<string[] | null>(null);
  const [similarRankIds, setSimilarRankIds] = useState<string[] | null>(null);
  const [embeddingSearchLoading, setEmbeddingSearchLoading] = useState(false);
  const [embeddingSearchUnavailable, setEmbeddingSearchUnavailable] = useState(false);
  const [similarSearchLoading, setSimilarSearchLoading] = useState(false);

  const refresh = useCallback(() => {
    startTransition(() => {
      setEntries(loadComfyGallery());
    });
  }, []);

  useEffect(() => {
    primeGalleryCacheSync();
    refresh();

    scheduleAfterCommit(() => {
      if (isGalleryStoreReady()) {
        setStoreReady(true);
      }
    });

    const hydrateTimeout = window.setTimeout(() => {
      setStoreReady(true);
    }, 4000);

    void initGalleryStore()
      .then(() => {
        refresh();
        setStoreReady(true);
        if (!serverGalleryMergeAttempted) {
          serverGalleryMergeAttempted = true;
          // Opportunistic, non-destructive merge — picks up entries appended
          // server-side (e.g. headless scheduled batch) without requiring the
          // manual storage-conflict flow. No-ops when server storage is disabled.
          void pullAndMergeGalleryFromServer().then(result => {
            if (result.changed) {
              refresh();
            }
          });
        }
      })
      .catch(() => {
        setStoreReady(true);
      });

    let frameId = 0;
    const handler = () => {
      if (frameId !== 0) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        refresh();
      });
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, handler);
    return () => {
      window.clearTimeout(hydrateTimeout);
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, handler);
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [refresh]);

  useEffect(() => {
    const query = filter.query?.trim();
    if (!filter.semanticSearch || !query) {
      scheduleAfterCommit(() => {
        setEmbeddingRankIds(null);
        setEmbeddingSearchLoading(false);
        setEmbeddingSearchUnavailable(false);
      });
      return;
    }

    scheduleAfterCommit(() => {
      setEmbeddingSearchLoading(true);
    });

    const candidates = filterComfyGalleryEntries(entries, {
      ...filter,
      semanticSearch: false,
      similarToEntryId: undefined,
    });

    void fetchEmbeddingRankIds(
      query,
      candidates.map(entry => ({ id: entry.id, text: galleryEntryCorpus(entry) })),
      loadSettingsCache().shared.sessionLlmEmbedModel
    )
      .then(ids => {
        setEmbeddingRankIds(ids);
        setEmbeddingSearchUnavailable(ids === null && candidates.length > 0);
      })
      .finally(() => setEmbeddingSearchLoading(false));
  }, [
    entries,
    filter.query,
    filter.semanticSearch,
    filter.status,
    filter.tool,
    filter.model,
    filter.minRating,
    filter.atRiskOnly,
    filter.favoritesOnly,
    filter.projectId,
    filter.unreviewedOnly,
    filter.mediaKind,
    filter.visionTagsOnly,
    filter.focusEntryId,
    filter.derivativeOfEntryId,
    filter.derivedKind,
    filter.duplicatesOnly,
    filter.needsVisionReview,
    filter.userTag,
  ]);

  useEffect(() => {
    const referenceId = filter.similarToEntryId;
    if (!referenceId) {
      scheduleAfterCommit(() => {
        setSimilarRankIds(null);
        setSimilarSearchLoading(false);
      });
      return;
    }

    const reference = entries.find(entry => entry.id === referenceId);
    if (!reference) {
      scheduleAfterCommit(() => {
        setSimilarRankIds(null);
        setSimilarSearchLoading(false);
      });
      return;
    }

    const candidates = entries.filter(entry => entry.id !== referenceId);
    const visual = filter.similarMode === 'visual';
    scheduleAfterCommit(() => {
      setSimilarSearchLoading(true);
    });
    void fetchEmbeddingRankIds(
      visual ? galleryVisualCorpus(reference) : reference.prompt,
      candidates.map(entry => ({
        id: entry.id,
        text: visual ? galleryVisualCorpus(entry) : galleryEntryCorpus(entry),
      })),
      loadSettingsCache().shared.sessionLlmEmbedModel
    )
      .then(setSimilarRankIds)
      .finally(() => setSimilarSearchLoading(false));
  }, [entries, filter.similarToEntryId, filter.similarMode]);

  const filteredEntries = useMemo(() => {
    const query = filter.query?.trim();

    if (query && filter.semanticSearch) {
      let base = filterComfyGalleryEntries(entries, {
        ...filter,
        semanticSearch: false,
        similarToEntryId: undefined,
      });
      if (embeddingRankIds?.length) {
        base = sortByRankIds(base, embeddingRankIds);
      } else {
        base = filterComfyGalleryEntries(entries, filter);
      }
      if (filter.similarToEntryId) {
        const reference = entries.find(entry => entry.id === filter.similarToEntryId);
        if (reference && similarRankIds?.length) {
          return sortByRankIds(
            base.filter(entry => entry.id !== reference.id),
            similarRankIds
          );
        }
      }
      return base;
    }

    let base = filterComfyGalleryEntries(entries, { ...filter, similarToEntryId: undefined });
    if (filter.similarToEntryId) {
      const reference = entries.find(entry => entry.id === filter.similarToEntryId);
      if (reference) {
        if (similarRankIds?.length) {
          base = sortByRankIds(
            base.filter(entry => entry.id !== reference.id),
            similarRankIds
          );
        } else {
          base = filterComfyGalleryEntries(entries, filter);
        }
      }
    }
    return base;
  }, [entries, filter, embeddingRankIds, similarRankIds]);

  const tools = useMemo(() => uniqueGalleryTools(entries), [entries]);
  const models = useMemo(() => uniqueGalleryModels(entries), [entries]);
  const castIds = useMemo(() => uniqueGalleryCastIds(entries), [entries]);
  const hasPlayChecks = useMemo(() => entries.some(entry => Boolean(entry.playChecks)), [entries]);
  const userTags = useMemo(() => uniqueGalleryUserTags(entries), [entries]);
  const customGroups = useMemo(() => uniqueGalleryCustomGroups(entries), [entries]);

  const removeEntry = useCallback(
    (id: string) => {
      removeComfyGalleryEntry(id);
      refresh();
    },
    [refresh]
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      toggleComfyGalleryFavorite(id);
      refresh();
    },
    [refresh]
  );

  const removeEntries = useCallback(
    (ids: string[]) => {
      removeComfyGalleryEntries(ids);
      refresh();
    },
    [refresh]
  );

  const setFavorites = useCallback(
    (ids: string[], favorite: boolean) => {
      setComfyGalleryFavorites(ids, favorite);
      refresh();
    },
    [refresh]
  );

  const setReviewRatings = useCallback(
    (ids: string[], rating: ComfyGalleryEntry['reviewRating']) => {
      setComfyGalleryReviewRatings(ids, rating);
      refresh();
    },
    [refresh]
  );

  const setUserTags = useCallback(
    (ids: string[], tags: string[], mode: 'add' | 'replace' | 'remove' = 'add') => {
      setComfyGalleryUserTags(ids, tags, mode);
      refresh();
    },
    [refresh]
  );

  const setCustomGroups = useCallback(
    (ids: string[], groupName: string | undefined) => {
      setComfyGalleryCustomGroups(ids, groupName);
      refresh();
    },
    [refresh]
  );

  const renameCustomGroup = useCallback(
    (from: string, to: string) => {
      const changed = renameComfyGalleryCustomGroup(from, to);
      if (changed > 0) {
        refresh();
      }
      return changed;
    },
    [refresh]
  );

  const deleteCustomGroup = useCallback(
    (name: string) => {
      const changed = deleteComfyGalleryCustomGroup(name);
      if (changed > 0) {
        refresh();
      }
      return changed;
    },
    [refresh]
  );

  const clearAll = useCallback(() => {
    clearComfyGallery();
    refresh();
  }, [refresh]);

  const refreshPending = useCallback(async () => {
    const pending = loadComfyGallery().filter(
      entry => entry.status === 'pending' || entry.status === 'running'
    );

    await Promise.all(
      pending.map(entry => scheduleComfyGalleryPoll(entry.promptId, { comfyUrl: entry.comfyUrl }))
    );

    refresh();
  }, [refresh]);

  const setReviewRating = useCallback(
    (id: string, rating: ComfyGalleryEntry['reviewRating']) => {
      setGalleryReviewRating(id, rating);
      refresh();
    },
    [refresh]
  );

  const setProjectIds = useCallback(
    (ids: string[], projectId: string | undefined) => {
      setComfyGalleryProjectIds(ids, projectId);
      refresh();
    },
    [refresh]
  );

  return {
    storeReady,
    entries,
    filteredEntries,
    filter,
    setFilter,
    tools,
    models,
    castIds,
    hasPlayChecks,
    userTags,
    customGroups,
    refresh,
    removeEntry,
    removeEntries,
    toggleFavorite,
    setFavorites,
    setReviewRatings,
    setUserTags,
    setCustomGroups,
    renameCustomGroup,
    deleteCustomGroup,
    setProjectIds,
    clearAll,
    refreshPending,
    primaryViewUrl: galleryEntryPrimaryViewUrl,
    primaryThumbUrl: galleryEntryPrimaryThumbUrl,
    setReviewRating,
    embeddingSearchActive: Boolean(
      filter.semanticSearch && filter.query?.trim() && embeddingRankIds?.length
    ),
    similarSearchActive: Boolean(filter.similarToEntryId && similarRankIds?.length),
    embeddingSearchLoading,
    similarSearchLoading,
    embeddingSearchUnavailable,
  };
}
