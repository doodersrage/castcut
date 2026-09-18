'use client';

import { useEffect, useRef } from 'react';
import SettingsConnectionFirstRun from '@/components/settings/SettingsConnectionFirstRun';
import QueueExportSettingsPanel from '@/components/settings/QueueExportSettingsPanel';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { SettingsComfyConnectionDesktopNotice } from '@/components/settings/panels/sections/SettingsComfyConnectionDesktopNotice';
import { SettingsComfyConnectionBasicsSection } from '@/components/settings/panels/sections/SettingsComfyConnectionBasicsSection';
import { SettingsComfyConnectionCustomTokensSection } from '@/components/settings/panels/sections/SettingsComfyConnectionCustomTokensSection';
import { SettingsComfyConnectionFallbackWorkflowSection } from '@/components/settings/panels/sections/SettingsComfyConnectionFallbackWorkflowSection';
import { SettingsComfyConnectionAutoImproveSection } from '@/components/settings/panels/sections/SettingsComfyConnectionAutoImproveSection';
import { SettingsComfyConnectionQueueAutomationSection } from '@/components/settings/panels/sections/SettingsComfyConnectionQueueAutomationSection';
import { SettingsComfyConnectionActionsFooter } from '@/components/settings/panels/sections/SettingsComfyConnectionActionsFooter';
import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

export type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

export default function SettingsComfyConnectionPanel(props: SettingsComfyConnectionPanelProps) {
  const {
    showAdvanced,
    sharedSettings,
    sharedMounted,
    updateSharedSettings,
    mounted,
    settings,
    updateSettings,
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
    setStatus,
    updateQueueParam,
    updateCustomToken,
    addCustomToken,
    removeCustomToken,
    handleComfyUiSectionJump,
  } = props;

  const autoHealStarted = useRef(false);
  useEffect(() => {
    if (!handleHealAndReady || autoHealStarted.current || typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('heal') !== '1') {
      return;
    }
    autoHealStarted.current = true;
    params.delete('heal');
    const next = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
    window.history.replaceState(null, '', next);
    scheduleAfterCommit(() => {
      void handleHealAndReady();
    });
  }, [handleHealAndReady]);

  return (
    <ToolSection id="settings-comfyui-connection" title="ComfyUI connection & injection">
      {handleHealAndReady ? (
        <SettingsConnectionFirstRun
          health={health}
          systemWorkflowsEnabled={sharedSettings.useSystemWorkflows === true}
          healBusy={healBusy}
          healProgress={healProgress}
          onHealAndReady={handleHealAndReady}
        />
      ) : null}

      <SettingsComfyConnectionDesktopNotice health={health} />

      <SettingsComfyConnectionBasicsSection
        settings={settings}
        updateSettings={updateSettings}
        sharedSettings={sharedSettings}
        sharedMounted={sharedMounted}
        updateSharedSettings={updateSharedSettings}
        health={health}
        refreshHealth={refreshHealth}
        updateQueueParam={updateQueueParam}
      />

      {!settings.useServerDefaults ? (
        <>
          <SettingsComfyConnectionCustomTokensSection
            settings={settings}
            addCustomToken={addCustomToken}
            updateCustomToken={updateCustomToken}
            removeCustomToken={removeCustomToken}
            handleComfyUiSectionJump={handleComfyUiSectionJump}
          />
          <SettingsComfyConnectionFallbackWorkflowSection
            settings={settings}
            updateSettings={updateSettings}
            sharedSettings={sharedSettings}
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
          />
        </>
      ) : null}

      {showAdvanced ? (
        <>
          <QueueExportSettingsPanel />
          <SettingsComfyConnectionAutoImproveSection
            settings={settings}
            updateSettings={updateSettings}
            setStatus={setStatus}
          />
          <SettingsComfyConnectionQueueAutomationSection
            settings={settings}
            updateSettings={updateSettings}
            sharedSettings={sharedSettings}
            sharedMounted={sharedMounted}
            updateSharedSettings={updateSharedSettings}
            notificationPermission={notificationPermission}
            handleEnableNotifications={handleEnableNotifications}
          />
        </>
      ) : null}

      <SettingsComfyConnectionActionsFooter
        mounted={mounted}
        settings={settings}
        handleSaveComfySettings={handleSaveComfySettings}
        refreshHealth={refreshHealth}
        handleResetComfySettings={handleResetComfySettings}
        setStatus={setStatus}
      />
    </ToolSection>
  );
}
