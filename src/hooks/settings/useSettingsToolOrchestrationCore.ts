'use client';

import { focusSettingsElement } from '@/lib/settings-focus';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { STUDIO_BACKUP_LAST_EXPORT_KEY } from '@/lib/studio-backup-meta';
import {
  readBrowserString,
  whenBrowserStorageReady,
  writeBrowserString,
} from '@/lib/browser-storage';
import { useComfyUiSettings } from '@/hooks/useComfyUiSettings';
import { validateWorkflowJson, type CustomWorkflowToken } from '@/lib/comfyui-config';
import {
  DEFAULT_COMFYUI_SETTINGS,
  loadComfyUiSettings,
  mergeLoraLibraryIntoCustomTokens,
  placeholderTokensFromSettings,
  resetComfyUiSettings,
  saveComfyUiSettings,
} from '@/lib/comfyui-settings';
import {
  formatModelCheckpointMap,
  formatModelVaeMap,
  formatModelRefinerMap,
  mergeSuggestedLoaderMaps,
  formatSuggestedLoaderMergeMessage,
} from '@/lib/model-checkpoint-map';
import { formatModelUpscaleMap } from '@/lib/model-upscale-map';
import { formatModelControlNetMap } from '@/lib/model-controlnet-map';
import { formatModelLoraMap } from '@/lib/model-lora-map';
import {
  formatInventorySyncMessage,
  syncLoaderMapsFromInventory,
} from '@/lib/loader-map-inventory-sync';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import {
  DEFAULT_SHARED_SETTINGS,
  loadSettingsCache,
  saveSharedSettingsNow,
  SETTINGS_CACHE_UPDATED_EVENT,
  type SharedToolSettings,
} from '@/lib/settings-cache';
import {
  DEFAULT_SCHEDULED_BATCH,
  loadScheduledBatchConfig,
  type ScheduledBatchConfig,
} from '@/lib/scheduled-batch';
import {
  fetchScheduledBatchServerStatus,
  pushScheduledBatchProfile,
  type ScheduledBatchServerStatus,
} from '@/lib/scheduled-batch-profile-sync';
import {
  DEFAULT_WEBHOOK_SETTINGS,
  loadWebhookSettings,
  type WebhookSettings,
} from '@/lib/webhook-settings';
import { AVOIDED_TOKENS_UPDATED_EVENT, exportAvoidedTokenList } from '@/lib/avoided-tokens';
import { WEBHOOK_LOG_UPDATED_EVENT, loadWebhookLog, type WebhookLogEntry } from '@/lib/webhook-log';
import {
  isComfyNotificationSupported,
  requestComfyNotificationPermission,
} from '@/lib/comfyui-notifications';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  normalizeSettingsTab,
  settingsTabHref,
  settingsTabsForWorkspaceMode,
  isSimpleSettingsTab,
  settingsViewFromSearchParams,
  type SettingsTab,
} from '@/lib/settings-nav';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { useSettingsPageDescriptionRich } from '@/hooks/useToolPageDescription';
import {
  comfyUiSectionRequiresFullSettings,
  normalizeComfyUiSettingsSection,
  settingsComfyUiSectionHref,
  type ComfyUiSettingsSectionId,
} from '@/lib/settings-comfyui-nav';
import {
  COMFYUI_SECTION_ELEMENT_IDS,
  PLAYBOOK_SECTION_CHECKLISTS,
  serverEnvFieldValue,
  formatModelWorkflowMap,
  type HealthResponse,
} from '@/components/settings/tabs/settings-tool-shared';
import { markOnboardingComfyHealthOk, markOnboardingLlmHealthOk } from '@/lib/onboarding-hooks';
import { fetchWorkflowPreview } from '@/lib/comfyui-requeue';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { runHealAndReady, readAdaptedLoaderMapTexts } from '@/lib/first-run-setup';

