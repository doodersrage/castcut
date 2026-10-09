/**
 * Durable studio state that is not settings / history / gallery.
 * Synced to PROMPT_DATA_DIR as the `studio-extras` namespace.
 */
import { loadPoseLibrary, mergePoseLibraries, replacePoseLibrary } from './pose-library';
import { pruneDeadCollapsibleIds } from './dead-settings';
import {
  applyServerPoseOutcomeStats,
  loadPoseOutcomeStats,
  poseOutcomeStatsForSync,
  type PoseOutcomeStats,
} from './pose-outcome-stats';
import { loadSavedFootwear, replaceSavedFootwear, type SavedFootwear } from '@/lib/footwear-saved';
import { loadMyPoses, replaceMyPoses, type MyPose } from '@/lib/my-poses';
import {
  readBrowserValue,
  withSuppressedDurableSyncPush,
  writeBrowserValue,
  writeBrowserString,
} from './browser-storage';
import { loadLocationBlocklist, saveLocationBlocklist } from './prompt-history';
import { loadScenePresets, saveScenePresets } from './scene-presets';
import { loadUserTemplates, saveUserTemplates } from './user-templates';
import { loadComfyUiSettings, saveComfyUiSettings } from './comfyui-settings';
import {
  loadComfyWorkflowFiles,
  loadDeletedComfyWorkflowFiles,
  saveComfyWorkflowFiles,
  saveDeletedComfyWorkflowFiles,
} from './comfyui-workflow-files';
import { loadComfyWorkflowPresets, saveComfyWorkflowPresets } from './comfyui-workflow-presets';
import { exportAvoidedTokenList, saveAvoidedTokens } from './avoided-tokens';
import { loadWebhookLog, WEBHOOK_LOG_KEY, type WebhookLogEntry } from './webhook-log';
import {
  loadActiveProjectId,
  loadPromptProjects,
  savePromptProjects,
  setActiveProjectId,
} from './prompt-projects';
import {
  loadScheduledBatchConfig,
  saveScheduledBatchConfig,
  type ScheduledBatchConfig,
} from './scheduled-batch';
import { loadWebhookSettings, saveWebhookSettings, type WebhookSettings } from './webhook-settings';
import { loadSessionRecipes, saveSessionRecipes } from './session-recipes';
import {
  loadNsfwPresetPrefs,
  loadUserNsfwGeneratorPresets,
  saveNsfwPresetPrefs,
  saveUserNsfwGeneratorPresets,
} from './user-nsfw-generator-presets';
import {
  loadUserSceneStarterPresets,
  saveUserSceneStarterPresets,
} from './user-scene-starter-presets';
import { loadPromptRecipes, savePromptRecipes } from './prompt-recipes';
import { loadCampaignTemplates, saveCampaignTemplates } from './campaign-templates';
import { loadGallerySavedViews, saveGallerySavedViews } from './gallery-saved-views';
import { loadHistorySavedViews, saveHistorySavedViews } from './history-saved-views';
import { loadGalleryViewPreferences, saveGalleryViewPreferences } from './comfyui-gallery';
import {
  loadGalleryLightboxUiPreferences,
  saveGalleryLightboxUiPreferences,
} from './gallery-lightbox-prefs';
import { loadGalleryDensity, saveGalleryDensity } from './gallery-density';
import { loadHistoryDensity, saveHistoryDensity } from './history-density';
import { loadPluginOriginAllowlist, savePluginOriginAllowlist } from './plugin-origin-allowlist';
import { loadKeyboardShortcuts, saveKeyboardShortcuts } from './keyboard-shortcuts-store';
import { loadNavFavorites, saveNavFavorites } from './nav-favorites';
import { loadQueueParamsSettings, saveQueueParamsSettings } from './queue-params-settings';
import { loadWorkflowPresetPacks, saveWorkflowPresetPacks } from './workflow-preset-packs';
import {
  EXPERIMENT_WINNERS_KEY,
  loadExperimentWinners,
  type ExperimentWinnerRecord,
} from './experiment-winners';
import {
  loadGalleryEloStore,
  replaceGalleryEloStore,
  type GalleryEloRecord,
} from './gallery-elo-store';
import { CATALOG_RATING_BIAS_KEY } from './catalog-rating-bias';
import { loadNegativeSuggestions, saveNegativeSuggestions } from './negative-learner';
import {
  saveCustomToolPlugins,
  TOOL_PLUGIN_REGISTRY_KEY,
  type ToolPlugin,
} from './tool-plugin-registry';
import {
  loadPluginQueueHooks,
  savePluginQueueHooks,
  type PluginQueueHook,
} from './plugin-queue-hooks';
import {
  hasChosenWorkspaceMode,
  loadWorkspaceMode,
  saveWorkspaceMode,
  type WorkspaceMode,
} from './workspace-mode';
import { loadExpandedNavGroups, saveExpandedNavGroups } from './nav-expanded-groups';
import { loadRecentDestinations, type RecentDestination } from './recent-destinations';
import {
  loadToolContextMemory,
  saveToolContextMemory,
  type ToolContextMemoryMap,
} from './tool-context-memory';
import { loadLastToolDraft, type ToolDraftSummary } from './tool-draft-memory';
import {
  LAST_FAILED_QUEUE_KEY,
  loadLastFailedQueue,
  saveLastFailedQueue,
  type LastFailedQueuePayload,
} from './last-failed-queue';
import { listHeldMaxJobs, replaceHeldMaxJobs, type HeldMaxJob } from './held-max-queue';
import { loadLastToolRoute, saveLastToolRoute } from './last-tool-route';
import { loadCharacters, saveCharacters, type CharacterRecord } from './character-os';
import { FIRST_QUEUE_SETUP_DISMISS_KEY } from './first-queue-setup';
import { loadNotifications, type AppNotification } from './notification-center';
import {
  LOCAL_OBSERVABILITY_KEY,
  loadLocalObservability,
  type LocalObservabilityCounters,
} from './local-observability';
import { STUDIO_BACKUP_LAST_EXPORT_KEY } from './studio-backup-meta';
import { loadAppTheme, saveAppTheme, type AppTheme } from './theme-store';
import {
  loadAmbientIntensity,
  saveAmbientIntensity,
  type AmbientIntensity,
} from './ambient-settings';
import { loadUiDensity, saveUiDensity, type UiDensity } from './density-settings';
import { loadCalmUi, saveCalmUi } from './calm-settings';

