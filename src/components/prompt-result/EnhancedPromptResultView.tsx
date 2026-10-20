'use client';

import dynamic from 'next/dynamic';
import PromptResultPanel from '@/components/PromptResultPanel';
import PromptDiagnosticsPanel from '@/components/PromptDiagnosticsPanel';
import ComfyUiJobStatusPanel from '@/components/ui/ComfyUiJobStatusPanel';
import StatusToastStrip from '@/components/ui/StatusToastStrip';
import EnhancedPromptResultActions from '@/components/prompt-result/EnhancedPromptResultActions';
import EnhancedPromptResultBatchList from '@/components/prompt-result/EnhancedPromptResultBatchList';
import EnhancedPromptResultPreviewSection from '@/components/prompt-result/EnhancedPromptResultPreviewSection';
import EnhancedPromptResultReadinessSection from '@/components/prompt-result/EnhancedPromptResultReadinessSection';
import type {
  BatchPromptItemActions,
  EnhancedPromptResultProps,
} from '@/components/prompt-result/enhanced-prompt-result-types';
import type { useEnhancedPromptResultState } from '@/hooks/useEnhancedPromptResultState';
import { isComfyUiJobProcessing } from '@/lib/comfyui/job-status';

const WorkflowPreviewPanel = dynamic(() => import('@/components/WorkflowPreviewPanel'), {
  ssr: false,
  loading: () => null,
});
const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

type ViewProps = {
  state: ReturnType<typeof useEnhancedPromptResultState>;
  panelProps: Pick<
    EnhancedPromptResultProps,
    'output' | 'provider' | 'comfyNode' | 'limits' | 'copied' | 'onCopy' | 'extraMeta'
  >;
  diagnostics?: EnhancedPromptResultProps['diagnostics'];
  preDiagnostics?: EnhancedPromptResultProps['preDiagnostics'];
  batchCrossLinks?: EnhancedPromptResultProps['batchCrossLinks'];
  batchPromptActions?: BatchPromptItemActions;
  onOutputChange?: EnhancedPromptResultProps['onOutputChange'];
  rawPrompt?: string;
  onBatchPromptChange?: EnhancedPromptResultProps['onBatchPromptChange'];
  onExportBatch?: EnhancedPromptResultProps['onExportBatch'];
  onQueueBatchComfyUi?: EnhancedPromptResultProps['onQueueBatchComfyUi'];
  readinessModel?: EnhancedPromptResultProps['readinessModel'];
  readinessDetail?: EnhancedPromptResultProps['readinessDetail'];
  readinessHints?: string;
  negativePrompt?: string;
  readinessMinScore: number;
  showWeightInspector: boolean;
  onCompact?: EnhancedPromptResultProps['onCompact'];
  onFixPrompt?: EnhancedPromptResultProps['onFixPrompt'];
  onReformat?: EnhancedPromptResultProps['onReformat'];
  onSaveHistory?: EnhancedPromptResultProps['onSaveHistory'];
  onSendComfyUi?: EnhancedPromptResultProps['onSendComfyUi'];
  onCopyPair?: EnhancedPromptResultProps['onCopyPair'];
  onLockSeed?: EnhancedPromptResultProps['onLockSeed'];
  onRunPipeline?: EnhancedPromptResultProps['onRunPipeline'];
  onExportSidecar?: EnhancedPromptResultProps['onExportSidecar'];
  onPreviewWorkflow?: EnhancedPromptResultProps['onPreviewWorkflow'];
  onImprove?: EnhancedPromptResultProps['onImprove'];
  onRefine?: EnhancedPromptResultProps['onRefine'];
  onEditPrompt?: EnhancedPromptResultProps['onEditPrompt'];
  onContinueInpaint?: EnhancedPromptResultProps['onContinueInpaint'];
  onContinueOutpaint?: EnhancedPromptResultProps['onContinueOutpaint'];
  onContinueCompose?: EnhancedPromptResultProps['onContinueCompose'];
  onContinueVideo?: EnhancedPromptResultProps['onContinueVideo'];
  onContinueControlNet?: EnhancedPromptResultProps['onContinueControlNet'];
  onQueueSeedBatch?: EnhancedPromptResultProps['onQueueSeedBatch'];
  seedBatchLabel?: string;
  reformatTargetLabel?: string;
  variationSeed?: string | null;
  seedLocked?: boolean;
  historySaved?: boolean;
  pairCopied?: boolean;
  workflowPreview?: EnhancedPromptResultProps['workflowPreview'];
  comfyUiJob?: EnhancedPromptResultProps['comfyUiJob'];
  comfyUiPreviewUrl?: string | null;
};

