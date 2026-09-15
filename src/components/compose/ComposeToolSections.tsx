'use client';

import { resolveCollabFieldValue } from '@/lib/collab-presence';
import CollabPresenceBar from '@/components/CollabPresenceBar';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { ToolBadge, ToolLayout, accentFocusClass } from '@/components/ui/ToolPageShell';
import type { useComposeToolOrchestration } from '@/hooks/useComposeToolOrchestration';
import { ComposeToolFormSection } from '@/components/compose/sections/ComposeToolFormSection';
import { ComposeToolResultSection } from '@/components/compose/sections/ComposeToolResultSection';

const ACCENT = 'cyan' as const;

type ComposeToolViewModel = ReturnType<typeof useComposeToolOrchestration>;

type ComposeToolSectionsProps = ComposeToolViewModel & {
  description: string;
};

export default function ComposeToolSections({
  description,
  shared,
  updateShared,
  updateToolSettings,
  toolSettings,
  setInstruction,
  instruction,
  selectedModel,
  output,
  ...rest
}: ComposeToolSectionsProps) {
  const vm = {
    description,
    shared,
    updateShared,
    updateToolSettings,
    toolSettings,
    setInstruction,
    instruction,
    selectedModel,
    output,
    ...rest,
  } as ComposeToolViewModel;

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Compose · {selectedModel.comfyNode}</ToolBadge>}
      title="Compose"
      description={description}
      sidebarPersistKey="compose"
      sidebar={
        <SharedToolControls
          toolId="compose"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output || instruction}
          onSharedSettingsChange={updateShared}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.compose} />
      <EditToolRecipeStrip
        toolId="compose"
        shared={shared}
        onApplied={next => updateShared(next)}
      />
      <HistoryHintSeedPanel
        tool="compose"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={instruction}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={setInstruction}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result =>
          updateToolSettings({
            instruction: result.hints,
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          })
        }
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <CollabPresenceBar
        tool="compose"
        draft={instruction}
        draftFields={{ instruction }}
        onApplyRemoteDraft={payload => {
          const next = resolveCollabFieldValue(payload, 'instruction');
          if (next) {
            setInstruction(next);
          }
        }}
      />
      <ComposeToolFormSection {...vm} />
      <ComposeToolResultSection {...vm} />
    </ToolLayout>
  );
}
