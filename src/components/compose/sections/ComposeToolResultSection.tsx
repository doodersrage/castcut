'use client';

import { promptResultPreviewProps } from '@/lib/prompt/result-preview-props';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { continueEditResultProps } from '@/lib/edit/continue-edit-result-props';
import { getReformatTargetLabel } from '@/lib/edit/reformat-target';
import type { useComposeToolOrchestration } from '@/hooks/useComposeToolOrchestration';

type ComposeToolViewModel = ReturnType<typeof useComposeToolOrchestration>;

type ComposeToolResultSectionProps = ComposeToolViewModel;

export function ComposeToolResultSection({
  shared,
  updateShared,
  output,
  setOutput,
  copied,
  instruction,
  actions,
  selectedModel,
  queueImageOptions,
  assertReadyToQueue,
  copyOutput,
}: ComposeToolResultSectionProps) {
  return (
    <>
      <EnhancedPromptResult
        output={output}
        onOutputChange={setOutput}
        provider={output ? 'llm' : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        diagnostics={actions.diagnostics}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: instruction,
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
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, instruction)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.runExportPipeline(output, setOutput, {
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
        label="Queue Compose"
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
            toolId="compose"
            shared={shared}
            onApplied={next => updateShared(next)}
            compact
          />
        </div>
      </MobileStickyQueueBar>
    </>
  );
}
