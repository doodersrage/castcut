'use client';

import dynamic from 'next/dynamic';
import SettingsSubNav from '@/components/settings/SettingsSubNav';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import { Button } from '@/components/ui/Button';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { comfyUiSectionRequiresFullSettings } from '@/lib/settings-comfyui-nav';
import { serverEnvFieldValue } from '@/components/settings/tabs/settings-tool-shared';
import type { useSettingsToolOrchestration } from '@/hooks/useSettingsToolOrchestration';

const SettingsAdvancedPanel = dynamic(() => import('@/components/SettingsAdvancedPanel'), {
  loading: () => <ToolPageSkeleton label="Loading advanced settings" />,
});
const UsersSettingsPanel = dynamic(() => import('@/components/settings/UsersSettingsPanel'), {
  loading: () => <ToolPageSkeleton label="Loading users" />,
});
const SettingsLlmPanel = dynamic(() => import('@/components/settings/SettingsLlmPanel'), {
  loading: () => <ToolPageSkeleton label="Loading LLM settings" />,
});
const SettingsOverviewTab = dynamic(
  () => import('@/components/settings/tabs/SettingsOverviewTab'),
  {
    loading: () => <ToolPageSkeleton label="Loading overview" />,
  }
);
const SettingsComfyUiTab = dynamic(() => import('@/components/settings/tabs/SettingsComfyUiTab'), {
  loading: () => <ToolPageSkeleton label="Loading ComfyUI settings" />,
});
const SettingsAutomationTab = dynamic(
  () => import('@/components/settings/tabs/SettingsAutomationTab'),
  {
    loading: () => <ToolPageSkeleton label="Loading automation settings" />,
  }
);
const SettingsDataTab = dynamic(() => import('@/components/settings/tabs/SettingsDataTab'), {
  loading: () => <ToolPageSkeleton label="Loading data settings" />,
});

const ACCENT = 'neutral' as const;

type SettingsToolViewModel = ReturnType<typeof useSettingsToolOrchestration>;