const ONBOARDING_KEY = 'comfy-onboarding-v2';
const COLLAPSIBLE_KEY = 'comfy-collapsible-open-v1';
const RECENT_DESTINATIONS_KEY = 'comfy-recent-destinations-v1';
const TOOL_DRAFT_KEY = 'comfy-last-tool-draft-v1';
const NOTIFICATIONS_KEY = 'comfy-notification-center-v1';
const WORKSPACE_CHOSEN_KEY = 'comfy-workspace-mode-chosen-v1';

export type StudioExtrasPayload = {
  updatedAt: number;
  locationBlocklist?: string[];
  scenePresets?: ReturnType<typeof loadScenePresets>;
  userTemplates?: ReturnType<typeof loadUserTemplates>;
  comfyUiSettings?: ReturnType<typeof loadComfyUiSettings>;
  comfyWorkflowPresets?: ReturnType<typeof loadComfyWorkflowPresets>;
  comfyWorkflowFiles?: ReturnType<typeof loadComfyWorkflowFiles>;
  comfyWorkflowTrash?: ReturnType<typeof loadDeletedComfyWorkflowFiles>;
  avoidedTokens?: string[];
  webhookLog?: WebhookLogEntry[];
  promptProjects?: ReturnType<typeof loadPromptProjects>;
  activeProjectId?: string;
  scheduledBatch?: ReturnType<typeof loadScheduledBatchConfig>;
  webhookSettings?: ReturnType<typeof loadWebhookSettings>;
  sessionRecipes?: ReturnType<typeof loadSessionRecipes>;
  userNsfwGeneratorPresets?: ReturnType<typeof loadUserNsfwGeneratorPresets>;
  nsfwPresetPrefs?: ReturnType<typeof loadNsfwPresetPrefs>;
  userSceneStarterPresets?: ReturnType<typeof loadUserSceneStarterPresets>;
  promptRecipes?: ReturnType<typeof loadPromptRecipes>;
  campaignTemplates?: ReturnType<typeof loadCampaignTemplates>;
  gallerySavedViews?: ReturnType<typeof loadGallerySavedViews>;
  historySavedViews?: ReturnType<typeof loadHistorySavedViews>;
  galleryViewPreferences?: ReturnType<typeof loadGalleryViewPreferences>;
  galleryLightboxPreferences?: ReturnType<typeof loadGalleryLightboxUiPreferences>;
  galleryDensity?: ReturnType<typeof loadGalleryDensity>;
  historyDensity?: ReturnType<typeof loadHistoryDensity>;
  pluginOriginAllowlist?: ReturnType<typeof loadPluginOriginAllowlist>;
  keyboardShortcuts?: ReturnType<typeof loadKeyboardShortcuts>;
  navFavorites?: ReturnType<typeof loadNavFavorites>;
  queueParams?: ReturnType<typeof loadQueueParamsSettings>;
  workflowPresetPacks?: ReturnType<typeof loadWorkflowPresetPacks>;
  experimentWinners?: Record<string, ExperimentWinnerRecord>;
  galleryElo?: Record<string, GalleryEloRecord>;
  catalogRatingBias?: { token: string; score: number }[];
  negativeLearner?: ReturnType<typeof loadNegativeSuggestions>;
  toolPluginRegistry?: ToolPlugin[];
  pluginQueueHooks?: PluginQueueHook[];
  onboardingDone?: Record<string, boolean>;
  workspaceMode?: WorkspaceMode;
  workspaceModeChosen?: boolean;
  navExpandedGroups?: string[];
  recentDestinations?: RecentDestination[];
  collapsibleOpen?: Record<string, boolean>;
  toolContextMemory?: ToolContextMemoryMap;
  lastToolDraft?: ToolDraftSummary | null;
  lastFailedQueue?: LastFailedQueuePayload | null;
  heldMaxJobs?: HeldMaxJob[];
  lastToolRoute?: string | null;
  firstQueueSetupDismissed?: boolean;
  notifications?: AppNotification[];
  localObservability?: LocalObservabilityCounters;
  studioBackupLastExport?: string | null;
  characters?: CharacterRecord[];
  /**
   * Story's saved stories (roleplay-library). Kept in the browser only, they never reached the
   * server: opening Story on another device, or a fresh browser, lost every story set aside when
   * the Cast changed.
   */
  roleplayLibrary?: StoredRoleplaySession[];
  /** Poses learned from kept stills (pose-library) — browser-only before. */
  poseLibrary?: import('./pose-library').PoseLibraryEntry[];
  /** What the player keeps per pose × engine (pose-outcome-stats) — counts per device. */
  poseOutcomes?: PoseOutcomeStats;
  appTheme?: AppTheme;
  ambientIntensity?: AmbientIntensity;
  uiDensity?: UiDensity;
  calmUi?: boolean;
  /**
   * Fields features add through registerStudioExtrasSection (Play: playMetrics,
   * playCampaignState, fittingSavedGarments, dressPlates — play-studio-extras.ts).
   */
  [featureField: string]: unknown;
  /** Saved shoe photos (the footwear picker's "Saved shoes"). */
  savedFootwear?: SavedFootwear[];
  /** "My poses" — dragged / photo skeletons saved by name. */
  myPoses?: MyPose[];
};

