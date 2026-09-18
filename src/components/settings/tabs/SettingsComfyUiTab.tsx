'use client';

import dynamic from 'next/dynamic';
import ComfyUiSettingsJumpNav from '@/components/settings/ComfyUiSettingsJumpNav';
import SettingsBrowserPresetsPanel from '@/components/settings/SettingsBrowserPresetsPanel';
import WildcardListsEditor from '@/components/settings/WildcardListsEditor';
import WorkflowHealthPanel from '@/components/WorkflowHealthPanel';
import WorkflowDiffPanel from '@/components/settings/WorkflowDiffPanel';
import LoraLibrarySettingsPanel from '@/components/settings/LoraLibrarySettingsPanel';
import LoraTrainPanel from '@/components/settings/LoraTrainPanel';
import SettingsPromptQualityPanel from '@/components/settings/SettingsPromptQualityPanel';
import SettingsInferenceEnginePanel from '@/components/settings/panels/SettingsInferenceEnginePanel';
import SettingsComfyConnectionPanel from '@/components/settings/panels/SettingsComfyConnectionPanel';
import SettingsWorkflowMapPanel from '@/components/settings/panels/SettingsWorkflowMapPanel';
import SettingsModelAssetsPanel from '@/components/settings/panels/SettingsModelAssetsPanel';
import SettingsWorkflowPatchingPanel from '@/components/settings/panels/SettingsWorkflowPatchingPanel';
import SettingsIpAdapterPanel from '@/components/settings/panels/SettingsIpAdapterPanel';
import SettingsQueueParamsPanel from '@/components/settings/panels/SettingsQueueParamsPanel';
import SettingsHoldMaxPanel from '@/components/settings/panels/SettingsHoldMaxPanel';
import SettingsSamplerMemoryPanel from '@/components/settings/panels/SettingsSamplerMemoryPanel';
import { validateWorkflowJson, type CustomWorkflowToken } from '@/lib/comfyui-config';
import { placeholderTokensFromSettings } from '@/lib/comfyui-settings';
import type { ComfyUiSettings } from '@/lib/comfyui-settings';
import { fetchWorkflowPreview } from '@/lib/comfyui-requeue';
import type { ComfyUiSettingsSectionId } from '@/lib/settings-comfyui-nav';
import type { SharedToolSettings } from '@/lib/settings-cache';
import {
  SETTINGS_TOOL_ACCENT,
  type HealthResponse,
} from '@/components/settings/tabs/settings-tool-shared';
import { ToolSection, accentFocusClass, CollapsibleSection } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';

const ComfyWorkflowLibraryPanel = dynamic(() => import('@/components/ComfyWorkflowLibraryPanel'), {
  ssr: false,
  loading: () => <p className="text-sm text-[var(--text-muted)]">Loading workflow library…</p>,
});

const ACCENT = SETTINGS_TOOL_ACCENT;

