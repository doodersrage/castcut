'use client';

import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import RegionalEditPanel from '@/components/RegionalEditPanel';
import { promptResultPreviewProps } from '@/lib/prompt/result-preview-props';
import { continueEditResultProps } from '@/lib/edit/continue-edit-result-props';
import { getReformatTargetLabel } from '@/lib/edit/reformat-target';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import type { useInpaintToolOrchestration } from '@/hooks/useInpaintToolOrchestration';

type InpaintResultSectionProps = Pick<
  ReturnType<typeof useInpaintToolOrchestration>,
  | 'shared'
  | 'toolSettings'
  | 'updateShared'
  | 'updateToolSettings'
  | 'previewUrl'
  | 'maskDescription'
  | 'changeDescription'
  | 'setDirectPrompt'
  | 'output'
  | 'copied'
  | 'actions'
  | 'selectedModel'
  | 'regionalSlots'
  | 'queueImageOptions'
  | 'assertReadyToQueue'
  | 'copyOutput'
>;

export default function InpaintResultSection({
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  previewUrl,
  maskDescription,
  changeDescription,
  setDirectPrompt,
  output,
  copied,
  actions,
  selectedModel,
  regionalSlots,
  queueImageOptions,
  assertReadyToQueue,
  copyOutput,
}: InpaintResultSectionProps) {
  return (
    <>
      <RegionalEditPanel
        slots={regionalSlots}
        onSlotsChange={next => updateToolSettings({ regionalSlots: next })}
        sourceImageUrl={previewUrl}
        accentClassName={accentFocusClass('amber')}
        persistKey="inpaint-regional-edit"
      />

      <EnhancedPromptResult
        output={output}
        onOutputChange={setDirectPrompt}
        provider={output ? 'template' : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        diagnostics={actions.diagnostics}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: maskDescription || changeDescription,
          })
        }
        onSendComfyUi={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
        {...promptResultPreviewProps(actions, output)}
        {...continueEditResultProps(actions, output, { queueImageOptions })}
        onFixPrompt={() => void actions.fixPrompt(output, setDirectPrompt, maskDescription)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setDirectPrompt)}
        onReformat={() => void actions.reformatForModel(output, setDirectPrompt)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.runExportPipeline(output, setDirectPrompt, {
            queueComfyUi: true,
            ...queueImageOptions,
          });
        }}
        onExportSidecar={() =>
          void actions.exportSidecar(output, { comfyNode: selectedModel.comfyNode })
        }
        fixStatus={actions.fixStatus}
        compactStatus={actions.compactStatus}
        reformatStatus={actions.reformatStatus}
        pipelineStatus={actions.pipelineStatus}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
        historySaved={actions.historySaved}
        pairCopied={actions.pairCopied}
      />
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue inpaint"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
      >
        <div className="mb-2">
          <EditToolRecipeStrip
            toolId="inpaint"
            shared={shared}
            onApplied={next => updateShared(next)}
            compact
          />
        </div>
      </MobileStickyQueueBar>
    </>
  );
}
