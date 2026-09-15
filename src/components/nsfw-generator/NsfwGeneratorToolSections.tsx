'use client';

import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { SceneGenerateFooter, SceneHintsField } from '@/components/scene-tool/SceneToolSections';
import NsfwGeneratorPresetsSection from '@/components/nsfw-generator/NsfwGeneratorPresetsSection';
import NsfwGeneratorResultSection from '@/components/nsfw-generator/NsfwGeneratorResultSection';
import { ToolBadge, ToolLayout, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldDivider } from '@/components/ui/Field';
import { conceptWildnessLabel, CONCEPT_WILDNESS_LABEL } from '@/lib/tool-ui-labels';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import type { useNsfwGeneratorToolOrchestration } from '@/hooks/useNsfwGeneratorToolOrchestration';

const ACCENT = 'fuchsia' as const;
const TOOL_ID = 'nsfw-generator';

type Props = ReturnType<typeof useNsfwGeneratorToolOrchestration> & { description: string };

export default function NsfwGeneratorToolSections({ description, ...vm }: Props) {
  const {
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    selectedModel,
    output,
    loading,
    error,
    generate,
  } = vm;

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Adult scene · {selectedModel.comfyNode}</ToolBadge>}
      title="Adult generator"
      description={description}
      sidebarPersistKey="nsfw-generator"
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={false}
          seedLlmWithIngredients={false}
          onSeedLlmWithIngredientsChange={() => undefined}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={output}
          toolId={TOOL_ID}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.nsfwGenerator} />
      <NsfwGeneratorPresetsSection {...vm} />
      <FieldDivider />
      <SceneHintsField
        label="Hints"
        hint="Optional extra direction — merged with the selected preset at generate time."
        value={toolSettings.hints ?? ''}
        onChange={value => updateToolSettings({ hints: value, hintSource: 'manual' })}
      />
      <label className="mt-4 block space-y-2">
        <span className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
          <span>{CONCEPT_WILDNESS_LABEL}</span>
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {conceptWildnessLabel(toolSettings.wildness ?? 60)}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={toolSettings.wildness ?? 60}
          onChange={event => updateToolSettings({ wildness: Number(event.target.value) })}
          className={`h-8 w-full cursor-pointer accent-[var(--accent)] ${accentFocusClass(ACCENT)}`}
        />
      </label>
      <SceneGenerateFooter
        accent={ACCENT}
        label="Generate adult prompt"
        onClick={() => void generate()}
        loading={loading}
        loadingLabel="Generating adult prompt"
        error={error}
      />
      <NsfwGeneratorResultSection {...vm} />
    </ToolLayout>
  );
}
