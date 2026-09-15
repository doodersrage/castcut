'use client';

import SharedToolControls from '@/components/SharedToolControls';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import ImagePromptInputSection from '@/components/image-prompt/ImagePromptInputSection';
import ImagePromptResultSection from '@/components/image-prompt/ImagePromptResultSection';
import type { useImagePromptToolOrchestration } from '@/hooks/useImagePromptToolOrchestration';

const ACCENT = 'fuchsia' as const;

type ImagePromptToolViewModel = ReturnType<typeof useImagePromptToolOrchestration>;

type ImagePromptToolSectionsProps = ImagePromptToolViewModel & {
  description: string;
};

export default function ImagePromptToolSections({
  description,
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  refImages,
  setRefImages,
  output,
  setOutput,
  result,
  loading,
  error,
  copied,
  refineIntent,
  setRefineIntent,
  handoffQueueParams,
  actions,
  selectedModel,
  inferredSport,
  selectedPreset,
  mounted,
  addRefImage,
  removeRefImage,
  onFileChange,
  generate,
  copyOutput,
  refine,
}: ImagePromptToolSectionsProps) {
  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          {TOOL_SETUP_LABELS.imagePrompt} · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Image → Prompt"
      description={description}
      sidebarPersistKey="image-prompt"
      sidebar={
        <SharedToolControls
          toolId="imagePrompt"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={output}
          preferEditModels
        />
      }
    >
      <ImagePromptInputSection
        mounted={mounted}
        shared={shared}
        toolSettings={toolSettings}
        updateShared={updateShared}
        updateToolSettings={updateToolSettings}
        refImages={refImages}
        setRefImages={setRefImages}
        loading={loading}
        error={error}
        selectedPreset={selectedPreset}
        addRefImage={addRefImage}
        removeRefImage={removeRefImage}
        onFileChange={onFileChange}
        generate={generate}
      />
      <ImagePromptResultSection
        shared={shared}
        toolSettings={toolSettings}
        refImages={refImages}
        output={output}
        setOutput={setOutput}
        result={result}
        loading={loading}
        copied={copied}
        refineIntent={refineIntent}
        setRefineIntent={setRefineIntent}
        handoffQueueParams={handoffQueueParams}
        actions={actions}
        selectedModel={selectedModel}
        inferredSport={inferredSport}
        copyOutput={copyOutput}
        refine={refine}
      />
    </ToolLayout>
  );
}
