'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useAuth, type AuthContextValue } from '@/hooks/useAuth';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { loadLocationBlocklist, usePromptHistory } from '@/hooks/usePromptHistory';
import { DEFAULT_STUDIO_TOOL_CACHE } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { toastHeldMax } from '@/lib/app-toast';
import { filterHistoryEntries, type HistoryFilter } from '@/lib/history-filter';
import { loadScenePresets, type ScenePreset } from '@/lib/scene-presets';
import { applyPromptTemplate, getAllPromptTemplates } from '@/lib/prompt-templates';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { applyCharacterIdentityBundle } from '@/lib/character-identity-bundle';
import type { VisualCompareResult } from '@/lib/visual-model-compare';
import { diffPromptWords } from '@/lib/prompt-diff';
import {
  loadUserTemplates,
  templateFromPrompt,
  upsertUserTemplate,
  type UserPromptTemplate,
} from '@/lib/user-templates';
import { sortCatalogByRatingBias } from '@/lib/catalog-rating-bias';
import { buildPromptIterationForest } from '@/lib/prompt-iteration-tree';
import {
  loadActiveProjectId,
  loadPromptProjects,
  setActiveProjectId,
  type PromptProject,
} from '@/lib/prompt-projects';
import {
  loadUserSceneStarterPresets,
  type UserSceneStarterPreset,
} from '@/lib/user-scene-starter-presets';
import type { ModelPortfolioItem } from '@/lib/model-portfolio';
import type { RatedTokenStat } from '@/lib/rating-token-analytics';
import type { UserHistoryAnalytics } from '@/lib/user-analytics';
import { EMPTY_GALLERY_STATS, type GalleryStats } from '@/lib/gallery-stats';
import { USER_SCOPE_CHANGED_EVENT } from '@/lib/user-scope';
import { loadComfyGallery, COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery';
import { buildGalleryLineageGroups } from '@/lib/gallery-lineage-groups';
import type { CampaignStepResult } from '@/lib/campaign-runner';
import {
  deleteCampaignTemplate,
  loadCampaignTemplates,
  upsertCampaignTemplate,
  type CampaignTemplate,
} from '@/lib/campaign-templates';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import type { BranchDiffResult } from '@/lib/iteration-branch-diff';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import { isStudioTabId, studioTabGroupsForWorkspaceMode, type StudioTabId } from '@/lib/studio-nav';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import type { CatalogClothing, CatalogLocation } from '@/components/studio/tabs/StudioCatalogTab';

type StudioTab = StudioTabId;

import type { StudioToolOrchestrationCore } from '@/hooks/studio/useStudioToolOrchestrationCore';

export function useStudioToolOrchestrationPart2(ctx: StudioToolOrchestrationCore) {
  const {
    workspaceMode,
    auth,
    isNullContext,
    authEnabled,
    user,
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    tab,
    catalogQuery,
    setCatalogQuery,
    catalogLoading,
    catalogError,
    catalogClothing,
    catalogLocations,
    compareHints,
    setCompareHints,
    compareA,
    compareB,
    compareLoading,
    compareError,
    visualCompareLoading,
    visualCompareStatus,
    visualA,
    visualB,
    identityBundleName,
    setIdentityBundleName,
    blocklist,
    setBlocklist,
    copied,
    backupStatus,
    setBackupStatus,
    historyFilter,
    setHistoryFilter,
    scenePresets,
    setScenePresets,
    presetName,
    setPresetName,
    presetHints,
    setPresetHints,
    userTemplates,
    setUserTemplates,
    customTemplateName,
    setCustomTemplateName,
    diffLeftId,
    setDiffLeftId,
    diffRightId,
    setDiffRightId,
    copiedPresetShareId,
    setCopiedPresetShareId,
    highlightHistoryId,
    setHighlightHistoryId,
    projects,
    setProjects,
    activeProjectId,
    setActiveProjectIdState,
    projectName,
    setProjectName,
    projectNotes,
    setProjectNotes,
    sharedProjects,
    setSharedProjects,
    presetPackName,
    setPresetPackName,
    sceneStarterPackName,
    setSceneStarterPackName,
    userSceneStarters,
    setUserSceneStarters,
    portfolioDraft,
    setPortfolioDraft,
    portfolioModels,
    setPortfolioModels,
    portfolioItems,
    setPortfolioItems,
    portfolioStatus,
    setPortfolioStatus,
    portfolioLoading,
    setPortfolioLoading,
    setGalleryRevision,
    campaignTarget,
    setCampaignTarget,
    campaignCount,
    setCampaignCount,
    campaignGenre,
    setCampaignGenre,
    campaignTopics,
    setCampaignTopics,
    campaignQueue,
    setCampaignQueue,
    campaignBestOfN,
    setCampaignBestOfN,
    campaignBestOfNVision,
    setCampaignBestOfNVision,
    campaignLoading,
    setCampaignLoading,
    campaignStatus,
    setCampaignStatus,
    campaignResults,
    setCampaignResults,
    campaignTemplates,
    setCampaignTemplates,
    campaignTemplateName,
    setCampaignTemplateName,
    iterationDiffLeftId,
    setIterationDiffLeftId,
    iterationDiffRightId,
    setIterationDiffRightId,
    ratingTokenStats,
    historyAnalytics,
    galleryAnalytics,
    iterationEntries,
    iterationDiff,
    actions,
    filteredEntries,
    sortedCatalogClothing,
    sortedCatalogLocations,
    iterationForest,
    galleryLineageClusters,
    favoriteEntries,
    template,
    filledTemplate,
    entries,
    toggleFavorite,
    setRating,
    addTag,
    addTagToEntries,
    removeEntry,
    removeEntries,
    clearHistory,
    setTab,
    setCatalogLoading,
    setCatalogError,
    setCatalogClothing,
    setCatalogLocations,
    setCompareA,
    setCompareB,
    setCompareLoading,
    setCompareError,
    setVisualCompareLoading,
    setVisualCompareStatus,
    setVisualA,
    setVisualB,
    setCopied,
    applyIdentityBundle,
  } = ctx;

  const openCharacterWithIdentity = useCallback(
    (bundle: import('@/lib/character-identity-bundle').CharacterIdentityBundle) => {
      applyIdentityBundle(bundle);
      window.location.href = '/character';
    },
    [applyIdentityBundle]
  );

  const selectStudioTab = useCallback((next: StudioTab) => {
    setTab(next);
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    if (next === 'history') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', next);
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  const loadCatalog = useCallback(async (query: string) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '?limit=80';
      const response = await fetch(`/api/catalog${params}`);
      if (!response.ok) {
        throw new Error('Could not load catalog data.');
      }
      const data = (await response.json()) as {
        clothing?: CatalogClothing[];
        locations?: CatalogLocation[];
      };
      setCatalogClothing(data.clothing ?? []);
      setCatalogLocations(data.locations ?? []);
    } catch (err) {
      setCatalogClothing([]);
      setCatalogLocations([]);
      setCatalogError(err instanceof Error ? err.message : 'Could not load catalog data.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'catalog') {
      scheduleAfterCommit(() => {
        void loadCatalog(catalogQuery);
      });
    }
  }, [tab, catalogQuery, loadCatalog]);

  const runCompare = useCallback(async () => {
    setCompareLoading(true);
    setCompareError(null);
    try {
      const payload = {
        hints: compareHints,
        portraitStyle: 'action' as const,
        presetOptions: { headcount: 'duo' as const },
      };

      const [responseA, responseB] = await Promise.all([
        fetch('/api/duo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, model: shared.model, detail: shared.detail }),
        }),
        fetch('/api/duo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            model: toolSettings.compareModelB ?? 'flux-2-klein',
            detail: shared.detail,
          }),
        }),
      ]);

      if (!responseA.ok || !responseB.ok) {
        throw new Error('Model comparison failed. Check your settings and try again.');
      }

      setCompareA((await responseA.json()) as EnrichedToolGenerateResult);
      setCompareB((await responseB.json()) as EnrichedToolGenerateResult);
    } catch (err) {
      setCompareA(null);
      setCompareB(null);
      setCompareError(err instanceof Error ? err.message : 'Model comparison failed.');
    } finally {
      setCompareLoading(false);
    }
  }, [compareHints, shared, toolSettings.compareModelB]);

  const runVisualCompare = useCallback(async () => {
    if (!compareA?.prompt?.trim()) {
      setCompareError('Run text compare first to get a shared prompt.');
      return;
    }

    setVisualCompareLoading(true);
    setVisualCompareStatus('Queueing visual compare…');
    setVisualA(null);
    setVisualB(null);
    try {
      const { runVisualModelCompare } = await import('@/lib/visual-model-compare');
      const result = await runVisualModelCompare({
        prompt: compareA.prompt,
        modelA: shared.model,
        modelB: (toolSettings.compareModelB ?? 'flux-2-klein') as ComfyImageModel,
        hints: compareHints,
        onStatus: setVisualCompareStatus,
      });
      setVisualA(result.a);
      setVisualB(result.b);
      const heldCount = [result.a, result.b].filter(side => side.held).length;
      if (heldCount > 0) {
        toastHeldMax({
          text: 'Max visual compare held until ComfyUI is idle',
          count: heldCount,
        });
        setVisualCompareStatus(`Visual compare · held ${heldCount} Max until idle`);
      } else {
        setVisualCompareStatus('Visual compare finished.');
      }
    } catch (err) {
      setVisualCompareStatus(err instanceof Error ? err.message : 'Visual compare failed.');
    } finally {
      setVisualCompareLoading(false);
    }
  }, [compareA, compareHints, shared.model, toolSettings.compareModelB]);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard refused (permissions, insecure origin) — not an unhandled page error.
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleImportBackup = useCallback(async (file: File) => {
    try {
      const raw = await file.text();
      const { importStudioBackup, parseStudioBackupFile } = await import('@/lib/studio-backup');
      importStudioBackup(parseStudioBackupFile(raw));
      setBlocklist(loadLocationBlocklist());
      setScenePresets(loadScenePresets());
      setUserTemplates(loadUserTemplates());
      setBackupStatus('Backup imported. Reload tabs to see restored settings.');
    } catch (err) {
      setBackupStatus(err instanceof Error ? err.message : 'Import failed.');
    }
  }, []);

  const diffLeft = useMemo(
    () => entries.find(entry => entry.id === diffLeftId) ?? null,
    [entries, diffLeftId]
  );
  const diffRight = useMemo(
    () => entries.find(entry => entry.id === diffRightId) ?? null,
    [entries, diffRightId]
  );
  const promptDiff = useMemo(() => {
    if (!diffLeft || !diffRight) {
      return null;
    }
    return diffPromptWords(diffLeft.prompt, diffRight.prompt);
  }, [diffLeft, diffRight]);

  const tabGroups: { label: string; tabs: { id: StudioTab; label: string }[] }[] = useMemo(
    () =>
      studioTabGroupsForWorkspaceMode(workspaceMode).map(group => ({
        label: group.label,
        tabs: group.tabs.map(tabDef => ({
          id: tabDef.id,
          label: tabDef.label,
        })),
      })),
    [workspaceMode]
  );

  const visibleTabIds = useMemo(
    () => new Set(tabGroups.flatMap(group => group.tabs.map(entry => entry.id))),
    [tabGroups]
  );

  useEffect(() => {
    if (!visibleTabIds.has(tab)) {
      scheduleAfterCommit(() => {
        setTab('history');
      });
    }
  }, [tab, visibleTabIds]);

  return {
    openCharacterWithIdentity,
    selectStudioTab,
    loadCatalog,
    runCompare,
    runVisualCompare,
    copyText,
    handleImportBackup,
    diffLeft,
    diffRight,
    promptDiff,
    tabGroups,
    visibleTabIds,
  };
}
