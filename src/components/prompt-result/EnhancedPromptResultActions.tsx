'use client';

import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/Button';
import { CollapsibleSection, ToolActionRow, ToolSection } from '@/components/ui/ToolPageShell';

const ComfyWorkflowSelector = dynamic(() => import('@/components/ComfyWorkflowSelector'), {
  ssr: false,
  loading: () => null,
});
const QueueParamsPanel = dynamic(() => import('@/components/QueueParamsPanel'), {
  ssr: false,
  loading: () => null,
});
const ResultQuickActions = dynamic(() => import('@/components/ResultQuickActions'), {
  ssr: false,
  loading: () => null,
});

import type { UseComfyWorkflowSelectionResult } from '@/hooks/useComfyWorkflowSelection';

export type EnhancedPromptResultActionsProps = {
  compactActions: boolean;
  showComfyActions: boolean;
  showWorkflowSelector: boolean;
  workflowSelection: UseComfyWorkflowSelectionResult;
  queueReadinessAllowed: boolean;
  onSendComfyUi?: () => void;
  onSaveHistory?: () => void;
  onFixPrompt?: () => void;
  onCopyPair?: () => void;
  onLockSeed?: () => void;
  onCompact?: () => void;
  onReformat?: () => void;
  reformatTargetLabel?: string;
  onRunPipeline?: () => void;
  onExportSidecar?: () => void;
  onPreviewWorkflow?: () => void;
  onImprove?: () => void;
  onRefine?: () => void;
  onEditPrompt?: () => void;
  onContinueInpaint?: () => void;
  onContinueOutpaint?: () => void;
  onContinueCompose?: () => void;
  onContinueVideo?: () => void;
  onContinueControlNet?: () => void;
  onQueueSeedBatch?: () => void;
  seedBatchLabel?: string;
  onCopy: () => void;
  copied: boolean;
  historySaved?: boolean;
  pairCopied?: boolean;
  variationSeed?: string | null;
  seedLocked?: boolean;
  limits?: { minChars?: number; maxChars: number };
  outputLength: number;
  showQuickActions: boolean;
  quickActions: {
    prompt: string;
    negativePrompt?: string;
    model: string;
    seed?: number;
  };
};

