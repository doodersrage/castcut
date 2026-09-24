'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  isHealthResponse,
  type HealthResponse,
} from '@/components/settings/tabs/settings-tool-shared';
import { markOnboardingComfyHealthOk, markOnboardingLlmHealthOk } from '@/lib/onboarding-hooks';
import { fetchWorkflowPreview } from '@/lib/comfyui-requeue';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { runHealAndReady, readAdaptedLoaderMapTexts } from '@/lib/first-run-setup';

import type { SettingsToolOrchestrationCore } from '@/hooks/settings/useSettingsToolOrchestrationCore';

export function useSettingsToolOrchestrationPart2(ctx: SettingsToolOrchestrationCore) {
  const {
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
  } = ctx;

  const applySuggestedLoaderMaps = useCallback(() => {
    const merged = mergeSuggestedLoaderMaps({
      checkpointMap: sharedSettings.modelCheckpointMap,
      vaeMap: sharedSettings.modelVaeMap,
      refinerMap: sharedSettings.modelRefinerMap,
    });
    const message = formatSuggestedLoaderMergeMessage(merged);
    updateSharedSettings({
      modelCheckpointMap: merged.modelCheckpointMap,
      modelVaeMap: merged.modelVaeMap,
      modelRefinerMap: merged.modelRefinerMap,
    });
    setModelCheckpointMapText(formatModelCheckpointMap(merged.modelCheckpointMap));
    setModelVaeMapText(formatModelVaeMap(merged.modelVaeMap));
    setModelRefinerMapText(formatModelRefinerMap(merged.modelRefinerMap));
    setLoaderMapMergeHint(message);
    setStatus(message);
  }, [
    sharedSettings.modelCheckpointMap,
    sharedSettings.modelRefinerMap,
    sharedSettings.modelVaeMap,
    updateSharedSettings,
  ]);

  const syncLoaderMapsFromComfyInventory = useCallback(async () => {
    setStatus('Fetching ComfyUI inventory…');
    const objectInfo = await fetchComfyObjectInfoCached({
      comfyUrl: settings.apiUrl || undefined,
    });
    if (!objectInfo?.models) {
      setStatus('Could not fetch ComfyUI object_info — is ComfyUI reachable?');
      return;
    }
    const synced = syncLoaderMapsFromInventory({
      models: objectInfo.models,
      checkpointMap: sharedSettings.modelCheckpointMap,
      vaeMap: sharedSettings.modelVaeMap,
      upscaleMap: sharedSettings.modelUpscaleMap,
      controlNetMap: sharedSettings.modelControlNetMap,
      healMissing: true,
    });
    const message = formatInventorySyncMessage(synced);
    updateSharedSettings({
      modelCheckpointMap: synced.modelCheckpointMap,
      modelVaeMap: synced.modelVaeMap,
      modelUpscaleMap: synced.modelUpscaleMap,
      modelControlNetMap: synced.modelControlNetMap,
    });
    setModelCheckpointMapText(formatModelCheckpointMap(synced.modelCheckpointMap));
    setModelVaeMapText(formatModelVaeMap(synced.modelVaeMap));
    setModelUpscaleMapText(formatModelUpscaleMap(synced.modelUpscaleMap));
    setModelControlNetMapText(formatModelControlNetMap(synced.modelControlNetMap));
    setLoaderMapMergeHint(message);
    setStatus(message);
    setWorkflowHealthRefresh(n => n + 1);
  }, [
    settings.apiUrl,
    sharedSettings.modelCheckpointMap,
    sharedSettings.modelControlNetMap,
    sharedSettings.modelUpscaleMap,
    sharedSettings.modelVaeMap,
    updateSharedSettings,
  ]);

  const workflowValidation = useMemo(() => {
    if (!settings.workflowJson?.trim()) {
      return null;
    }
    return validateWorkflowJson(settings.workflowJson, placeholderTokensFromSettings(settings));
  }, [settings.workflowJson, settings.positiveToken, settings.negativeToken]);

  const refreshHealth = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!settings.useServerDefaults && settings.apiUrl?.trim()) {
        params.set('comfyUrl', settings.apiUrl.trim());
      }
      const query = params.toString();
      const response = await fetch(query ? `/api/health?${query}` : '/api/health');
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!isHealthResponse(payload)) {
        // Keep the last good health: a rate-limited or failed check must not blank the panels.
        const reason =
          response.status === 429
            ? 'Health check rate-limited — try again in a moment.'
            : ((payload as { error?: string } | null)?.error ??
              `Health check failed (HTTP ${response.status}).`);
        setStatus(reason);
        return;
      }
      const healthData = payload;
      setHealth(healthData);
      if (healthData.llm?.ok) {
        markOnboardingLlmHealthOk();
      }
      if (healthData.comfyui?.ok) {
        markOnboardingComfyHealthOk();
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Health check failed.');
    } finally {
      setLoading(false);
    }
  }, [settings.apiUrl, settings.useServerDefaults]);

  const handleHealAndReady = useCallback(async () => {
    setHealBusy(true);
    setHealProgress('Starting Heal & ready…');
    try {
      const result = await runHealAndReady({
        comfyUrl:
          !settings.useServerDefaults && settings.apiUrl?.trim()
            ? settings.apiUrl.trim()
            : undefined,
        onProgress: progress => {
          setHealProgress(progress.message);
          setStatus(progress.message);
        },
      });
      if (result.ok || result.systemWorkflowsEnabled) {
        void import('@/lib/first-run-dismiss').then(({ dismissFirstRunSetupSurfaces }) => {
          dismissFirstRunSetupSurfaces();
        });
      }
      const adapted = loadSettingsCache().shared;
      updateSharedSettings({
        useSystemWorkflows: true,
        queueQualityProfile: adapted.queueQualityProfile,
        modelCheckpointMap: adapted.modelCheckpointMap,
        modelVaeMap: adapted.modelVaeMap,
        modelRefinerMap: adapted.modelRefinerMap,
        modelUpscaleMap: adapted.modelUpscaleMap,
        modelControlNetMap: adapted.modelControlNetMap,
      });
      const texts = readAdaptedLoaderMapTexts();
      setModelCheckpointMapText(texts.checkpoint);
      setModelVaeMapText(texts.vae);
      setModelRefinerMapText(texts.refiner);
      setModelUpscaleMapText(texts.upscale);
      setModelControlNetMapText(texts.controlNet);
      setStatus(result.message);
      setHealProgress(result.message);
      setWorkflowHealthRefresh(n => n + 1);
      await refreshHealth();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Heal & ready failed.';
      setStatus(message);
      setHealProgress(message);
    } finally {
      setHealBusy(false);
    }
  }, [refreshHealth, settings.apiUrl, settings.useServerDefaults, updateSharedSettings]);

  useEffect(() => {
    if (tab !== 'overview' && tab !== 'comfyui') {
      return;
    }
    scheduleAfterCommit(() => {
      void refreshHealth();
    });
  }, [refreshHealth, tab]);

  const handleImport = useCallback(async (file: File) => {
    try {
      const raw = await file.text();
      const { importStudioBackup, parseStudioBackupFile } = await import('@/lib/studio-backup');
      importStudioBackup(parseStudioBackupFile(raw));
      setStatus('Backup imported. Reload the page to apply all settings.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.');
    }
  }, []);

  const handleExportBackup = useCallback(() => {
    void import('@/lib/studio-backup').then(({ downloadStudioBackup }) => {
      downloadStudioBackup();
      writeBrowserString(STUDIO_BACKUP_LAST_EXPORT_KEY, String(Date.now()));
      setBackupReminder(null);
      setStatus('Studio backup downloaded.');
    });
  }, []);

  const handleSaveComfySettings = useCallback(() => {
    if (!settings.useServerDefaults && settings.workflowJson?.trim()) {
      const validation = validateWorkflowJson(
        settings.workflowJson,
        placeholderTokensFromSettings(settings)
      );
      if (!validation.ok) {
        setWorkflowError(validation.error ?? 'Invalid workflow JSON.');
        return;
      }
    }

    saveComfyUiSettings(mergeLoraLibraryIntoCustomTokens(settings));
    setWorkflowError(null);
    setStatus('ComfyUI settings saved.');
    void refreshHealth();
  }, [refreshHealth, settings]);

  const handleImportWorkflow = useCallback(
    async (file: File) => {
      try {
        const raw = await file.text();
        const validation = validateWorkflowJson(raw, placeholderTokensFromSettings(settings));
        if (!validation.ok) {
          setWorkflowError(validation.error ?? 'Invalid workflow JSON.');
          return;
        }

        updateSettings({
          useServerDefaults: false,
          workflowJson: raw.trim(),
        });
        setWorkflowError(null);
        setStatus(
          `Imported workflow · ${validation.placeholders?.positive ?? 0} positive placeholder(s).`
        );
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Workflow import failed.');
      }
    },
    [settings, updateSettings]
  );

  const handleResetComfySettings = useCallback(() => {
    resetComfyUiSettings();
    updateSettings(DEFAULT_COMFYUI_SETTINGS);
    setWorkflowError(null);
    setStatus('ComfyUI settings reset to server defaults.');
    void refreshHealth();
  }, [refreshHealth, updateSettings]);

  const handleEnableNotifications = useCallback(async () => {
    const permission = await requestComfyNotificationPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      updateSettings({ notifyOnComplete: true });
      setStatus('Browser notifications enabled for completed ComfyUI jobs.');
    } else if (permission === 'denied') {
      setStatus('Notifications blocked in browser settings.');
    }
  }, [updateSettings]);

  const updateQueueParam = useCallback(
    (key: 'seed' | 'width' | 'height' | 'cfg' | 'steps', value: string) => {
      updateSettings({
        queueParams: {
          ...settings.queueParams,
          [key]: value,
        },
      });
    },
    [settings.queueParams, updateSettings]
  );

  const updateCustomToken = useCallback(
    (index: number, patch: Partial<CustomWorkflowToken>) => {
      const current = settings.customTokens ?? [];
      const next = current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      );
      updateSettings({ customTokens: next });
    },
    [settings.customTokens, updateSettings]
  );

  const addCustomToken = useCallback(() => {
    updateSettings({
      customTokens: [...(settings.customTokens ?? []), { token: '{{CHECKPOINT}}', value: '' }],
    });
  }, [settings.customTokens, updateSettings]);

  const removeCustomToken = useCallback(
    (index: number) => {
      updateSettings({
        customTokens: (settings.customTokens ?? []).filter((_, entryIndex) => entryIndex !== index),
      });
    },
    [settings.customTokens, updateSettings]
  );

  const handlePreviewWorkflow = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setWorkflowPreview(null);
    try {
      saveComfyUiSettings(settings);
      const preview = await fetchWorkflowPreview({
        prompt: previewPrompt,
        model: sharedSettings.model,
        params: resolveQueueParams({ model: sharedSettings.model }),
      });
      setWorkflowPreview(preview);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setPreviewLoading(false);
    }
  }, [previewPrompt, settings, sharedSettings.model]);
  return {
    applySuggestedLoaderMaps,
    syncLoaderMapsFromComfyInventory,
    workflowValidation,
    refreshHealth,
    handleHealAndReady,
    handleImport,
    handleExportBackup,
    handleSaveComfySettings,
    handleImportWorkflow,
    handleResetComfySettings,
    handleEnableNotifications,
    updateQueueParam,
    updateCustomToken,
    addCustomToken,
    removeCustomToken,
    handlePreviewWorkflow,
  };
}
