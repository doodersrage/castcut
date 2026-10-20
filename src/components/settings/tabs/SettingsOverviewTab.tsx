'use client';

import type { SharedToolSettings } from '@/lib/settings/cache';
import type { ComfyUiSettingsSectionId } from '@/lib/settings/comfyui-nav';
import type { HealthResponse } from '@/components/settings/tabs/settings-tool-shared';
import { SettingsOverviewSetupSection } from '@/components/settings/tabs/overview/SettingsOverviewSetupSection';
import { SettingsOverviewHealthSection } from '@/components/settings/tabs/overview/SettingsOverviewHealthSection';
import { SettingsOverviewAboutSection } from '@/components/settings/tabs/overview/SettingsOverviewAboutSection';

export type SettingsOverviewTabProps = {
  health: HealthResponse | null;
  loading: boolean;
  healBusy: boolean;
  healProgress?: string | null;
  handleHealAndReady: () => void | Promise<void>;
  refreshHealth: () => void | Promise<void>;
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  setStatus: (status: string | null) => void;
  slimSettings?: boolean;
  onOpenComfyUiSection?: (section: ComfyUiSettingsSectionId) => void;
  onShowAllSettings?: () => void;
  handleImport: (file: File) => void | Promise<void>;
  handleExportBackup: () => void;
};

export default function SettingsOverviewTab({
  health,
  loading,
  healBusy,
  healProgress,
  handleHealAndReady,
  refreshHealth,
  sharedSettings,
  setStatus,
  slimSettings = false,
  onOpenComfyUiSection,
  onShowAllSettings,
  handleImport,
  handleExportBackup,
}: SettingsOverviewTabProps) {
  return (
    <>
      <SettingsOverviewSetupSection
        health={health}
        healBusy={healBusy}
        healProgress={healProgress}
        handleHealAndReady={handleHealAndReady}
        slimSettings={slimSettings}
        onOpenComfyUiSection={onOpenComfyUiSection}
        onShowAllSettings={onShowAllSettings}
        handleImport={handleImport}
        handleExportBackup={handleExportBackup}
      />
      <SettingsOverviewHealthSection
        health={health}
        loading={loading}
        refreshHealth={refreshHealth}
        sharedSettings={sharedSettings}
        setStatus={setStatus}
        slimSettings={slimSettings}
      />
      <SettingsOverviewAboutSection />
    </>
  );
}