export function useSettingsToolOrchestrationCore() {
  const { mounted, settings, updateSettings } = useComfyUiSettings();
  const workspaceMode = useWorkspaceMode();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const firstUrlViewRef = useRef(true);
  const urlView = settingsViewFromSearchParams(
    searchParams.get('tab'),
    searchParams.get('section')
  );
  // URL deep links expand immediately; the user can still open the rest by hand.
  const [userShowAllSettings, setUserShowAllSettings] = useState(false);
  const showAllSettings = urlView.showAll || userShowAllSettings;
  const [tab, setTab] = useState<SettingsTab>(urlView.tab);
  const [comfyUiSection, setComfyUiSection] = useState<ComfyUiSettingsSectionId | null>(
    urlView.section
  );
  const [sharedSettings, setSharedSettings] = useState<SharedToolSettings>(DEFAULT_SHARED_SETTINGS);
  const [sharedMounted, setSharedMounted] = useState(false);
  const [modelWorkflowMapText, setModelWorkflowMapText] = useState('');
  const [modelCheckpointMapText, setModelCheckpointMapText] = useState('');
  const [modelVaeMapText, setModelVaeMapText] = useState('');
  const [modelRefinerMapText, setModelRefinerMapText] = useState('');
  const [modelUpscaleMapText, setModelUpscaleMapText] = useState('');
  const [modelControlNetMapText, setModelControlNetMapText] = useState('');
  const [modelLoraMapText, setModelLoraMapText] = useState('');
  const [loaderMapMergeHint, setLoaderMapMergeHint] = useState<string | null>(null);
  const [ipAdapterUploadStatus, setIpAdapterUploadStatus] = useState<string | null>(null);
  const [ipAdapterUploading, setIpAdapterUploading] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [healBusy, setHealBusy] = useState(false);
  const [healProgress, setHealProgress] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [workflowHealthRefresh, setWorkflowHealthRefresh] = useState(0);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');
  const [previewPrompt, setPreviewPrompt] = useState(
    'Two gravel cyclists racing through a muddy forest doubletrack at dusk.'
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [workflowPreview, setWorkflowPreview] = useState<Awaited<
    ReturnType<typeof fetchWorkflowPreview>
  > | null>(null);
  const [webhookSettings, setWebhookSettings] = useState<WebhookSettings>(DEFAULT_WEBHOOK_SETTINGS);
  const [scheduledBatch, setScheduledBatch] =
    useState<ScheduledBatchConfig>(DEFAULT_SCHEDULED_BATCH);
  const [serverScheduledBatchStatus, setServerScheduledBatchStatus] =
    useState<ScheduledBatchServerStatus | null>(null);
  const [avoidedTokens, setAvoidedTokens] = useState<string[]>([]);
  const [avoidedTokenDraft, setAvoidedTokenDraft] = useState('');
  const [avoidancePreviewPrompt, setAvoidancePreviewPrompt] = useState('');
  const [avoidancePreview, setAvoidancePreview] = useState<{
    filtered: string;
    removedTokens: string[];
    instructionLine: string;
  } | null>(null);
  const [webhookLog, setWebhookLog] = useState<WebhookLogEntry[]>([]);
  const [webhookEventFilter, setWebhookEventFilter] = useState<string>('all');
  const [expandedWebhookLogId, setExpandedWebhookLogId] = useState<string | null>(null);
  const [backupReminder, setBackupReminder] = useState<string | null>(null);

  const visibleSettingsTabs = useMemo(
    () => settingsTabsForWorkspaceMode(workspaceMode, showAllSettings),
    [workspaceMode, showAllSettings]
  );

  const slimSettings = !showAllSettings;
  const description = useSettingsPageDescriptionRich(slimSettings);

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (isComfyNotificationSupported()) {
        setNotificationPermission(Notification.permission);
      } else {
        setNotificationPermission('unsupported');
      }
    });
  }, []);

  const [guidedFixHint, setGuidedFixHint] = useState<string | null>(null);

  const scrollToComfyUiSection = useCallback((section: ComfyUiSettingsSectionId) => {
    const element = document.getElementById(COMFYUI_SECTION_ELEMENT_IDS[section]);
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.classList.add(
      'ring-2',
      'ring-[var(--accent-ring)]',
      'ring-offset-2',
      'ring-offset-[var(--bg-base)]',
      'transition'
    );
    window.setTimeout(() => {
      element.classList.remove(
        'ring-2',
        'ring-[var(--accent-ring)]',
        'ring-offset-2',
        'ring-offset-[var(--bg-base)]',
        'transition'
      );
    }, 2600);
    const hint = PLAYBOOK_SECTION_CHECKLISTS[section];
    if (hint) {
      setGuidedFixHint(hint);
      window.setTimeout(() => setGuidedFixHint(null), 8000);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    scheduleAfterCommit(() => {
      const params = new URLSearchParams(window.location.search);
      // After the first load, only a Settings-search link (focus=…) re-applies the URL —
      // tab clicks rewrite the URL too and must not re-scroll.
      if (!firstUrlViewRef.current && !params.get('focus')) {
        return;
      }
      firstUrlViewRef.current = false;
      const nextTab = normalizeSettingsTab(params.get('tab'));
      const section = normalizeComfyUiSettingsSection(params.get('section'));
      setTab(nextTab);
      setComfyUiSection(section);
      if (
        (workspaceMode === 'simple' && !isSimpleSettingsTab(nextTab)) ||
        comfyUiSectionRequiresFullSettings(section)
      ) {
        setUserShowAllSettings(true);
      }
      const focus = params.get('focus')?.trim();
      if (focus) {
        // A specific control (Settings search): scroll to it rather than the section top.
        window.setTimeout(() => focusSettingsElement(focus), 300);
      } else if (nextTab === 'comfyui' && section) {
        window.setTimeout(() => scrollToComfyUiSection(section), 250);
      }
      if (nextTab === 'data' && params.get('section') === 'reliability') {
        window.setTimeout(() => {
          const element = document.getElementById('settings-data-reliability');
          if (!element) {
            return;
          }
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          element.classList.add(
            'ring-2',
            'ring-[var(--accent-ring)]',
            'ring-offset-2',
            'ring-offset-[var(--bg-base)]',
            'transition'
          );
          window.setTimeout(() => {
            element.classList.remove(
              'ring-2',
              'ring-[var(--accent-ring)]',
              'ring-offset-2',
              'ring-offset-[var(--bg-base)]',
              'transition'
            );
          }, 2600);
        }, 120);
      }
    });
  }, [workspaceMode, scrollToComfyUiSection, searchKey]);

  const handleTabChange = useCallback((next: SettingsTab) => {
    setTab(next);
    if (next !== 'comfyui') {
      setComfyUiSection(null);
    }
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', settingsTabHref(next));
    }
  }, []);

  const handleComfyUiSectionJump = useCallback(
    (section: ComfyUiSettingsSectionId) => {
      if (comfyUiSectionRequiresFullSettings(section)) {
        setUserShowAllSettings(true);
      }
      setComfyUiSection(section);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', settingsComfyUiSectionHref(section));
      }
      scheduleAfterCommit(() => {
        scrollToComfyUiSection(section);
      });
    },
    [scrollToComfyUiSection]
  );

  const reloadBrowserSettingsState = useCallback(() => {
    const cache = loadSettingsCache();
    setSharedSettings(cache.shared);
    setModelWorkflowMapText(formatModelWorkflowMap(cache.shared.modelWorkflowMap));
    setModelCheckpointMapText(formatModelCheckpointMap(cache.shared.modelCheckpointMap));
    setModelVaeMapText(formatModelVaeMap(cache.shared.modelVaeMap));
    setModelRefinerMapText(formatModelRefinerMap(cache.shared.modelRefinerMap));
    setModelUpscaleMapText(formatModelUpscaleMap(cache.shared.modelUpscaleMap));
    setModelControlNetMapText(formatModelControlNetMap(cache.shared.modelControlNetMap));
    setModelLoraMapText(formatModelLoraMap(cache.shared.modelLoraMap));
    updateSettings(loadComfyUiSettings());
    setWebhookSettings(loadWebhookSettings());
    setScheduledBatch(loadScheduledBatchConfig());
    setAvoidedTokens(exportAvoidedTokenList());
  }, [updateSettings]);

  /** Soft sync for same-tab cache events — never wipe map textarea drafts mid-edit. */
  const softSyncSharedSettings = useCallback(() => {
    const cache = loadSettingsCache();
    setSharedSettings(cache.shared);
    updateSettings(loadComfyUiSettings());
    setWebhookSettings(loadWebhookSettings());
    setScheduledBatch(loadScheduledBatchConfig());
    setAvoidedTokens(exportAvoidedTokenList());
  }, [updateSettings]);

  useEffect(() => {
    if (tab !== 'comfyui' || !comfyUiSection) {
      return;
    }
    scheduleAfterCommit(() => {
      scrollToComfyUiSection(comfyUiSection);
    });
  }, [tab, comfyUiSection, scrollToComfyUiSection]);

  useEffect(() => {
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      const cache = loadSettingsCache();
      setSharedSettings(cache.shared);
      setModelWorkflowMapText(formatModelWorkflowMap(cache.shared.modelWorkflowMap));
      setModelCheckpointMapText(formatModelCheckpointMap(cache.shared.modelCheckpointMap));
      setModelVaeMapText(formatModelVaeMap(cache.shared.modelVaeMap));
      setModelRefinerMapText(formatModelRefinerMap(cache.shared.modelRefinerMap));
      setModelUpscaleMapText(formatModelUpscaleMap(cache.shared.modelUpscaleMap));
      setModelControlNetMapText(formatModelControlNetMap(cache.shared.modelControlNetMap));
      setModelLoraMapText(formatModelLoraMap(cache.shared.modelLoraMap));
      setSharedMounted(true);
      setWebhookSettings(loadWebhookSettings());
      setScheduledBatch(loadScheduledBatchConfig());
      setAvoidedTokens(exportAvoidedTokenList());
      setWebhookLog(loadWebhookLog());
      void fetchScheduledBatchServerStatus().then(setServerScheduledBatchStatus);
      try {
        const lastBackupRaw = readBrowserString(STUDIO_BACKUP_LAST_EXPORT_KEY);
        const lastBackup = lastBackupRaw ? Number(lastBackupRaw) : 0;
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        if (!lastBackup || Date.now() - lastBackup > weekMs) {
          setBackupReminder(
            'No recent Studio backup detected — export a v3 backup to preserve avoided tokens, webhooks, and projects.'
          );
        }
      } catch {
        setBackupReminder(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refreshAvoided = () => setAvoidedTokens(exportAvoidedTokenList());
    const refreshWebhookLog = () => setWebhookLog(loadWebhookLog());
    const refreshShared = () => {
      if (!sharedMounted) {
        return;
      }
      scheduleAfterCommit(() => {
        softSyncSharedSettings();
      });
    };
    window.addEventListener(AVOIDED_TOKENS_UPDATED_EVENT, refreshAvoided);
    window.addEventListener(WEBHOOK_LOG_UPDATED_EVENT, refreshWebhookLog);
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, refreshShared);
    return () => {
      window.removeEventListener(AVOIDED_TOKENS_UPDATED_EVENT, refreshAvoided);
      window.removeEventListener(WEBHOOK_LOG_UPDATED_EVENT, refreshWebhookLog);
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, refreshShared);
    };
  }, [sharedMounted, softSyncSharedSettings]);

  const updateSharedSettings = useCallback((patch: Partial<SharedToolSettings>) => {
    setSharedSettings(previous => ({ ...previous, ...patch }));
    const next = { ...loadSettingsCache().shared, ...patch };
    // Avoid broadcasting back into this page — optimistic UI already applied.
    void saveSharedSettingsNow(next, { notify: false });
  }, []);
  return {
    mounted,
    settings,
    updateSettings,
    workspaceMode,
    urlView,
    userShowAllSettings,
    setUserShowAllSettings,
    showAllSettings,
    tab,
    setTab,
    comfyUiSection,
    setComfyUiSection,
    sharedSettings,
    setSharedSettings,
    sharedMounted,
    modelWorkflowMapText,
    setModelWorkflowMapText,
    modelCheckpointMapText,
    setModelCheckpointMapText,
    modelVaeMapText,
    setModelVaeMapText,
    modelRefinerMapText,
    setModelRefinerMapText,
    modelUpscaleMapText,
    setModelUpscaleMapText,
    modelControlNetMapText,
    setModelControlNetMapText,
    modelLoraMapText,
    setModelLoraMapText,
    loaderMapMergeHint,
    setLoaderMapMergeHint,
    ipAdapterUploadStatus,
    setIpAdapterUploadStatus,
    ipAdapterUploading,
    setIpAdapterUploading,
    health,
    setHealth,
    loading,
    setLoading,
    healBusy,
    setHealBusy,
    healProgress,
    setHealProgress,
    status,
    setStatus,
    workflowHealthRefresh,
    setWorkflowHealthRefresh,
    workflowError,
    setWorkflowError,
    notificationPermission,
    setNotificationPermission,
    previewPrompt,
    setPreviewPrompt,
    previewLoading,
    setPreviewLoading,
    previewError,
    setPreviewError,
    workflowPreview,
    setWorkflowPreview,
    webhookSettings,
    setWebhookSettings,
    scheduledBatch,
    setScheduledBatch,
    serverScheduledBatchStatus,
    setServerScheduledBatchStatus,
    avoidedTokens,
    setAvoidedTokens,
    avoidedTokenDraft,
    setAvoidedTokenDraft,
    avoidancePreviewPrompt,
    setAvoidancePreviewPrompt,
    avoidancePreview,
    setAvoidancePreview,
    webhookLog,
    setWebhookLog,
    webhookEventFilter,
    setWebhookEventFilter,
    expandedWebhookLogId,
    setExpandedWebhookLogId,
    backupReminder,
    setBackupReminder,
    visibleSettingsTabs,
    slimSettings,
    description,
    guidedFixHint,
    setGuidedFixHint,
    scrollToComfyUiSection,
    handleTabChange,
    handleComfyUiSectionJump,
    reloadBrowserSettingsState,
    softSyncSharedSettings,
    updateSharedSettings,
  };
}

export type SettingsToolOrchestrationCore = ReturnType<typeof useSettingsToolOrchestrationCore>;
