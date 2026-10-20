'use client';

import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { promptResultPreviewProps } from '@/lib/prompt/result-preview-props';
import { continueEditResultProps } from '@/lib/edit/continue-edit-result-props';
import { getReformatTargetLabel } from '@/lib/edit/reformat-target';
import { diffPromptWords } from '@/lib/prompt/diff';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { useRefineToolOrchestration } from '@/hooks/useRefineToolOrchestration';

type RefineResultSectionProps = Pick<
  ReturnType<typeof useRefineToolOrchestration>,
  | 'shared'
  | 'intentHints'
  | 'currentPrompt'
  | 'output'
  | 'setOutput'
  | 'beforePrompt'
  | 'copied'
  | 'sourceHistoryId'
  | 'actions'
  | 'selectedModel'
  | 'queueImageOptions'
  | 'assertInpaintMaskReady'
  | 'updateShared'
  | 'copyOutput'
>;

export default function RefineResultSection({
  shared,
  intentHints,
  currentPrompt,
  output,
  setOutput,
  beforePrompt,
  copied,
  sourceHistoryId,
  actions,
  selectedModel,
  queueImageOptions,
  assertInpaintMaskReady,
  updateShared,
  copyOutput,
}: RefineResultSectionProps) {
  return (
    <>
      {output && beforePrompt && beforePrompt !== output ? (
        <ToolSection title="Refine diff">
          <div className="grid gap-4 lg:grid-cols-2">
            <pre className="ui-code-block max-h-48 overflow-auto p-3 text-xs" data-tone="muted">
              {beforePrompt}
            </pre>
            <pre className="ui-code-block max-h-48 overflow-auto p-3 text-xs">{output}</pre>
          </div>
          {diffPromptWords(beforePrompt, output)
            .segments.filter(segment => segment.type === 'add')
            .slice(0, 12)
            .map(segment => segment.text)
            .join(', ') ? (
            <p className="text-xs text-[var(--text-muted)]">
              Added/changed:{' '}
              {diffPromptWords(beforePrompt, output)
                .segments.filter(segment => segment.type === 'add')
                .slice(0, 12)
                .map(segment => segment.text)
                .join(', ')}
            </p>
          ) : null}
        </ToolSection>
      ) : null}

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
            hints: intentHints || currentPrompt,
            parentHistoryId: sourceHistoryId,
          })
        }
        onSendComfyUi={() => {
          if (!assertInpaintMaskReady()) {
            return;
          }
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
        {...promptResultPreviewProps(actions, output)}
        {...continueEditResultProps(actions, output, { queueImageOptions })}
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, intentHints)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() => {
          if (!assertInpaintMaskReady()) {
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
        label="Queue refine"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => {
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
      >
        <div className="mb-2">
          <EditToolRecipeStrip
            toolId="refine"
            shared={shared}
            onApplied={next => updateShared(next)}
            compact
          />
        </div>
      </MobileStickyQueueBar>
    </>
  );
}
