'use client';

import { useEffect, useRef } from 'react';
import SettingsConnectionFirstRun from '@/components/settings/SettingsConnectionFirstRun';
import ServiceDiscoveryCard from '@/components/settings/ServiceDiscoveryCard';
import QueueExportSettingsPanel from '@/components/settings/QueueExportSettingsPanel';
import { CollapsibleSection, ToolSection } from '@/components/ui/ToolPageShell';
import { SettingsComfyPlaceholderTokens } from '@/components/settings/panels/sections/SettingsComfyPlaceholderTokens';
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
  const manualInjectionFolded = sharedSettings.useSystemWorkflows === true;
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
      <ServiceDiscoveryCard
        health={health}
        comfyUrl={settings.apiUrl}
        onUseComfyUrl={url => {
          updateSettings({ apiUrl: url });
          setStatus?.(`Using ComfyUI at ${url}.`);
          window.setTimeout(() => void refreshHealth(), 300);
        }}
      />
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
        showPlaceholderTokens={!manualInjectionFolded}
      />

      {(() => {
        const manualInjection = (
          <>
            {manualInjectionFolded && !settings.useServerDefaults ? (
              <SettingsComfyPlaceholderTokens settings={settings} updateSettings={updateSettings} />
            ) : null}
            <SettingsComfyConnectionCustomTokensSection
              settings={settings}
              addCustomToken={addCustomToken}
              updateCustomToken={updateCustomToken}
              removeCustomToken={removeCustomToken}
              handleComfyUiSectionJump={handleComfyUiSectionJump}
            />
            {!settings.useServerDefaults ? (
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
            ) : null}
          </>
        );
        // System workflows build every queue themselves: placeholder tokens, custom tokens and the
        // fallback workflow only matter for hand-made workflows — keep them out of the way.
        return manualInjectionFolded ? (
          <CollapsibleSection
            title="Manual workflow injection"
            summary="Placeholder tokens, custom tokens and a fallback workflow — only for hand-made workflows; system workflows don't need them."
            defaultOpen={false}
            persistKey="settings-comfy-manual-injection"
          >
            {manualInjection}
          </CollapsibleSection>
        ) : (
          manualInjection
        );
      })()}

      {showAdvanced ? (
        <>
          <QueueExportSettingsPanel />
          <SettingsComfyConnectionAutoImproveSection
            settings={settings}
            updateSettings={updateSettings}
            sharedSettings={sharedSettings}
            updateSharedSettings={updateSharedSettings}
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