export default function EnhancedPromptResultView({
  state,
  panelProps,
  diagnostics,
  preDiagnostics,
  batchCrossLinks,
  batchPromptActions,
  onOutputChange,
  rawPrompt,
  onBatchPromptChange,
  onExportBatch,
  onQueueBatchComfyUi,
  readinessModel,
  readinessDetail,
  readinessHints,
  negativePrompt,
  readinessMinScore,
  showWeightInspector,
  onCompact,
  onFixPrompt,
  onReformat,
  onSaveHistory,
  onSendComfyUi,
  onCopyPair,
  onLockSeed,
  onRunPipeline,
  onExportSidecar,
  onPreviewWorkflow,
  onImprove,
  onRefine,
  onEditPrompt,
  onContinueInpaint,
  onContinueOutpaint,
  onContinueCompose,
  onContinueVideo,
  onContinueControlNet,
  onQueueSeedBatch,
  seedBatchLabel,
  reformatTargetLabel,
  variationSeed,
  seedLocked,
  historySaved,
  pairCopied,
  workflowPreview,
  comfyUiJob,
  comfyUiPreviewUrl,
}: ViewProps) {
  return (
    <div className="space-y-6">
      <ImageLightbox
        state={state.lightbox}
        onClose={() => state.setLightbox(null)}
        onIndexChange={index =>
          state.setLightbox(previous => (previous ? { ...previous, index } : previous))
        }
      />

      {preDiagnostics ? (
        <section className="space-y-2">
          <p className="type-overline">Pre-generation lint</p>
          <PromptDiagnosticsPanel diagnostics={preDiagnostics} />
        </section>
      ) : null}

      {state.showBatchCards ? (
        <EnhancedPromptResultBatchList
          batchItems={state.resolvedBatchItems}
          batchCrossLinks={batchCrossLinks}
          batchPromptActions={batchPromptActions}
          copiedBatchIndex={state.copiedBatchIndex}
          savedBatchIndices={state.savedBatchIndices}
          pairCopiedBatchIndex={state.pairCopiedBatchIndex}
          onCopyBatchPrompt={state.copyBatchPrompt}
          onBatchPromptChange={onBatchPromptChange}
          onExportBatch={onExportBatch}
          onQueueBatchComfyUi={onQueueBatchComfyUi}
          showWorkflowSelector={state.showWorkflowSelector}
          workflowSelection={state.workflowSelection}
          onSaveBatchHistory={(index, item) => {
            batchPromptActions?.onSaveHistory?.({
              prompt: item.prompt,
              index,
              metadata: item.metadata,
            });
            state.setSavedBatchIndices(previous => new Set(previous).add(index));
          }}
          onCopyBatchPair={(prompt, index) => {
            void batchPromptActions?.onCopyPair?.(prompt, index);
            state.setPairCopiedBatchIndex(index);
            window.setTimeout(() => state.setPairCopiedBatchIndex(null), 2000);
          }}
        />
      ) : (
        <PromptResultPanel {...panelProps} onOutputChange={onOutputChange} rawPrompt={rawPrompt} />
      )}

      <PromptDiagnosticsPanel diagnostics={diagnostics ?? null} />

      {readinessModel && readinessDetail ? (
        <EnhancedPromptResultReadinessSection
          output={panelProps.output}
          readinessModel={readinessModel}
          readinessDetail={readinessDetail}
          readinessHints={readinessHints}
          negativePrompt={negativePrompt}
          readinessMinScore={readinessMinScore}
          compactActions={state.compactActions}
          showWeightInspector={showWeightInspector}
          onOutputChange={onOutputChange}
          onCompact={onCompact}
          onFixPrompt={onFixPrompt}
          onReformat={onReformat}
          onResult={state.setReadinessResult}
        />
      ) : null}

      {state.showSingleActions ? (
        <EnhancedPromptResultActions
          compactActions={state.compactActions}
          showComfyActions={state.showComfyActions}
          showWorkflowSelector={state.showWorkflowSelector}
          workflowSelection={state.workflowSelection}
          queueReadinessAllowed={state.queueReadinessAllowed}
          onSendComfyUi={onSendComfyUi ? state.handleSendComfyUi : undefined}
          onSaveHistory={onSaveHistory}
          onFixPrompt={onFixPrompt}
          onCopyPair={onCopyPair}
          onLockSeed={onLockSeed}
          onCompact={onCompact}
          onReformat={onReformat}
          reformatTargetLabel={reformatTargetLabel}
          onRunPipeline={onRunPipeline}
          onExportSidecar={onExportSidecar}
          onPreviewWorkflow={onPreviewWorkflow}
          onImprove={onImprove}
          onRefine={onRefine}
          onEditPrompt={onEditPrompt}
          onContinueInpaint={onContinueInpaint}
          onContinueOutpaint={onContinueOutpaint}
          onContinueCompose={onContinueCompose}
          onContinueVideo={onContinueVideo}
          onContinueControlNet={onContinueControlNet}
          onQueueSeedBatch={onQueueSeedBatch}
          seedBatchLabel={seedBatchLabel}
          onCopy={panelProps.onCopy}
          copied={panelProps.copied}
          historySaved={historySaved}
          pairCopied={pairCopied}
          variationSeed={variationSeed}
          seedLocked={seedLocked}
          limits={panelProps.limits}
          outputLength={panelProps.output.length}
          showQuickActions={Boolean(
            panelProps.output.trim() &&
            (onSendComfyUi || onQueueBatchComfyUi) &&
            !state.compactActions
          )}
          quickActions={{
            prompt: panelProps.output,
            negativePrompt,
            model: typeof readinessModel === 'string' ? readinessModel : 'sdxl',
            seed: state.parsedSeed,
          }}
        />
      ) : null}

      {comfyUiJob && (isComfyUiJobProcessing(comfyUiJob) || comfyUiJob.status === 'error') ? (
        <ComfyUiJobStatusPanel job={comfyUiJob} />
      ) : null}

      {state.statusNotes.length > 0 && !(comfyUiJob && isComfyUiJobProcessing(comfyUiJob)) ? (
        <StatusToastStrip notes={state.statusNotes} />
      ) : null}

      {workflowPreview ? <WorkflowPreviewPanel preview={workflowPreview} /> : null}

      {comfyUiPreviewUrl ? (
        <EnhancedPromptResultPreviewSection
          comfyUiPreviewUrl={comfyUiPreviewUrl}
          onOpenLightbox={state.openComfyPreviewLightbox}
          onRefine={onRefine}
          onContinueInpaint={onContinueInpaint}
          onContinueOutpaint={onContinueOutpaint}
          onContinueCompose={onContinueCompose}
          onContinueVideo={onContinueVideo}
          onContinueControlNet={onContinueControlNet}
          onQueueSeedBatch={onQueueSeedBatch}
          seedBatchLabel={seedBatchLabel}
        />
      ) : null}
    </div>
  );
}
