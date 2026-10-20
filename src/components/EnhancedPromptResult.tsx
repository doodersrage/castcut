'use client';

import EnhancedPromptResultView from '@/components/prompt-result/EnhancedPromptResultView';
import type {
  BatchPromptItem,
  BatchPromptItemActions,
  EnhancedPromptResultProps,
} from '@/components/prompt-result/enhanced-prompt-result-types';
import { useEnhancedPromptResultState } from '@/hooks/useEnhancedPromptResultState';
import { DEFAULT_READINESS_MIN_SCORE } from '@/lib/checks/readiness-gate';

export type { BatchPromptItem, BatchPromptItemActions };

export default function EnhancedPromptResult({
  diagnostics,
  onSaveHistory,
  onSendComfyUi,
  onFixPrompt,
  onCopyPair,
  onExportBatch,
  onQueueBatchComfyUi,
  onCompact,
  onReformat,
  reformatTargetLabel,
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
  workflowPreview,
  previewStatus,
  variationSeed,
  onLockSeed,
  seedLocked,
  fixStatus,
  compactStatus,
  reformatStatus,
  pipelineStatus,
  preDiagnostics,
  comfyUiStatus,
  comfyUiJob,
  comfyUiPreviewUrl,
  historySaved,
  pairCopied,
  batchOutputs,
  batchItems,
  batchCrossLinks,
  batchPromptActions,
  readinessModel,
  readinessDetail,
  readinessHints,
  negativePrompt,
  readinessMinScore = DEFAULT_READINESS_MIN_SCORE,
  readinessGateEnabled = true,
  showWeightInspector = true,
  onOutputChange,
  rawPrompt,
  onBatchPromptChange,
  compactActions: compactActionsProp,
  ...panelProps
}: EnhancedPromptResultProps) {
  const state = useEnhancedPromptResultState({
    output: panelProps.output,
    batchItems,
    batchOutputs,
    onSendComfyUi,
    onSaveHistory,
    onFixPrompt,
    onCopyPair,
    onLockSeed,
    onCompact,
    onReformat,
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
    onQueueBatchComfyUi,
    variationSeed,
    previewStatus,
    fixStatus,
    compactStatus,
    reformatStatus,
    pipelineStatus,
    comfyUiStatus,
    comfyUiPreviewUrl,
    readinessGateEnabled,
    readinessMinScore,
    compactActions: compactActionsProp,
  });

  if (state.isEmpty) return null;

  return (
    <EnhancedPromptResultView
      state={state}
      panelProps={panelProps}
      diagnostics={diagnostics}
      preDiagnostics={preDiagnostics}
      batchCrossLinks={batchCrossLinks}
      batchPromptActions={batchPromptActions}
      onOutputChange={onOutputChange}
      rawPrompt={rawPrompt}
      onBatchPromptChange={onBatchPromptChange}
      onExportBatch={onExportBatch}
      onQueueBatchComfyUi={onQueueBatchComfyUi}
      readinessModel={readinessModel}
      readinessDetail={readinessDetail}
      readinessHints={readinessHints}
      negativePrompt={negativePrompt}
      readinessMinScore={readinessMinScore}
      showWeightInspector={showWeightInspector}
      onCompact={onCompact}
      onFixPrompt={onFixPrompt}
      onReformat={onReformat}
      onSaveHistory={onSaveHistory}
      onSendComfyUi={onSendComfyUi}
      onCopyPair={onCopyPair}
      onLockSeed={onLockSeed}
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
      reformatTargetLabel={reformatTargetLabel}
      variationSeed={variationSeed}
      seedLocked={seedLocked}
      historySaved={historySaved}
      pairCopied={pairCopied}
      workflowPreview={workflowPreview}
      comfyUiJob={comfyUiJob}
      comfyUiPreviewUrl={comfyUiPreviewUrl}
    />
  );
}
