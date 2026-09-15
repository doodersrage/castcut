'use client';

import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ToolPrimarySection from '@/components/ui/ToolPrimarySection';
import type { useVariationGridOrchestration } from '@/hooks/useVariationGridOrchestration';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { VariationGridSetupSection } from '@/components/variations/sections/VariationGridSetupSection';
import { VariationGridActionsSection } from '@/components/variations/sections/VariationGridActionsSection';
import { VariationGridResultsSection } from '@/components/variations/sections/VariationGridResultsSection';
import { VARIATION_GRID_ACCENT } from '@/components/variations/variation-grid-shared';

type VariationGridViewModel = ReturnType<typeof useVariationGridOrchestration>;

type VariationGridToolSectionsProps = VariationGridViewModel & {
  description: string;
};

export default function VariationGridToolSections({
  description,
  ...vm
}: VariationGridToolSectionsProps) {
  const {
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    results,
    queueLoading,
    lintLoading,
    status,
    queueProgress,
  } = vm;

  return (
    <ToolLayout
      accent={VARIATION_GRID_ACCENT}
      width="wide"
      badge={<ToolBadge accent={VARIATION_GRID_ACCENT}>Variation grid</ToolBadge>}
      title="Variations"
      description={description}
      sidebarPersistKey="variations"
      sidebar={
        <SharedToolControls
          toolId="variations"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          seedLlmWithIngredients={shared.seedLlmWithIngredients !== false}
          onSeedLlmWithIngredientsChange={value => updateShared({ seedLlmWithIngredients: value })}
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedLocation={shared.lockedLocation}
          lockedVariationSeed={shared.lockedVariationSeed}
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          onClearLockedVariationSeed={() => updateShared({ lockedVariationSeed: undefined })}
          recommendFromText={toolSettings.hints ?? ''}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.variations} />
      <ToolPrimarySection
        title="Variation setup"
        description="Pick a generator, set count and hints, then roll or queue a batch."
      >
        <VariationGridSetupSection {...vm} />
        <VariationGridActionsSection {...vm} />
      </ToolPrimarySection>
      <VariationGridResultsSection {...vm} />
      <MobileStickyQueueBar
        disabled={results.every(entry => !entry.prompt) || queueLoading || lintLoading}
        label="Queue grid"
        status={queueProgress?.message ?? status}
        primaryGenerate
        onQueue={() => void vm.queueGrid()}
      />
    </ToolLayout>
  );
}
