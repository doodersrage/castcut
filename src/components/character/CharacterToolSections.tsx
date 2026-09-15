'use client';

import dynamic from 'next/dynamic';
import CollabPresenceBar from '@/components/CollabPresenceBar';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import type { useCharacterToolOrchestration } from '@/hooks/useCharacterToolOrchestration';
import { CharacterToolFormSection } from '@/components/character/sections/CharacterToolFormSection';
import { CharacterToolResultSection } from '@/components/character/sections/CharacterToolResultSection';

const SharedToolControls = dynamic(() => import('@/components/SharedToolControls'), {
  ssr: false,
  loading: () => (
    <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-muted)]/50" aria-hidden />
  ),
});

type CharacterToolViewModel = ReturnType<typeof useCharacterToolOrchestration>;
type CharacterToolSectionsProps = CharacterToolViewModel & { description: string };

export default function CharacterToolSections({ description, ...vm }: CharacterToolSectionsProps) {
  const {
    shared,
    updateShared,
    toolSettings,
    output,
    sceneMode,
    accent,
    selectedModel,
    lockedWardrobeLabel,
    applyCollabDraft,
  } = vm;

  return (
    <ToolLayout
      accent={accent}
      badge={<ToolBadge accent={accent}>Character · {selectedModel.comfyNode}</ToolBadge>}
      title="Character"
      description={description}
      sidebarPersistKey="character"
      sidebar={
        <SharedToolControls
          toolId="character"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          onSharedSettingsChange={updateShared}
          detailHelp={
            sceneMode === 'duo'
              ? 'Action mode works best with Rich detail for sport scenes.'
              : 'Rich detail recommended for character sheets and portraits.'
          }
          showWardrobeOption
          alwaysIncludeClothing={shared.alwaysIncludeClothing !== false}
          onAlwaysIncludeClothingChange={value => updateShared({ alwaysIncludeClothing: value })}
          seedLlmWithIngredients={shared.seedLlmWithIngredients !== false}
          onSeedLlmWithIngredientsChange={value => updateShared({ seedLlmWithIngredients: value })}
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedWardrobeLabel={
            shared.lockedWardrobeId ? (lockedWardrobeLabel ?? shared.lockedWardrobeId) : undefined
          }
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
          lockedLocation={shared.lockedLocation}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          lockedVariationSeed={shared.lockedVariationSeed}
          onClearLockedVariationSeed={() => updateShared({ lockedVariationSeed: undefined })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          activeCharacterDescriptor={shared.activeCharacterDescriptor}
          onActiveCharacterDescriptorChange={value =>
            updateShared({ activeCharacterDescriptor: value || undefined })
          }
          recommendFromText={output || toolSettings.hints || ''}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.character} />
      <CollabPresenceBar
        tool="character"
        draft={toolSettings.hints ?? ''}
        draftFields={{ hints: toolSettings.hints ?? '' }}
        onApplyRemoteDraft={applyCollabDraft}
      />
      <CharacterToolFormSection {...vm} />
      <CharacterToolResultSection {...vm} />
    </ToolLayout>
  );
}
