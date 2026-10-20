'use client';

import type { SharedToolSettings } from '@/lib/settings/cache';
import type { SessionLlmProvider } from '@/lib/llm/providers';
import { useLlmCatalog } from '@/hooks/useLlmCatalog';
import LlmProviderPanel from '@/components/settings/panels/LlmProviderPanel';
import LocalLlmPanel from '@/components/settings/panels/LocalLlmPanel';
import LlmModelDefaultsPanel from '@/components/settings/panels/LlmModelDefaultsPanel';
import LlmPromptQualityPanel from '@/components/settings/panels/LlmPromptQualityPanel';
import type { ServerLlmSnapshot } from '@/components/settings/panels/llm-panel-shared';

type SettingsLlmPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  server?: ServerLlmSnapshot | null;
  autoVisionTags?: boolean;
  onAutoVisionTagsChange?: (value: boolean) => void;
  onTestConnection?: () => void;
  testingConnection?: boolean;
};

export default function SettingsLlmPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  server,
  autoVisionTags = true,
  onAutoVisionTagsChange,
  onTestConnection,
  testingConnection = false,
}: SettingsLlmPanelProps) {
  const catalog = useLlmCatalog(sharedSettings);

  function setSessionProvider(next: SessionLlmProvider) {
    if (next === catalog.sessionProvider) {
      return;
    }
    updateSharedSettings({
      sessionLlmProvider: next === 'server' ? undefined : next,
      sessionLlmModel: undefined,
      sessionLlmVisionModel: undefined,
      sessionLlmEmbedModel: undefined,
    });
    catalog.setCatalogLoading(true);
    catalog.resetOpenRouterFilter(next);
  }

  return (
    <>
      <LocalLlmPanel onChanged={onTestConnection} />
      <LlmProviderPanel
        sharedSettings={sharedSettings}
        sharedMounted={sharedMounted}
        updateSharedSettings={updateSharedSettings}
        server={server}
        sessionProvider={catalog.sessionProvider}
        catalogSource={catalog.catalogSource}
        catalogLoading={catalog.catalogLoading}
        catalogError={catalog.catalogError}
        catalogNeedsKey={catalog.catalogNeedsKey}
        catalogForSelectCount={catalog.catalogForSelect.length}
        catalogEntriesCount={catalog.catalogEntries.length}
        showOpenRouterAll={catalog.showOpenRouterAll}
        onToggleOpenRouterFilter={() => catalog.setShowOpenRouterAll(current => !current)}
        onReloadCatalog={() => void catalog.loadCatalog(sharedSettings.sessionLlmApiKey)}
        onProviderChange={setSessionProvider}
        onTestConnection={onTestConnection}
        testingConnection={testingConnection}
      />
      <LlmModelDefaultsPanel
        sharedSettings={sharedSettings}
        sharedMounted={sharedMounted}
        updateSharedSettings={updateSharedSettings}
        server={server}
        sessionProvider={catalog.sessionProvider}
        catalogForSelect={catalog.catalogForSelect}
        catalogLoading={catalog.catalogLoading}
        catalogError={catalog.catalogError}
      />
      <LlmPromptQualityPanel
        sharedSettings={sharedSettings}
        sharedMounted={sharedMounted}
        updateSharedSettings={updateSharedSettings}
        autoVisionTags={autoVisionTags}
        onAutoVisionTagsChange={onAutoVisionTagsChange}
      />
    </>
  );
}