export function collectStudioExtras(): StudioExtrasPayload {
  return {
    updatedAt: Date.now(),
    locationBlocklist: loadLocationBlocklist(),
    scenePresets: loadScenePresets(),
    userTemplates: loadUserTemplates(),
    comfyUiSettings: loadComfyUiSettings(),
    comfyWorkflowPresets: loadComfyWorkflowPresets(),
    comfyWorkflowFiles: loadComfyWorkflowFiles(),
    comfyWorkflowTrash: loadDeletedComfyWorkflowFiles(),
    avoidedTokens: exportAvoidedTokenList(),
    webhookLog: loadWebhookLog(),
    promptProjects: loadPromptProjects(),
    activeProjectId: loadActiveProjectId(),
    scheduledBatch: loadScheduledBatchConfig(),
    webhookSettings: loadWebhookSettings(),
    sessionRecipes: loadSessionRecipes(),
    userNsfwGeneratorPresets: loadUserNsfwGeneratorPresets(),
    nsfwPresetPrefs: loadNsfwPresetPrefs(),
    userSceneStarterPresets: loadUserSceneStarterPresets(),
    promptRecipes: loadPromptRecipes(),
    campaignTemplates: loadCampaignTemplates(),
    gallerySavedViews: loadGallerySavedViews(),
    historySavedViews: loadHistorySavedViews(),
    galleryViewPreferences: loadGalleryViewPreferences(),
    galleryLightboxPreferences: loadGalleryLightboxUiPreferences(),
    galleryDensity: loadGalleryDensity(),
    historyDensity: loadHistoryDensity(),
    pluginOriginAllowlist: loadPluginOriginAllowlist(),
    keyboardShortcuts: loadKeyboardShortcuts(),
    navFavorites: loadNavFavorites(),
    queueParams: loadQueueParamsSettings(),
    workflowPresetPacks: loadWorkflowPresetPacks(),
    experimentWinners: loadExperimentWinners(),
    galleryElo: loadGalleryEloStore(),
    catalogRatingBias:
      readBrowserValue<{ token: string; score: number }[]>(CATALOG_RATING_BIAS_KEY) ?? [],
    negativeLearner: loadNegativeSuggestions(),
    toolPluginRegistry: readBrowserValue<ToolPlugin[]>(TOOL_PLUGIN_REGISTRY_KEY) ?? [],
    pluginQueueHooks: loadPluginQueueHooks(),
    onboardingDone: readBrowserValue<Record<string, boolean>>(ONBOARDING_KEY) ?? {},
    workspaceMode: loadWorkspaceMode(),
    workspaceModeChosen: hasChosenWorkspaceMode(),
    navExpandedGroups: loadExpandedNavGroups() ?? [],
    recentDestinations: loadRecentDestinations(),
    // Fold states of removed sections never go back to the server (see dead-settings).
    collapsibleOpen: pruneDeadCollapsibleIds(
      readBrowserValue<Record<string, boolean>>(COLLAPSIBLE_KEY) ?? {}
    ).map,
    toolContextMemory: loadToolContextMemory(),
    lastToolDraft: loadLastToolDraft(),
    lastFailedQueue: loadLastFailedQueue(),
    heldMaxJobs: listHeldMaxJobs(),
    lastToolRoute: loadLastToolRoute(),
    firstQueueSetupDismissed: readBrowserValue<boolean>(FIRST_QUEUE_SETUP_DISMISS_KEY) === true,
    notifications: loadNotifications(),
    localObservability: loadLocalObservability(),
    studioBackupLastExport: readBrowserValue<string>(STUDIO_BACKUP_LAST_EXPORT_KEY) ?? null,
    characters: loadCharacters(),
    roleplayLibrary: readStoredRoleplayLibrary(),
    poseLibrary: loadPoseLibrary(),
    poseOutcomes: poseOutcomeStatsForSync(loadPoseOutcomeStats()),
    appTheme: loadAppTheme(),
    ambientIntensity: loadAmbientIntensity(),
    uiDensity: loadUiDensity(),
    calmUi: loadCalmUi(),
    savedFootwear: loadSavedFootwear(),
    myPoses: loadMyPoses(),
    ...Object.assign({}, ...[...studioExtrasSections.values()].map(section => section.collect())),
  };
}

