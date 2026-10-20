'use client';

import { useCallback, useMemo, useState } from 'react';
import { useComfyWorkflowSelection } from '@/hooks/useComfyWorkflowSelection';
import { buildComfyPreviewLightbox } from '@/components/prompt-result/EnhancedPromptResultPreviewSection';
import type {
  BatchPromptItem,
  EnhancedPromptResultProps,
} from '@/components/prompt-result/enhanced-prompt-result-types';
import { buildEnhancedPromptStatusNotes } from '@/components/prompt-result/enhanced-prompt-result-utils';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import { DEFAULT_READINESS_MIN_SCORE, isReadinessQueueAllowed } from '@/lib/checks/readiness-gate';
import type { PromptReadinessResult } from '@/lib/prompt/readiness';
import { loadSettingsCache } from '@/lib/settings/cache';
import { usesSystemWorkflowPath } from '@/lib/workflow/system-workflow-runtime';
import { markComfyQueueIntent } from '@/lib/comfyui/comfy-setup-intent';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';

type OrchestrationInput = Pick<
  EnhancedPromptResultProps,
  | 'output'
  | 'batchItems'
  | 'batchOutputs'
  | 'onSendComfyUi'
  | 'onSaveHistory'
  | 'onFixPrompt'
  | 'onCopyPair'
  | 'onLockSeed'
  | 'onCompact'
  | 'onReformat'
  | 'onRunPipeline'
  | 'onExportSidecar'
  | 'onPreviewWorkflow'
  | 'onImprove'
  | 'onRefine'
  | 'onEditPrompt'
  | 'onContinueInpaint'
  | 'onContinueOutpaint'
  | 'onContinueCompose'
  | 'onContinueVideo'
  | 'onContinueControlNet'
  | 'onQueueSeedBatch'
  | 'onQueueBatchComfyUi'
  | 'variationSeed'
  | 'previewStatus'
  | 'fixStatus'
  | 'compactStatus'
  | 'reformatStatus'
  | 'pipelineStatus'
  | 'comfyUiStatus'
  | 'comfyUiPreviewUrl'
  | 'readinessGateEnabled'
  | 'readinessMinScore'
  | 'compactActions'
>;

export function useEnhancedPromptResultState({
  output,
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
  readinessGateEnabled = true,
  readinessMinScore = DEFAULT_READINESS_MIN_SCORE,
  compactActions: compactActionsProp,
}: OrchestrationInput) {
  const workspaceMode = useWorkspaceMode();
  const compactActions = compactActionsProp ?? workspaceMode !== 'full';
  const workflowSelection = useComfyWorkflowSelection();
  const sharedSettings = loadSettingsCache().shared;
  const showComfyActions = Boolean(onSendComfyUi || onQueueBatchComfyUi || onPreviewWorkflow);
  const showWorkflowSelector =
    workflowSelection.mounted && !usesSystemWorkflowPath(sharedSettings, sharedSettings.model);
  const [readinessResult, setReadinessResult] = useState<PromptReadinessResult | null>(null);
  const [copiedBatchIndex, setCopiedBatchIndex] = useState<number | null>(null);
  const [savedBatchIndices, setSavedBatchIndices] = useState<Set<number>>(() => new Set());
  const [pairCopiedBatchIndex, setPairCopiedBatchIndex] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);

  const queueReadinessAllowed =
    !readinessGateEnabled ||
    !readinessResult ||
    isReadinessQueueAllowed(readinessResult.score, readinessMinScore);

  const parsedSeed = useMemo(() => {
    if (!variationSeed?.trim()) return undefined;
    const numeric = Number(variationSeed.trim());
    return Number.isFinite(numeric) ? numeric : undefined;
  }, [variationSeed]);

  const resolvedBatchItems: BatchPromptItem[] =
    batchItems ?? batchOutputs?.map(prompt => ({ prompt })) ?? [];

  const handleSendComfyUi = useCallback(() => {
    if (!onSendComfyUi) return;
    if (
      readinessGateEnabled &&
      readinessResult &&
      !isReadinessQueueAllowed(readinessResult.score, readinessMinScore)
    ) {
      const proceed = window.confirm(
        `Prompt readiness is ${readinessResult.score}/100 (recommended minimum ${readinessMinScore}). Queue anyway?`
      );
      if (!proceed) return;
    }
    markComfyQueueIntent();
    onSendComfyUi();
  }, [onSendComfyUi, readinessGateEnabled, readinessMinScore, readinessResult]);

  const copyBatchPrompt = useCallback(async (prompt: string, index: number) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedBatchIndex(index);
      window.setTimeout(() => setCopiedBatchIndex(null), 2000);
    } catch {
      // Parent surfaces clipboard errors when using the main copy action.
    }
  }, []);

  const openComfyPreviewLightbox = useCallback(() => {
    if (!comfyUiPreviewUrl) return;
    setLightbox(buildComfyPreviewLightbox(comfyUiPreviewUrl, output));
  }, [comfyUiPreviewUrl, output]);

  const statusNotes = useMemo(
    () =>
      buildEnhancedPromptStatusNotes({
        pipelineStatus,
        previewStatus,
        fixStatus,
        compactStatus,
        reformatStatus,
        comfyUiStatus,
        variationSeed,
      }),
    [
      compactStatus,
      comfyUiStatus,
      fixStatus,
      pipelineStatus,
      previewStatus,
      reformatStatus,
      variationSeed,
    ]
  );

  const showBatchCards = resolvedBatchItems.length > 0;
  const showSingleActions = Boolean(
    output &&
    !showBatchCards &&
    (onSaveHistory ||
      onSendComfyUi ||
      onFixPrompt ||
      onCopyPair ||
      onLockSeed ||
      onCompact ||
      onReformat ||
      onRunPipeline ||
      onExportSidecar ||
      onPreviewWorkflow ||
      onImprove ||
      onRefine ||
      onEditPrompt ||
      onContinueInpaint ||
      onContinueOutpaint ||
      onContinueCompose ||
      onContinueVideo ||
      onContinueControlNet ||
      onQueueSeedBatch)
  );

  const isEmpty = !output && resolvedBatchItems.length === 0;

  return {
    compactActions,
    workflowSelection,
    showComfyActions,
    showWorkflowSelector,
    readinessResult,
    setReadinessResult,
    copiedBatchIndex,
    savedBatchIndices,
    setSavedBatchIndices,
    pairCopiedBatchIndex,
    setPairCopiedBatchIndex,
    lightbox,
    setLightbox,
    queueReadinessAllowed,
    parsedSeed,
    resolvedBatchItems,
    handleSendComfyUi,
    copyBatchPrompt,
    openComfyPreviewLightbox,
    statusNotes,
    showBatchCards,
    showSingleActions,
    isEmpty,
  };
}