export type SettingsComfyUiTabProps = {
  slimSettings?: boolean;
  onShowAllSettings?: () => void;
  comfyUiSection: ComfyUiSettingsSectionId | null;
  handleComfyUiSectionJump: (section: ComfyUiSettingsSectionId) => void;
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  mounted: boolean;
  settings: ComfyUiSettings;
  updateSettings: (patch: Partial<ComfyUiSettings>) => void;
  modelWorkflowMapText: string;
  setModelWorkflowMapText: (value: string) => void;
  modelCheckpointMapText: string;
  setModelCheckpointMapText: (value: string) => void;
  modelVaeMapText: string;
  setModelVaeMapText: (value: string) => void;
  modelRefinerMapText: string;
  setModelRefinerMapText: (value: string) => void;
  modelUpscaleMapText: string;
  setModelUpscaleMapText: (value: string) => void;
  modelControlNetMapText: string;
  setModelControlNetMapText: (value: string) => void;
  modelLoraMapText: string;
  setModelLoraMapText: (value: string) => void;
  loaderMapMergeHint: string | null;
  ipAdapterUploadStatus: string | null;
  ipAdapterUploading: boolean;
  setIpAdapterUploading: (value: boolean) => void;
  setIpAdapterUploadStatus: (value: string | null) => void;
  workflowHealthRefresh: number;
  setWorkflowHealthRefresh: (value: number | ((previous: number) => number)) => void;
  setStatus: (status: string | null) => void;
  applySuggestedLoaderMaps: () => void;
  syncLoaderMapsFromComfyInventory: () => void | Promise<void>;
  updateQueueParam: (key: 'seed' | 'width' | 'height' | 'cfg' | 'steps', value: string) => void;
  updateCustomToken: (index: number, patch: Partial<CustomWorkflowToken>) => void;
  addCustomToken: () => void;
  removeCustomToken: (index: number) => void;
  workflowError: string | null;
  setWorkflowError: (value: string | null) => void;
  workflowValidation: ReturnType<typeof validateWorkflowJson> | null;
  previewPrompt: string;
  setPreviewPrompt: (value: string) => void;
  previewLoading: boolean;
  previewError: string | null;
  workflowPreview: Awaited<ReturnType<typeof fetchWorkflowPreview>> | null;
  handlePreviewWorkflow: () => void | Promise<void>;
  handleImportWorkflow: (file: File) => void | Promise<void>;
  notificationPermission: NotificationPermission | 'unsupported';
  handleEnableNotifications: () => void | Promise<void>;
  handleSaveComfySettings: () => void;
  handleResetComfySettings: () => void;
  refreshHealth: () => void | Promise<void>;
  health: HealthResponse | null;
  healBusy?: boolean;
  healProgress?: string | null;
  handleHealAndReady?: () => void | Promise<void>;
};