export default function EnhancedPromptResultActions({
  compactActions,
  showComfyActions,
  showWorkflowSelector,
  workflowSelection,
  queueReadinessAllowed,
  onSendComfyUi,
  onSaveHistory,
  onFixPrompt,
  onCopyPair,
  onLockSeed,
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
  onCopy,
  copied,
  historySaved,
  pairCopied,
  variationSeed,
  seedLocked,
  limits,
  outputLength,
  showQuickActions,
  quickActions,
}: EnhancedPromptResultActionsProps) {
  return (
    <>
      {showQuickActions ? (
        <ResultQuickActions
          prompt={quickActions.prompt}
          negativePrompt={quickActions.negativePrompt}
          model={quickActions.model}
          seed={quickActions.seed}
        />
      ) : null}

      <ToolSection className="space-y-5">
        {onSendComfyUi ? (
          <ToolActionRow className="gap-3">
            <Button
              variant="primary"
              onClick={onSendComfyUi}
              data-action="send-comfyui"
              className={!queueReadinessAllowed ? 'border-[var(--tint-warning-border)]' : undefined}
            >
              {queueReadinessAllowed ? 'Queue' : 'Queue (below readiness)'}
            </Button>
          </ToolActionRow>
        ) : null}

        {showComfyActions ? (
          <CollapsibleSection
            title={compactActions ? 'Queue options' : 'Queue overrides'}
            summary={
              compactActions
                ? 'Workflow picker and advanced queue params.'
                : 'Workflow picker and advanced queue params — model/detail live in Shared settings.'
            }
            defaultOpen={false}
            persistKey={compactActions ? 'result-queue-options-compact' : 'result-queue-overrides'}
          >
            {showWorkflowSelector ? (
              <ComfyWorkflowSelector
                compact
                selectedId={workflowSelection.selectedId}
                defaultLabel={workflowSelection.defaultLabel}
                localFiles={workflowSelection.localFiles}
                serverFiles={workflowSelection.serverFiles}
                onChange={workflowSelection.setSelectedId}
                helpText="Optional override for Queue. Prefer Shared settings when possible."
              />
            ) : null}
            <QueueParamsPanel compact />
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection
          title="More actions"
          summary={
            compactActions
              ? 'Copy, save, compact, reformat, fix, export, and edit tools.'
              : 'Prepare, compact, reformat, lock seed, fix, history, preview, improve, and export.'
          }
          defaultOpen={false}
          persistKey={compactActions ? 'result-more-actions-compact' : 'result-more-actions'}
        >
          <ToolActionRow>
            <Button variant="secondary" onClick={onCopy} data-action="copy-prompt">
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            {onSaveHistory ? (
              <Button variant="secondary" onClick={onSaveHistory}>
                {historySaved ? 'Saved to history' : 'Save to history'}
              </Button>
            ) : null}
            {!compactActions && onRunPipeline ? (
              <Button variant="info" onClick={onRunPipeline}>
                Prepare for ComfyUI
              </Button>
            ) : null}
            {onCompact ? (
              <Button variant="danger" onClick={onCompact}>
                {limits && outputLength > limits.maxChars ? 'Compact to limit' : 'Compact prompt'}
              </Button>
            ) : null}
            {onReformat && reformatTargetLabel ? (
              <Button variant="secondary" onClick={onReformat}>
                Reformat for {reformatTargetLabel}
              </Button>
            ) : null}
            {onLockSeed && variationSeed ? (
              <Button variant="accent-outline" onClick={onLockSeed}>
                {seedLocked ? 'Seed locked' : 'Lock variation seed'}
              </Button>
            ) : null}
            {onFixPrompt ? (
              <Button variant="secondary" onClick={onFixPrompt}>
                Fix prompt (rules)
              </Button>
            ) : null}
            {onCopyPair ? (
              <Button variant="secondary" onClick={onCopyPair} data-action="copy-pair">
                {pairCopied ? 'Pair copied!' : 'Copy prompt pair'}
              </Button>
            ) : null}
            {onPreviewWorkflow ? (
              <Button variant="info" onClick={onPreviewWorkflow}>
                Preview workflow
              </Button>
            ) : null}
            {onImprove ? (
              <Button variant="secondary" onClick={onImprove}>
                Improve output
              </Button>
            ) : null}
            {onRefine ? (
              <Button variant="secondary" onClick={onRefine}>
                Open in Refine
              </Button>
            ) : null}
            {onEditPrompt ? (
              <Button variant="secondary" onClick={onEditPrompt}>
                Edit in Prompt Editor
              </Button>
            ) : null}
            {onContinueInpaint ? (
              <Button variant="secondary" onClick={onContinueInpaint}>
                Continue in Inpaint
              </Button>
            ) : null}
            {onContinueOutpaint ? (
              <Button variant="secondary" onClick={onContinueOutpaint}>
                Continue in Outpaint
              </Button>
            ) : null}
            {onContinueCompose ? (
              <Button variant="secondary" onClick={onContinueCompose}>
                Continue in Compose
              </Button>
            ) : null}
            {onContinueVideo ? (
              <Button variant="secondary" onClick={onContinueVideo}>
                Continue in Video
              </Button>
            ) : null}
            {onContinueControlNet ? (
              <Button variant="secondary" onClick={onContinueControlNet}>
                Continue in ControlNet
              </Button>
            ) : null}
            {onQueueSeedBatch ? (
              <Button variant="secondary" onClick={onQueueSeedBatch}>
                {seedBatchLabel ?? 'Queue 3 seed variants'}
              </Button>
            ) : null}
            {onExportSidecar ? (
              <Button variant="secondary" onClick={onExportSidecar}>
                Export sidecar JSON
              </Button>
            ) : null}
            {compactActions && onRunPipeline ? (
              <Button variant="info" onClick={onRunPipeline}>
                Prepare for ComfyUI
              </Button>
            ) : null}
          </ToolActionRow>
        </CollapsibleSection>
      </ToolSection>
    </>
  );
}
