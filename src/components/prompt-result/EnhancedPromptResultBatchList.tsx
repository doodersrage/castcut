'use client';

import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/Button';
import { CollapsibleSection, ToolBlockGroup, ToolSection } from '@/components/ui/ToolPageShell';
import { BatchPromptCard, type BatchPromptCrossLinks } from '@/components/ui/BatchPromptCard';
import { readRawPrompt } from '@/lib/prompt/raw-prompt';
import type {
  BatchPromptItem,
  BatchPromptItemActions,
} from '@/components/prompt-result/enhanced-prompt-result-types';

const ComfyWorkflowSelector = dynamic(() => import('@/components/ComfyWorkflowSelector'), {
  ssr: false,
  loading: () => null,
});

import type { UseComfyWorkflowSelectionResult } from '@/hooks/useComfyWorkflowSelection';

export type EnhancedPromptResultBatchListProps = {
  batchItems: BatchPromptItem[];
  batchCrossLinks?: BatchPromptCrossLinks;
  batchPromptActions?: BatchPromptItemActions;
  copiedBatchIndex: number | null;
  savedBatchIndices: Set<number>;
  pairCopiedBatchIndex: number | null;
  onCopyBatchPrompt: (prompt: string, index: number) => void | Promise<void>;
  onBatchPromptChange?: (index: number, value: string) => void;
  onExportBatch?: () => void;
  onQueueBatchComfyUi?: () => void;
  showWorkflowSelector: boolean;
  workflowSelection: UseComfyWorkflowSelectionResult;
  onSaveBatchHistory: (index: number, item: BatchPromptItem) => void;
  onCopyBatchPair: (prompt: string, index: number) => void;
};

export default function EnhancedPromptResultBatchList({
  batchItems,
  batchCrossLinks,
  batchPromptActions,
  copiedBatchIndex,
  savedBatchIndices,
  pairCopiedBatchIndex,
  onCopyBatchPrompt,
  onBatchPromptChange,
  onExportBatch,
  onQueueBatchComfyUi,
  showWorkflowSelector,
  workflowSelection,
  onSaveBatchHistory,
  onCopyBatchPair,
}: EnhancedPromptResultBatchListProps) {
  return (
    <ToolSection title={`Batch results (${batchItems.length})`}>
      <div className="mb-[var(--group-gap)] flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {onExportBatch ? (
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onExportBatch}>
            Export batch
          </Button>
        ) : null}
        {onQueueBatchComfyUi ? (
          <Button
            variant="accent-outline"
            className="w-full sm:w-auto"
            onClick={onQueueBatchComfyUi}
          >
            Queue batch to ComfyUI
          </Button>
        ) : null}
      </div>

      {showWorkflowSelector ? (
        <CollapsibleSection
          title="Batch workflow override"
          summary="Optional — Shared settings already pick the workflow."
          defaultOpen={false}
          persistKey="result-batch-workflow-override"
        >
          <ComfyWorkflowSelector
            compact
            selectedId={workflowSelection.selectedId}
            defaultLabel={workflowSelection.defaultLabel}
            localFiles={workflowSelection.localFiles}
            serverFiles={workflowSelection.serverFiles}
            onChange={workflowSelection.setSelectedId}
          />
        </CollapsibleSection>
      ) : null}

      <ToolBlockGroup className="mt-[var(--group-gap)]">
        {batchItems.map((item, index) => (
          <BatchPromptCard
            key={`batch-${index}-${item.prompt.slice(0, 24)}`}
            index={index}
            prompt={item.prompt}
            rawPrompt={readRawPrompt(item.metadata)}
            crossLinks={batchCrossLinks}
            copied={copiedBatchIndex === index}
            historySaved={savedBatchIndices.has(index)}
            pairCopied={pairCopiedBatchIndex === index}
            onCopy={() => void onCopyBatchPrompt(item.prompt, index)}
            onPromptChange={
              onBatchPromptChange ? value => onBatchPromptChange(index, value) : undefined
            }
            onQueueComfyUi={
              batchPromptActions?.onQueueComfyUi
                ? () => void batchPromptActions.onQueueComfyUi?.(item.prompt, index)
                : undefined
            }
            onSaveHistory={
              batchPromptActions?.onSaveHistory ? () => onSaveBatchHistory(index, item) : undefined
            }
            onCopyPair={
              batchPromptActions?.onCopyPair ? () => onCopyBatchPair(item.prompt, index) : undefined
            }
            onExportSidecar={
              batchPromptActions?.onExportSidecar
                ? () => void batchPromptActions.onExportSidecar?.(item.prompt, index, item.metadata)
                : undefined
            }
          />
        ))}
      </ToolBlockGroup>
    </ToolSection>
  );
}
