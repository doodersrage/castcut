'use client';

import SharedToolControls from '@/components/SharedToolControls';
import InpaintInputSection from '@/components/inpaint/InpaintInputSection';
import InpaintResultSection from '@/components/inpaint/InpaintResultSection';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import type { useInpaintToolOrchestration } from '@/hooks/useInpaintToolOrchestration';

const ACCENT = 'amber' as const;

type InpaintToolViewModel = ReturnType<typeof useInpaintToolOrchestration>;

type InpaintToolSectionsProps = InpaintToolViewModel & {
  description: string;
};

export default function InpaintToolSections({
  description,
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  previewUrl,
  file,
  scanning,
  anatomyRepairMode,
  maskDescription,
  changeDescription,
  directPrompt,
  setMaskDescription,
  setChangeDescription,
  setDirectPrompt,
  output,
  error,
  copied,
  actions,
  selectedModel,
  regionalSlots,
  queueImageOptions,
  onMaskChange,
  onFileChange,
  scanWithVision,
  assertReadyToQueue,
  lintAndSetDirectPrompt,
  copyOutput,
}: InpaintToolSectionsProps) {
  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Inpaint · {selectedModel.comfyNode}</ToolBadge>}
      title="Inpaint"
      description={description}
      sidebarPersistKey="inpaint"
      sidebar={
        <SharedToolControls
          toolId="inpaint"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output || changeDescription || maskDescription}
        />
      }
    >
      <InpaintInputSection
        shared={shared}
        toolSettings={toolSettings}
        updateShared={updateShared}
        updateToolSettings={updateToolSettings}
        previewUrl={previewUrl}
        file={file}
        scanning={scanning}
        anatomyRepairMode={anatomyRepairMode}
        maskDescription={maskDescription}
        changeDescription={changeDescription}
        directPrompt={directPrompt}
        setMaskDescription={setMaskDescription}
        setChangeDescription={setChangeDescription}
        setDirectPrompt={setDirectPrompt}
        output={output}
        error={error}
        actions={actions}
        queueImageOptions={queueImageOptions}
        onMaskChange={onMaskChange}
        onFileChange={onFileChange}
        scanWithVision={scanWithVision}
        assertReadyToQueue={assertReadyToQueue}
        lintAndSetDirectPrompt={lintAndSetDirectPrompt}
      />
      <InpaintResultSection
        shared={shared}
        toolSettings={toolSettings}
        updateShared={updateShared}
        updateToolSettings={updateToolSettings}
        previewUrl={previewUrl}
        maskDescription={maskDescription}
        changeDescription={changeDescription}
        setDirectPrompt={setDirectPrompt}
        output={output}
        copied={copied}
        actions={actions}
        selectedModel={selectedModel}
        regionalSlots={regionalSlots}
        queueImageOptions={queueImageOptions}
        assertReadyToQueue={assertReadyToQueue}
        copyOutput={copyOutput}
      />
    </ToolLayout>
  );
}