export default function SettingsComfyUiTab({
  slimSettings = false,
  onShowAllSettings,
  comfyUiSection,
  handleComfyUiSectionJump,
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
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
  setStatus,
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
  refreshHealth,
  health,
  healBusy = false,
  healProgress = null,
  handleHealAndReady,
}: SettingsComfyUiTabProps) {
  const showAdvanced = !slimSettings;

  return (
    <>
      <ComfyUiSettingsJumpNav
        activeSection={comfyUiSection}
        onJump={handleComfyUiSectionJump}
        essentialsOnly={slimSettings}
      />
      {slimSettings ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] px-4 py-3 shadow-[inset_0_1px_0_rgb(255_255_255_/0.03)]">
          <p className="type-caption text-[var(--text-secondary)]">
            Essentials view — inference engine, ComfyUI connection, model downloads, and queue
            basics. Heal &amp; ready on Overview fills maps automatically.
          </p>
          {onShowAllSettings ? (
            <Button type="button" variant="secondary" size="sm" onClick={onShowAllSettings}>
              Show all ComfyUI settings
            </Button>
          ) : null}
        </div>
      ) : null}
      <SettingsInferenceEnginePanel
        sharedSettings={sharedSettings}
        updateSharedSettings={updateSharedSettings}
      />

      {showAdvanced ? (
        <SettingsBrowserPresetsPanel
          disabled={!sharedMounted || !mounted}
          onApply={preset => {
            updateSharedSettings(preset.shared);
            updateSettings(preset.comfyUi);
            setStatus(`Applied ${preset.label} browser preset.`);
          }}
        />
      ) : null}

      {showAdvanced ? (
        <SettingsWorkflowMapPanel
          sharedSettings={sharedSettings}
          sharedMounted={sharedMounted}
          updateSharedSettings={updateSharedSettings}
          settings={settings}
          modelWorkflowMapText={modelWorkflowMapText}
          setModelWorkflowMapText={setModelWorkflowMapText}
          setModelCheckpointMapText={setModelCheckpointMapText}
          setModelVaeMapText={setModelVaeMapText}
          setModelUpscaleMapText={setModelUpscaleMapText}
          setWorkflowHealthRefresh={setWorkflowHealthRefresh}
          setStatus={setStatus}
        />
      ) : null}

      <SettingsModelAssetsPanel
        setStatus={setStatus}
        syncLoaderMapsFromComfyInventory={syncLoaderMapsFromComfyInventory}
      />

      {showAdvanced ? (
        <>
          <SettingsWorkflowPatchingPanel
            sharedSettings={sharedSettings}
            sharedMounted={sharedMounted}
            updateSharedSettings={updateSharedSettings}
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
            workflowHealthRefresh={workflowHealthRefresh}
            applySuggestedLoaderMaps={applySuggestedLoaderMaps}
            syncLoaderMapsFromComfyInventory={syncLoaderMapsFromComfyInventory}
          />

          <SettingsIpAdapterPanel
            sharedSettings={sharedSettings}
            sharedMounted={sharedMounted}
            updateSharedSettings={updateSharedSettings}
            ipAdapterUploadStatus={ipAdapterUploadStatus}
            ipAdapterUploading={ipAdapterUploading}
            setIpAdapterUploading={setIpAdapterUploading}
            setIpAdapterUploadStatus={setIpAdapterUploadStatus}
          />

          <CollapsibleSection
            title="Custom wildcard lists"
            summary="Named lists for {wildcard} tokens in prompts"
            defaultOpen={false}
            persistKey="settings-wildcards-advanced"
          >
            <WildcardListsEditor
              lists={sharedSettings.wildcardLists}
              disabled={!sharedMounted}
              focusClassName={accentFocusClass(ACCENT)}
              onChange={wildcardLists =>
                updateSharedSettings({
                  wildcardLists: Object.keys(wildcardLists).length > 0 ? wildcardLists : undefined,
                })
              }
            />
          </CollapsibleSection>

          <div id="settings-comfyui-workflow-library" className="scroll-mt-28 space-y-6">
            <ComfyWorkflowLibraryPanel
              placeholderTokens={placeholderTokensFromSettings(settings)}
              onStatus={msg => {
                setStatus(msg);
                setWorkflowHealthRefresh(n => n + 1);
              }}
            />

            <WorkflowHealthPanel refreshKey={workflowHealthRefresh} />

            <WorkflowDiffPanel />
          </div>

          <ToolSection id="settings-comfyui-lora-library" title="LoRA library">
            <LoraLibrarySettingsPanel
              library={settings.loraLibrary}
              comfyUrl={settings.apiUrl}
              onChange={loraLibrary => updateSettings({ loraLibrary })}
              onStatus={setStatus}
            />
          </ToolSection>

          <div id="settings-comfyui-lora-train" className="scroll-mt-28">
            <CollapsibleSection
              title="LoRA train loop"
              summary="External trainer jobs — webhook or command — then register weights"
              defaultOpen={false}
              persistKey="settings-lora-train-advanced"
            >
              <LoraTrainPanel onStatus={setStatus} />
            </CollapsibleSection>
          </div>
        </>
      ) : null}

      <SettingsComfyConnectionPanel
        slimSettings={slimSettings}
        showAdvanced={showAdvanced}
        sharedSettings={sharedSettings}
        sharedMounted={sharedMounted}
        updateSharedSettings={updateSharedSettings}
        mounted={mounted}
        settings={settings}
        updateSettings={updateSettings}
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
        workflowHealthRefresh={workflowHealthRefresh}
        setWorkflowHealthRefresh={setWorkflowHealthRefresh}
        setStatus={setStatus}
        updateQueueParam={updateQueueParam}
        updateCustomToken={updateCustomToken}
        addCustomToken={addCustomToken}
        removeCustomToken={removeCustomToken}
        handleComfyUiSectionJump={handleComfyUiSectionJump}
      />

      <SettingsQueueParamsPanel />

      {showAdvanced ? (
        <>
          <SettingsPromptQualityPanel
            sharedSettings={sharedSettings}
            sharedMounted={sharedMounted}
            updateSharedSettings={updateSharedSettings}
            freeVramGb={
              typeof health?.comfyui.vram?.free === 'number' ? health.comfyui.vram.free / 1e9 : null
            }
            totalVramGb={
              typeof health?.comfyui.vram?.total === 'number'
                ? health.comfyui.vram.total / 1e9
                : null
            }
          />

          <SettingsHoldMaxPanel
            sharedSettings={sharedSettings}
            updateSharedSettings={updateSharedSettings}
            setStatus={setStatus}
          />

          <SettingsSamplerMemoryPanel
            sharedSettings={sharedSettings}
            updateSharedSettings={updateSharedSettings}
            setStatus={setStatus}
          />
        </>
      ) : null}
    </>
  );
}
