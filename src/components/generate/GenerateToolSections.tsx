'use client';

import dynamic from 'next/dynamic';
import BrandBars from '@/components/BrandBars';
import CollabPresenceBar from '@/components/CollabPresenceBar';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { resolveCollabFieldValue } from '@/lib/collab-presence';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { engineDisplayName, isCloudEngine } from '@/lib/engine/capabilities';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import type { useGenerateToolOrchestration } from '@/hooks/useGenerateToolOrchestration';
import { GenerateToolPromptSection } from '@/components/generate/sections/GenerateToolPromptSection';
import { GenerateToolOutputSection } from '@/components/generate/sections/GenerateToolOutputSection';

const SharedToolControls = dynamic(() => import('@/components/SharedToolControls'), {
  ssr: false,
  loading: () => (
    <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-muted)]/50" aria-hidden />
  ),
});

const ACCENT = 'brand' as const;

type GenerateToolViewModel = ReturnType<typeof useGenerateToolOrchestration>;

type GenerateToolSectionsProps = GenerateToolViewModel & {
  description: string;
};

export default function GenerateToolSections({
  description,
  mounted,
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  mode,
  output,
  setOutput,
  handoffNegative,
  setHandoffNegative,
  showHandoffNegative,
  input,
  setInput,
  hintSource,
  setHintSource,
  historySeedScope,
  genre,
  includePeople,
  alwaysIncludeClothing,
  seedLlmWithIngredients,
  autoFixRules,
  selectedModel,
  queueModel,
  generateModel,
  setQueueModel,
  setDetail,
  loading,
  error,
  submitDisabled,
  submitDisabledReason,
  randomResult,
  resultMeta,
  provider,
  copied,
  variationSeed,
  randomSeed,
  actions,
  queueGenerate,
  generate,
  generateRandom,
  copyOutput,
}: GenerateToolSectionsProps) {
  const vm = {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    mode,
    output,
    setOutput,
    handoffNegative,
    setHandoffNegative,
    showHandoffNegative,
    input,
    setInput,
    hintSource,
    setHintSource,
    historySeedScope,
    genre,
    includePeople,
    alwaysIncludeClothing,
    seedLlmWithIngredients,
    autoFixRules,
    selectedModel,
    queueModel,
    generateModel,
    setQueueModel,
    setDetail,
    loading,
    error,
    submitDisabled,
    submitDisabledReason,
    randomResult,
    resultMeta,
    provider,
    copied,
    variationSeed,
    randomSeed,
    actions,
    queueGenerate,
    generate,
    generateRandom,
    copyOutput,
  } as GenerateToolViewModel;

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          {isCloudEngine(shared.inferenceEngine)
            ? engineDisplayName(shared.inferenceEngine)
            : `ComfyUI · ${selectedModel.comfyNode}`}
        </ToolBadge>
      }
      title="Generate"
      description={description}
      sidebar={
        <SharedToolControls
          toolId="generate"
          shared={shared}
          onSharedSettingsChange={updateShared}
          onModelChange={setQueueModel}
          onDetailChange={setDetail}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={mode === 'positive' && (hintSource !== 'random' || includePeople)}
          alwaysIncludeClothing={alwaysIncludeClothing}
          onAlwaysIncludeClothingChange={value => updateShared({ alwaysIncludeClothing: value })}
          seedLlmWithIngredients={seedLlmWithIngredients}
          onSeedLlmWithIngredientsChange={value => updateShared({ seedLlmWithIngredients: value })}
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedLocation={shared.lockedLocation}
          lockedVariationSeed={shared.lockedVariationSeed}
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          onClearLockedVariationSeed={() => updateShared({ lockedVariationSeed: undefined })}
          autoFixRules={autoFixRules}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={input || output}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.generate} />
      {!output.trim() ? (
        <p className="ui-brand-tagline type-caption flex flex-wrap items-center gap-2 text-[var(--text-tertiary)]">
          <BrandBars />
          <span>
            Castcut
            <span className="mx-1.5 text-[var(--border-strong)]">·</span>
            scene → queue → gallery — Random surprise skips the blank page
          </span>
        </p>
      ) : null}
      <CollabPresenceBar
        tool="generate"
        draft={input}
        draftFields={{ hints: input }}
        onApplyRemoteDraft={payload => {
          const hints = resolveCollabFieldValue(payload, 'hints');
          if (hints) {
            updateToolSettings({ hints });
          }
        }}
      />
      <GenerateToolPromptSection {...vm} />
      <GenerateToolOutputSection {...vm} />
    </ToolLayout>
  );
}