/**
 * A feature's own fields in the synced studio-extras payload (docs/architecture-boundaries.md).
 * `collect` adds its keys; `apply` reads them back inside the no-push-back block, with the same
 * guards the fields always had. Registered at app start, before the first sync.
 */
export type StudioExtrasSection = {
  collect: () => Record<string, unknown>;
  apply: (payload: StudioExtrasPayload) => void;
};

const studioExtrasSections = new Map<string, StudioExtrasSection>();

export function registerStudioExtrasSection(id: string, section: StudioExtrasSection): void {
  studioExtrasSections.set(id, section);
}

export function applyStudioExtras(payload: StudioExtrasPayload | null | undefined): void {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  withSuppressedDurableSyncPush(() => {
    if (payload.locationBlocklist) {
      saveLocationBlocklist(payload.locationBlocklist);
    }
    if (payload.scenePresets) {
      saveScenePresets(payload.scenePresets);
    }
    if (payload.userTemplates) {
      saveUserTemplates(payload.userTemplates);
    }
    if (payload.comfyUiSettings) {
      saveComfyUiSettings(payload.comfyUiSettings);
    }
    if (payload.comfyWorkflowPresets) {
      saveComfyWorkflowPresets(payload.comfyWorkflowPresets);
    }
    if (payload.comfyWorkflowFiles) {
      saveComfyWorkflowFiles(payload.comfyWorkflowFiles);
    }
    if (payload.comfyWorkflowTrash) {
      saveDeletedComfyWorkflowFiles(payload.comfyWorkflowTrash);
    }
    if (payload.avoidedTokens) {
      saveAvoidedTokens(payload.avoidedTokens);
    }
    if (payload.webhookLog) {
      writeBrowserValue(WEBHOOK_LOG_KEY, payload.webhookLog);
    }
    if (payload.promptProjects) {
      savePromptProjects(payload.promptProjects);
    }
    if ('activeProjectId' in payload) {
      setActiveProjectId(payload.activeProjectId);
    }
    if (payload.scheduledBatch) {
      saveScheduledBatchConfig(payload.scheduledBatch);
    }
    if (payload.webhookSettings) {
      saveWebhookSettings(payload.webhookSettings);
    }
    if (payload.sessionRecipes) {
      saveSessionRecipes(payload.sessionRecipes);
    }
    if (payload.characters) {
      saveCharacters(payload.characters);
    }
    if (payload.roleplayLibrary) {
      writeBrowserValue(ROLEPLAY_LIBRARY_STORAGE_KEY, payload.roleplayLibrary);
    }
    if (payload.poseLibrary) {
      replacePoseLibrary(mergePoseLibraries(loadPoseLibrary(), payload.poseLibrary));
    }
    // Merged per device, never replaced: a copy that has not caught up can't roll counts back.
    if (payload.poseOutcomes) {
      applyServerPoseOutcomeStats(payload.poseOutcomes);
    }
    if (payload.userNsfwGeneratorPresets) {
      saveUserNsfwGeneratorPresets(payload.userNsfwGeneratorPresets);
    }
    if (payload.nsfwPresetPrefs) {
      saveNsfwPresetPrefs(payload.nsfwPresetPrefs);
    }
    if (payload.userSceneStarterPresets) {
      saveUserSceneStarterPresets(payload.userSceneStarterPresets);
    }
    if (payload.promptRecipes) {
      savePromptRecipes(payload.promptRecipes);
    }
    if (payload.campaignTemplates) {
      saveCampaignTemplates(payload.campaignTemplates);
    }
    if (payload.gallerySavedViews) {
      saveGallerySavedViews(payload.gallerySavedViews);
    }
    if (payload.historySavedViews) {
      saveHistorySavedViews(payload.historySavedViews);
    }
    if (payload.galleryViewPreferences) {
      saveGalleryViewPreferences(payload.galleryViewPreferences);
    }
    if (payload.galleryLightboxPreferences) {
      saveGalleryLightboxUiPreferences(payload.galleryLightboxPreferences);
    }
    if (payload.galleryDensity) {
      saveGalleryDensity(payload.galleryDensity);
    }
    if (payload.historyDensity) {
      saveHistoryDensity(payload.historyDensity);
    }
    if (payload.pluginOriginAllowlist) {
      savePluginOriginAllowlist(payload.pluginOriginAllowlist);
    }
    if (payload.keyboardShortcuts) {
      saveKeyboardShortcuts(payload.keyboardShortcuts);
    }
    if (payload.navFavorites) {
      saveNavFavorites(payload.navFavorites);
    }
    // An empty list from the server never empties a local one: these are replaced whole, and a
    // copy that has not caught up yet would wipe shoes saved on this device.
    if (
      payload.savedFootwear &&
      (payload.savedFootwear.length > 0 || loadSavedFootwear().length === 0)
    ) {
      replaceSavedFootwear(payload.savedFootwear);
    }
    if (payload.myPoses) {
      replaceMyPoses(payload.myPoses);
    }
    if (payload.queueParams) {
      saveQueueParamsSettings(payload.queueParams);
    }
    if (payload.workflowPresetPacks) {
      saveWorkflowPresetPacks(payload.workflowPresetPacks);
    }
    if (payload.experimentWinners) {
      writeBrowserValue(EXPERIMENT_WINNERS_KEY, payload.experimentWinners);
    }
    if (payload.galleryElo) {
      replaceGalleryEloStore(payload.galleryElo);
    }
    if (payload.catalogRatingBias) {
      writeBrowserValue(CATALOG_RATING_BIAS_KEY, payload.catalogRatingBias);
    }
    if (payload.negativeLearner) {
      saveNegativeSuggestions(payload.negativeLearner);
    }
    if (payload.toolPluginRegistry) {
      saveCustomToolPlugins(payload.toolPluginRegistry);
    }
    if (payload.pluginQueueHooks) {
      savePluginQueueHooks(payload.pluginQueueHooks);
    }
    if (payload.onboardingDone) {
      writeBrowserValue(ONBOARDING_KEY, payload.onboardingDone);
    }
    if (payload.workspaceMode) {
      saveWorkspaceMode(payload.workspaceMode);
    }
    if (typeof payload.workspaceModeChosen === 'boolean') {
      writeBrowserString(WORKSPACE_CHOSEN_KEY, payload.workspaceModeChosen ? '1' : '');
    }
    if (payload.navExpandedGroups) {
      saveExpandedNavGroups(payload.navExpandedGroups);
    }
    if (payload.recentDestinations) {
      writeBrowserValue(RECENT_DESTINATIONS_KEY, payload.recentDestinations);
    }
    if (payload.collapsibleOpen) {
      // A copy from an older device may still carry removed sections' fold states.
      writeBrowserValue(COLLAPSIBLE_KEY, pruneDeadCollapsibleIds(payload.collapsibleOpen).map);
    }
    if (payload.toolContextMemory) {
      saveToolContextMemory(payload.toolContextMemory);
    }
    if ('lastToolDraft' in payload) {
      writeBrowserValue(TOOL_DRAFT_KEY, payload.lastToolDraft ?? null);
    }
    if (payload.lastFailedQueue) {
      saveLastFailedQueue(payload.lastFailedQueue);
    } else if ('lastFailedQueue' in payload && payload.lastFailedQueue === null) {
      writeBrowserValue(LAST_FAILED_QUEUE_KEY, null);
    }
    if (payload.heldMaxJobs) {
      replaceHeldMaxJobs(payload.heldMaxJobs);
    }
    if (typeof payload.lastToolRoute === 'string' && payload.lastToolRoute) {
      saveLastToolRoute(payload.lastToolRoute);
    }
    if (typeof payload.firstQueueSetupDismissed === 'boolean') {
      writeBrowserValue(FIRST_QUEUE_SETUP_DISMISS_KEY, payload.firstQueueSetupDismissed);
    }
    if (payload.notifications) {
      writeBrowserValue(NOTIFICATIONS_KEY, payload.notifications);
    }
    if (payload.localObservability) {
      writeBrowserValue(LOCAL_OBSERVABILITY_KEY, payload.localObservability);
    }
    if ('studioBackupLastExport' in payload) {
      writeBrowserValue(STUDIO_BACKUP_LAST_EXPORT_KEY, payload.studioBackupLastExport ?? null);
    }
    if (payload.appTheme) {
      saveAppTheme(payload.appTheme);
    }
    if (payload.ambientIntensity) {
      saveAmbientIntensity(payload.ambientIntensity);
    }
    if (payload.uiDensity) {
      saveUiDensity(payload.uiDensity);
    }
    if (typeof payload.calmUi === 'boolean') {
      saveCalmUi(payload.calmUi);
    }
    for (const section of studioExtrasSections.values()) {
      section.apply(payload);
    }
  });
}