export default function SettingsToolSections(vm: SettingsToolViewModel) {
  const {
    description,
    guidedFixHint,
    tab,
    setTab,
    handleTabChange,
    visibleSettingsTabs,
    slimSettings,
    setUserShowAllSettings,
    health,
    loading,
    healBusy,
    healProgress,
    handleHealAndReady,
    refreshHealth,
    sharedSettings,
    updateSharedSettings,
    setStatus,
    comfyUiSection,
    setComfyUiSection,
    scrollToComfyUiSection,
    handleImport,
    handleExportBackup,
    sharedMounted,
    mounted,
    settings,
    updateSettings,
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
    ipAdapterUploadStatus,
    ipAdapterUploading,
    setIpAdapterUploading,
    setIpAdapterUploadStatus,
    workflowHealthRefresh,
    setWorkflowHealthRefresh,
    applySuggestedLoaderMaps,
    syncLoaderMapsFromComfyInventory,
    updateQueueParam,
    updateCustomToken,
    addCustomToken,
    removeCustomToken,
    workflowError,
    setWorkflowError,
    workflowValidation,
    previewPrompt,
    setPreviewPrompt,
    previewLoading,
    previewError,
    workflowPreview,
    handlePreviewWorkflow,
    handleImportWorkflow,
    notificationPermission,
    handleEnableNotifications,
    handleSaveComfySettings,
    handleResetComfySettings,
    handleComfyUiSectionJump,
    webhookSettings,
    setWebhookSettings,
    avoidedTokens,
    avoidedTokenDraft,
    setAvoidedTokenDraft,
    avoidancePreviewPrompt,
    setAvoidancePreviewPrompt,
    avoidancePreview,
    setAvoidancePreview,
    webhookLog,
    webhookEventFilter,
    setWebhookEventFilter,
    expandedWebhookLogId,
    setExpandedWebhookLogId,
    scheduledBatch,
    setScheduledBatch,
    serverScheduledBatchStatus,
    backupReminder,
    reloadBrowserSettingsState,
    status,
  } = vm;

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Settings</ToolBadge>}
      title="Settings & Health"
      description={description}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.settings} />
      {guidedFixHint ? (
        <div role="status" className="ui-setup-banner mb-4 text-sm text-[var(--text-primary)]">
          {guidedFixHint}
        </div>
      ) : null}
      <div className="md:grid md:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)] md:items-start md:gap-8">
        <SettingsSubNav
          activeTab={tab}
          onTabChange={handleTabChange}
          tabs={visibleSettingsTabs}
          footer={
            slimSettings ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 w-full justify-start"
                onClick={() => setUserShowAllSettings(true)}
              >
                All settings…
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 w-full justify-start"
                onClick={() => setUserShowAllSettings(false)}
              >
                Show essentials only
              </Button>
            )
          }
        />
        <div className="min-w-0 space-y-[var(--section-gap)]">
          {tab === 'overview' && (
            <SettingsOverviewTab
              health={health}
              loading={loading}
              healBusy={healBusy}
              healProgress={healProgress}
              handleHealAndReady={handleHealAndReady}
              refreshHealth={refreshHealth}
              sharedSettings={sharedSettings}
              updateSharedSettings={updateSharedSettings}
              setStatus={setStatus}
              slimSettings={slimSettings}
              onOpenComfyUiSection={section => {
                if (comfyUiSectionRequiresFullSettings(section)) {
                  setUserShowAllSettings(true);
                }
                setTab('comfyui');
                setComfyUiSection(section);
                window.setTimeout(() => scrollToComfyUiSection(section), 250);
              }}
              onShowAllSettings={() => setUserShowAllSettings(true)}
              handleImport={handleImport}
              handleExportBackup={handleExportBackup}
            />
          )}

          {tab === 'llm' && (
            <SettingsLlmPanel
              sharedSettings={sharedSettings}
              sharedMounted={sharedMounted}
              updateSharedSettings={updateSharedSettings}
              server={{
                enabled: health?.config.llmEnabled,
                ok: health?.llm.ok,
                model: health?.llm.model ?? health?.config.llmModel,
                baseUrl: health?.llm.baseUrl,
                error: health?.llm.error,
                visionModel: health?.config.visionModel,
                allowTemplateFallback: health?.config.allowTemplateFallback,
                serverTemperature: serverEnvFieldValue(health?.serverEnv, 'LLM_TEMPERATURE'),
                embedModel: serverEnvFieldValue(health?.serverEnv, 'LLM_EMBED_MODEL'),
                inFlight: health?.llm.inFlight,
                maxInflight: health?.llm.maxInflight,
                busy: health?.llm.busy,
                apiKeyConfigured: health?.config.llmApiKeyConfigured,
                visionModelConfigured: health?.config.visionModelConfigured,
                visionModelDetected: health?.config.visionModelDetected,
              }}
              autoVisionTags={settings.autoVisionTags !== false}
              onAutoVisionTagsChange={value => updateSettings({ autoVisionTags: value })}
              onTestConnection={() => void refreshHealth()}
              testingConnection={loading}
            />
          )}

          {tab === 'comfyui' && (
            <SettingsComfyUiTab
              slimSettings={slimSettings}
              onShowAllSettings={() => setUserShowAllSettings(true)}
              comfyUiSection={comfyUiSection}
              handleComfyUiSectionJump={handleComfyUiSectionJump}
              sharedSettings={sharedSettings}
              sharedMounted={sharedMounted}
              updateSharedSettings={updateSharedSettings}
              mounted={mounted}
              settings={settings}
              updateSettings={updateSettings}
              modelWorkflowMapText={modelWorkflowMapText}
              setModelWorkflowMapText={setModelWorkflowMapText}
              modelCheckpointMapText={modelCheckpointMapText}
              setModelCheckpointMapText={setModelCheckpointMapText}
              modelVaeMapText={modelVaeMapText}
              setModelVaeMapText={setModelVaeMapText}
              modelRefinerMapText={modelRefinerMapText}
              setModelRefinerMapText={setModelRefinerMapText}
              modelUpscaleMapText={modelUpscaleMapText}
              setModelUpscaleMapText={setModelUpscaleMapText}
              modelControlNetMapText={modelControlNetMapText}
              setModelControlNetMapText={setModelControlNetMapText}
              modelLoraMapText={modelLoraMapText}
              setModelLoraMapText={setModelLoraMapText}
              loaderMapMergeHint={loaderMapMergeHint}
              ipAdapterUploadStatus={ipAdapterUploadStatus}
              ipAdapterUploading={ipAdapterUploading}
              setIpAdapterUploading={setIpAdapterUploading}
              setIpAdapterUploadStatus={setIpAdapterUploadStatus}
              workflowHealthRefresh={workflowHealthRefresh}
              setWorkflowHealthRefresh={setWorkflowHealthRefresh}
              setStatus={setStatus}
              applySuggestedLoaderMaps={applySuggestedLoaderMaps}
              syncLoaderMapsFromComfyInventory={syncLoaderMapsFromComfyInventory}
              updateQueueParam={updateQueueParam}
              updateCustomToken={updateCustomToken}
              addCustomToken={addCustomToken}
              removeCustomToken={removeCustomToken}
              workflowError={workflowError}
              setWorkflowError={setWorkflowError}
              workflowValidation={workflowValidation}
              previewPrompt={previewPrompt}
              setPreviewPrompt={setPreviewPrompt}
              previewLoading={previewLoading}
              previewError={previewError}
              workflowPreview={workflowPreview}
              handlePreviewWorkflow={handlePreviewWorkflow}
              handleImportWorkflow={handleImportWorkflow}
              notificationPermission={notificationPermission}
              handleEnableNotifications={handleEnableNotifications}
              handleSaveComfySettings={handleSaveComfySettings}
              handleResetComfySettings={handleResetComfySettings}
              refreshHealth={refreshHealth}
              health={health}
              healBusy={healBusy}
              healProgress={healProgress}
              handleHealAndReady={handleHealAndReady}
            />
          )}

          {tab === 'automation' && (
            <SettingsAutomationTab
              webhookSettings={webhookSettings}
              setWebhookSettings={setWebhookSettings}
              avoidedTokens={avoidedTokens}
              avoidedTokenDraft={avoidedTokenDraft}
              setAvoidedTokenDraft={setAvoidedTokenDraft}
              avoidancePreviewPrompt={avoidancePreviewPrompt}
              setAvoidancePreviewPrompt={setAvoidancePreviewPrompt}
              avoidancePreview={avoidancePreview}
              setAvoidancePreview={setAvoidancePreview}
              webhookLog={webhookLog}
              webhookEventFilter={webhookEventFilter}
              setWebhookEventFilter={setWebhookEventFilter}
              expandedWebhookLogId={expandedWebhookLogId}
              setExpandedWebhookLogId={setExpandedWebhookLogId}
              scheduledBatch={scheduledBatch}
              setScheduledBatch={setScheduledBatch}
              serverScheduledBatchStatus={serverScheduledBatchStatus}
              sharedSettings={sharedSettings}
              setStatus={setStatus}
            />
          )}

          {tab === 'data' && (
            <SettingsDataTab
              sharedSettings={sharedSettings}
              updateSharedSettings={updateSharedSettings}
              backupReminder={backupReminder}
              reloadBrowserSettingsState={reloadBrowserSettingsState}
              handleImport={handleImport}
              handleExportBackup={handleExportBackup}
              updateSettings={updateSettings}
              setStatus={setStatus}
            />
          )}

          {tab === 'advanced' && <SettingsAdvancedPanel />}

          {tab === 'users' ? <UsersSettingsPanel /> : null}

          {status && <p className="type-caption">{status}</p>}
        </div>
      </div>
    </ToolLayout>
  );
}
