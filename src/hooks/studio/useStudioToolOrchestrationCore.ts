'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useAuth, type AuthContextValue } from '@/hooks/useAuth';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { usePromptHistory } from '@/hooks/usePromptHistory';
import { DEFAULT_STUDIO_TOOL_CACHE } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import type { HistoryFilter } from '@/lib/history-filter';
import type { ScenePreset } from '@/lib/scene-presets';
import { applyCharacterIdentityBundle } from '@/lib/character-identity-bundle';
import type { VisualCompareResult } from '@/lib/visual-model-compare';
import { type UserPromptTemplate } from '@/lib/user-templates';
import type { ModelPortfolioItem } from '@/lib/model-portfolio';
import type { CampaignStepResult } from '@/lib/campaign-runner';
import { loadCampaignTemplates, type CampaignTemplate } from '@/lib/campaign-templates';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import { isStudioTabId, type StudioTabId } from '@/lib/studio-nav';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import type { CatalogClothing, CatalogLocation } from '@/components/studio/tabs/StudioCatalogTab';
import {
  loadUserSceneStarterPresets,
  type UserSceneStarterPreset,
} from '@/lib/user-scene-starter-presets';
import { type PromptProject } from '@/lib/prompt-projects';
import { useStudioToolOrchestrationDerived } from '@/hooks/studio/useStudioToolOrchestrationDerived';

type StudioTab = StudioTabId;