/**
 * Fold legacy single-purpose server namespaces into a studio-extras payload
 * when those fields are missing (one-time migration path).
 */
export function foldLegacyNamespacesIntoExtras(
  extras: StudioExtrasPayload,
  legacy: {
    scheduledBatch?: ScheduledBatchConfig | null;
    webhookSettings?: WebhookSettings | null;
    avoidedTokens?: string[] | null;
    promptProjects?: unknown;
  }
): StudioExtrasPayload {
  const next = { ...extras };
  if (!next.scheduledBatch && legacy.scheduledBatch) {
    next.scheduledBatch = legacy.scheduledBatch;
  }
  if (!next.webhookSettings && legacy.webhookSettings) {
    next.webhookSettings = legacy.webhookSettings;
  }
  if ((!next.avoidedTokens || next.avoidedTokens.length === 0) && legacy.avoidedTokens?.length) {
    next.avoidedTokens = legacy.avoidedTokens;
  }
  if (
    (!next.promptProjects || next.promptProjects.length === 0) &&
    Array.isArray(legacy.promptProjects) &&
    legacy.promptProjects.length > 0
  ) {
    next.promptProjects = legacy.promptProjects as ReturnType<typeof loadPromptProjects>;
  }
  return next;
}

/** True when this browser has no looks, recipes, or workflow library yet. */
export function localStudioExtrasLooksEmpty(extras?: StudioExtrasPayload | null): boolean {
  if (!extras) {
    return true;
  }
  if (extras.sessionRecipes && extras.sessionRecipes.length > 0) {
    return false;
  }
  if (extras.comfyWorkflowFiles && extras.comfyWorkflowFiles.length > 0) {
    return false;
  }
  if (extras.comfyWorkflowPresets && extras.comfyWorkflowPresets.length > 0) {
    return false;
  }
  if (extras.promptRecipes && extras.promptRecipes.length > 0) {
    return false;
  }
  if (extras.characters && extras.characters.length > 0) {
    return false;
  }
  if (extras.userTemplates && extras.userTemplates.length > 0) {
    return false;
  }
  return true;
}

