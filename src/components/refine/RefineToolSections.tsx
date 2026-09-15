'use client';

import SharedToolControls from '@/components/SharedToolControls';
import RefineInputSection from '@/components/refine/RefineInputSection';
import RefineResultSection from '@/components/refine/RefineResultSection';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import type { useRefineToolOrchestration } from '@/hooks/useRefineToolOrchestration';

const ACCENT = 'fuchsia' as const;

type RefineToolViewModel = ReturnType<typeof useRefineToolOrchestration>;

type RefineToolSectionsProps = RefineToolViewModel & {
  description: string;
};

export default function RefineToolSections({
  description,
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  file,
  previewUrl,
  currentPrompt,
  intentHints,
  setCurrentPrompt,
  setIntentHints,
  output,
  setOutput,
  loading,
  scanning,
  error,
  copied,
  sourceHistoryId,
  beforePrompt,
  actions,
  selectedModel,
  needsInpaintMask,
  regionalSlots,
  queueImageOptions,
  assertInpaintMaskReady,
  onMaskChange,
  onFileChange,
  scanWithVision,
  refine,
  copyOutput,
}: RefineToolSectionsProps) {
  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Refine · {selectedModel.comfyNode}</ToolBadge>}
      title="Refine"
      description={description}
      sidebarPersistKey="refine"
      sidebar={
        <SharedToolControls
          toolId="refine"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output || currentPrompt || intentHints}
          onSharedSettingsChange={updateShared}
          preferEditModels
        />
      }
    >
      <RefineInputSection
        shared={shared}
        toolSettings={toolSettings}
        updateShared={updateShared}
        updateToolSettings={updateToolSettings}
        file={file}
        previewUrl={previewUrl}
        needsInpaintMask={needsInpaintMask}
        regionalSlots={regionalSlots}
        currentPrompt={currentPrompt}
        intentHints={intentHints}
        setCurrentPrompt={setCurrentPrompt}
        setIntentHints={setIntentHints}
        loading={loading}
        scanning={scanning}
        error={error}
        onMaskChange={onMaskChange}
        onFileChange={onFileChange}
        scanWithVision={scanWithVision}
        refine={refine}
      />
      <RefineResultSection
        shared={shared}
        intentHints={intentHints}
        currentPrompt={currentPrompt}
        output={output}
        setOutput={setOutput}
        beforePrompt={beforePrompt}
        copied={copied}
        sourceHistoryId={sourceHistoryId}
        actions={actions}
        selectedModel={selectedModel}
        queueImageOptions={queueImageOptions}
        assertInpaintMaskReady={assertInpaintMaskReady}
        updateShared={updateShared}
        copyOutput={copyOutput}
      />
    </ToolLayout>
  );
}
