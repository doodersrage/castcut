'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  filterOpenRouterFreeEntries,
  normalizeSessionLlmProvider,
  type LlmCatalogEntry,
  type SessionLlmProvider,
} from '@/lib/llm/providers';
import type { SharedToolSettings } from '@/lib/settings/cache';
import {
  catalogEntriesFromPayload,
  fetchLlmCatalog,
  type LlmCatalogResponse,
} from '@/components/settings/panels/llm-panel-shared';

export function useLlmCatalog(sharedSettings: SharedToolSettings) {
  const sessionProvider = normalizeSessionLlmProvider(sharedSettings.sessionLlmProvider);
  const [catalogEntries, setCatalogEntries] = useState<LlmCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | undefined>();
  const [catalogSource, setCatalogSource] = useState<string | undefined>();
  const [catalogNeedsKey, setCatalogNeedsKey] = useState(false);
  const [showOpenRouterAll, setShowOpenRouterAll] = useState(false);

  const applyCatalogResponse = useCallback((payload: LlmCatalogResponse) => {
    setCatalogEntries(catalogEntriesFromPayload(payload));
    setCatalogSource(payload.source && payload.source !== 'none' ? payload.source : undefined);
    setCatalogNeedsKey(payload.needsApiKey === true);
    setCatalogError(payload.ok === false ? payload.error || 'Could not list models' : undefined);
  }, []);

  const applyCatalogFailure = useCallback((error: unknown) => {
    setCatalogEntries([]);
    setCatalogSource(undefined);
    setCatalogNeedsKey(false);
    setCatalogError(error instanceof Error ? error.message : 'Could not list models');
  }, []);

  const loadCatalog = useCallback(
    async (apiKey?: string) => {
      setCatalogLoading(true);
      try {
        applyCatalogResponse(await fetchLlmCatalog(sessionProvider, apiKey));
      } catch (error) {
        applyCatalogFailure(error);
      } finally {
        setCatalogLoading(false);
      }
    },
    [applyCatalogFailure, applyCatalogResponse, sessionProvider]
  );

  useEffect(() => {
    let cancelled = false;
    fetchLlmCatalog(sessionProvider)
      .then(payload => {
        if (!cancelled) {
          applyCatalogResponse(payload);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          applyCatalogFailure(error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyCatalogFailure, applyCatalogResponse, sessionProvider]);

  const visibleEntries =
    sessionProvider === 'openrouter' && !showOpenRouterAll
      ? filterOpenRouterFreeEntries(catalogEntries)
      : catalogEntries;
  const selectedIds = [
    sharedSettings.sessionLlmModel,
    sharedSettings.sessionLlmVisionModel,
    sharedSettings.sessionLlmEmbedModel,
  ].filter((id): id is string => Boolean(id?.trim()));
  const catalogForSelect = (() => {
    if (visibleEntries.length === catalogEntries.length) {
      return catalogEntries;
    }
    const extra = catalogEntries.filter(
      entry => selectedIds.includes(entry.id) && !visibleEntries.some(item => item.id === entry.id)
    );
    return extra.length > 0 ? [...visibleEntries, ...extra] : visibleEntries;
  })();

  function resetOpenRouterFilter(provider: SessionLlmProvider) {
    if (provider !== 'openrouter') {
      setShowOpenRouterAll(false);
    }
  }

  return {
    sessionProvider,
    catalogEntries,
    catalogForSelect,
    catalogLoading,
    catalogError,
    catalogSource,
    catalogNeedsKey,
    showOpenRouterAll,
    setShowOpenRouterAll,
    loadCatalog,
    resetOpenRouterFilter,
    setCatalogLoading,
  };
}