export function useStudioToolOrchestrationCore() {
  const workspaceMode = useWorkspaceMode();
  const auth = useAuth() ?? { _null: true };
  const isNullContext = (auth as { _null?: boolean })._null;
  const { authEnabled, user } = auth as AuthContextValue & { _null?: true };
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'studio',
    DEFAULT_STUDIO_TOOL_CACHE
  );
  const {
    entries,
    toggleFavorite,
    setRating,
    addTag,
    addTagToEntries,
    removeEntry,
    removeEntries,
    clearHistory,
  } = usePromptHistory();

  const [tab, setTab] = useState<StudioTab>('history');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogClothing, setCatalogClothing] = useState<CatalogClothing[]>([]);
  const [catalogLocations, setCatalogLocations] = useState<CatalogLocation[]>([]);
  const [compareHints, setCompareHints] = useState(
    'two female gravel cyclists in a fierce competition'
  );
  const [compareA, setCompareA] = useState<EnrichedToolGenerateResult | null>(null);
  const [compareB, setCompareB] = useState<EnrichedToolGenerateResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [visualCompareLoading, setVisualCompareLoading] = useState(false);
  const [visualCompareStatus, setVisualCompareStatus] = useState<string | null>(null);
  const [visualA, setVisualA] = useState<VisualCompareResult | null>(null);
  const [visualB, setVisualB] = useState<VisualCompareResult | null>(null);
  const [identityBundleName, setIdentityBundleName] = useState('');
  const [blocklist, setBlocklist] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>({});
  const [scenePresets, setScenePresets] = useState<ScenePreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetHints, setPresetHints] = useState('');
  const [userTemplates, setUserTemplates] = useState<UserPromptTemplate[]>([]);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [diffLeftId, setDiffLeftId] = useState('');
  const [diffRightId, setDiffRightId] = useState('');
  const [copiedPresetShareId, setCopiedPresetShareId] = useState<string | null>(null);
  const [highlightHistoryId, setHighlightHistoryId] = useState<string | null>(null);
  const [projects, setProjects] = useState<PromptProject[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | undefined>();
  const [projectName, setProjectName] = useState('');
  const [projectNotes, setProjectNotes] = useState('');
  const [sharedProjects, setSharedProjects] = useState<
    Array<{ id: string; name: string; notes?: string }>
  >([]);
  const [presetPackName, setPresetPackName] = useState('');
  const [sceneStarterPackName, setSceneStarterPackName] = useState('');
  const [userSceneStarters, setUserSceneStarters] = useState<UserSceneStarterPreset[]>([]);
  const [portfolioDraft, setPortfolioDraft] = useState('');
  const [portfolioModels, setPortfolioModels] = useState(
    'qwen-image-2512, flux-2-klein, sdxl-base-1.0'
  );
  const [portfolioItems, setPortfolioItems] = useState<ModelPortfolioItem[]>([]);
  const [portfolioStatus, setPortfolioStatus] = useState<string | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [galleryRevision, setGalleryRevision] = useState(0);
  const [scopeRevision, setScopeRevision] = useState(0);
  const [campaignTarget, setCampaignTarget] = useState<'random-scene' | 'topics'>('random-scene');
  const [campaignCount, setCampaignCount] = useState(4);
  const [campaignGenre, setCampaignGenre] = useState('');
  const [campaignTopics, setCampaignTopics] = useState('');
  const [campaignQueue, setCampaignQueue] = useState(true);
  const [campaignBestOfN, setCampaignBestOfN] = useState(1);
  const [campaignBestOfNVision, setCampaignBestOfNVision] = useState(false);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null);
  const [campaignResults, setCampaignResults] = useState<CampaignStepResult[]>([]);
  const [campaignTemplates, setCampaignTemplates] = useState<CampaignTemplate[]>([]);
  const [campaignTemplateName, setCampaignTemplateName] = useState('');
  const [iterationDiffLeftId, setIterationDiffLeftId] = useState('');
  const [iterationDiffRightId, setIterationDiffRightId] = useState('');
  const [iterationDiff, setIterationDiff] = useState<
    import('@/lib/iteration-branch-diff').BranchDiffResult | null
  >(null);

  const actions = usePromptResultActions({
    tool: 'studio',
    model: shared.model,
    detail: shared.detail,
  });

  useEffect(() => {
    scheduleAfterCommit(() => {
      setCampaignTemplates(loadCampaignTemplates());
    });
  }, []);

  const derived = useStudioToolOrchestrationDerived({
    tab,
    setTab,
    catalogClothing,
    catalogLocations,
    historyFilter,
    activeProjectId,
    entries,
    toolSettings,
    userTemplates,
    galleryRevision,
    scopeRevision,
    setGalleryRevision,
    setBlocklist,
    setScenePresets,
    setUserSceneStarters,
    setUserTemplates,
    setProjects,
    setActiveProjectIdState,
    setSharedProjects,
    setHighlightHistoryId,
    iterationDiffLeftId,
    iterationDiffRightId,
    setIterationDiff,
  });

  const applyIdentityBundle = useCallback(
    (bundle: import('@/lib/character-identity-bundle').CharacterIdentityBundle) => {
      const patch = applyCharacterIdentityBundle(bundle);
      updateShared({
        model: patch.model ?? shared.model,
        detail: patch.detail ?? shared.detail,
        lockedWardrobeId: patch.lockedWardrobeId,
        lockedLocation: patch.lockedLocation,
        lockedVariationSeed: patch.lockedVariationSeed,
        alwaysIncludeClothing: patch.alwaysIncludeClothing,
        activeCharacterDescriptor: patch.activeCharacterDescriptor,
        ipAdapterImageFilename: patch.ipAdapterImageFilename,
        ipAdapterSource: undefined,
        ipAdapterStrength: patch.ipAdapterStrength,
        ipAdapterModelFilename: patch.ipAdapterModelFilename,
      });
      if (patch.hints) {
        setCompareHints(patch.hints);
        setPresetHints(patch.hints);
      }
      setIdentityBundleName(bundle.name);
    },
    [shared.detail, shared.model, updateShared]
  );

  return {
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
    iterationDiff,
    actions,
    filteredEntries: derived.filteredEntries,
    sortedCatalogClothing: derived.sortedCatalogClothing,
    sortedCatalogLocations: derived.sortedCatalogLocations,
    iterationForest: derived.iterationForest,
    galleryLineageClusters: derived.galleryLineageClusters,
    favoriteEntries: derived.favoriteEntries,
    template: derived.template,
    filledTemplate: derived.filledTemplate,
    ratingTokenStats: derived.ratingTokenStats,
    historyAnalytics: derived.historyAnalytics,
    galleryAnalytics: derived.galleryAnalytics,
    iterationEntries: derived.iterationEntries,
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
  };
}

export type StudioToolOrchestrationCore = ReturnType<typeof useStudioToolOrchestrationCore>;
