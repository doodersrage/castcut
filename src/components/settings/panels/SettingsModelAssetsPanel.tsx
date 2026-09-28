'use client';

import ModelsManager from '@/components/settings/models-manager/ModelsManager';
import { ToolSection } from '@/components/ui/ToolPageShell';

export type SettingsModelAssetsPanelProps = {
  setStatus: (status: string | null) => void;
  syncLoaderMapsFromComfyInventory: () => void | Promise<void>;
};

export default function SettingsModelAssetsPanel({
  setStatus,
  syncLoaderMapsFromComfyInventory,
}: SettingsModelAssetsPanelProps) {
  return (
    <ToolSection id="settings-comfyui-model-assets" title="Models">
      <ModelsManager
        onStatus={setStatus}
        onInstalled={() => {
          setStatus('Weight installed — syncing loader maps from Comfy inventory…');
          void Promise.resolve(syncLoaderMapsFromComfyInventory()).then(() => {
            setStatus('Loader maps synced from ComfyUI inventory after install.');
          });
        }}
      />
    </ToolSection>
  );
}