/** Prefer the newer extras snapshot; empty local never overwrites a populated server copy. */
export function mergeStudioExtras(
  local: StudioExtrasPayload,
  server: StudioExtrasPayload
): StudioExtrasPayload {
  const merged = mergeStudioExtrasWhole(local, server);
  // Stories merge one by one (the newest copy of each wins): a story set aside on one device
  // must not be dropped because the other device saved something else later.
  const stories = mergeRoleplayLibraries(local.roleplayLibrary, server.roleplayLibrary);
  return stories ? { ...merged, roleplayLibrary: stories } : merged;
}

function mergeStudioExtrasWhole(
  local: StudioExtrasPayload,
  server: StudioExtrasPayload
): StudioExtrasPayload {
  const localAt = local.updatedAt ?? 0;
  const serverAt = server.updatedAt ?? 0;
  if (localStudioExtrasLooksEmpty(local) && !localStudioExtrasLooksEmpty(server)) {
    return { ...local, ...server, updatedAt: Math.max(localAt, serverAt) };
  }
  if (serverAt > localAt) {
    return { ...local, ...server, updatedAt: Math.max(localAt, serverAt) };
  }
  return { ...server, ...local, updatedAt: Math.max(localAt, serverAt) };
}

/** A saved story as stored (roleplay-library's RoleplayLibrarySession, read loosely). */
export type StoredRoleplaySession = { id: string; updatedAt?: number } & Record<string, unknown>;

/** Same key as roleplay-library's ROLEPLAY_LIBRARY_KEY (not imported: it pulls in the Story tool). */
const ROLEPLAY_LIBRARY_STORAGE_KEY = 'comfy-prompt-roleplay-library-v1';

function readStoredRoleplayLibrary(): StoredRoleplaySession[] {
  const raw = readBrowserValue<unknown>(ROLEPLAY_LIBRARY_STORAGE_KEY);
  return Array.isArray(raw)
    ? raw.filter(
        (entry): entry is StoredRoleplaySession =>
          Boolean(entry) && typeof (entry as { id?: unknown }).id === 'string'
      )
    : [];
}

/** Union of two story lists by id, newest copy of each; null when neither side has any. */
export function mergeRoleplayLibraries(
  local: StoredRoleplaySession[] | undefined,
  server: StoredRoleplaySession[] | undefined
): StoredRoleplaySession[] | null {
  if (!local?.length && !server?.length) return null;
  const byId = new Map<string, StoredRoleplaySession>();
  for (const entry of [...(server ?? []), ...(local ?? [])]) {
    const existing = byId.get(entry.id);
    if (!existing || (entry.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      byId.set(entry.id, entry);
    }
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
