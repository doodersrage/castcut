'use client';

import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { readRawPrompt } from '@/lib/raw-prompt';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import type { AthleticSport } from '@/lib/athletic-sport-profiles';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';

type PromptResultActions = ReturnType<typeof usePromptResultActions>;

type ScenePromptResultLike = {
  provider?: EnrichedToolGenerateResult['provider'] | null;
  comfyNode?: string;
  limits?: EnrichedToolGenerateResult['limits'];
  diagnostics?: EnrichedToolGenerateResult['diagnostics'];
  metadata?: Record<string, unknown>;
} | null;

export type ScenePromptResultPanelProps = {
  output: string;
  onOutputChange: (value: string) => void;
  result: ScenePromptResultLike;
  copied: boolean;
  onCopy: () => void;
  actions: PromptResultActions;
  shared: Pick<SharedToolSettings, 'model' | 'detail' | 'lockedVariationSeed'>;
  selectedComfyNode: string;
  queueLabel: string;
  hints?: string;
  passHintsToFix?: boolean;
  variationSeed?: string | null;
  onLockSeed?: () => void;
  includeEditPrompt?: boolean;
  includeVariationSeed?: boolean;
  includeStickyBar?: boolean;
  extraMeta?: string;
  compactActions?: boolean;
  preDiagnostics?: PromptResultActions['preDiagnostics'];
  onSendComfyUi?: () => void;
  onCopyPair?: () => void;
  onQueue?: () => void;
  previewSport?: AthleticSport | null;
  reformatTargetLabel?: string;
  resultExtras?: object;
};

/** Shared generate-result + mobile queue chrome for scene tools. */
export default function ScenePromptResultPanel({
  output,
  onOutputChange,
  result,
  copied,
  onCopy,
  actions,
  shared,
  selectedComfyNode,
  queueLabel,
  hints,
  passHintsToFix = true,
  variationSeed,
  onLockSeed,
  includeEditPrompt = true,
  includeVariationSeed = true,
  includeStickyBar = true,
  extraMeta,
  compactActions,
  preDiagnostics,
  onSendComfyUi,
  onCopyPair,
  onQueue,
  previewSport,
  reformatTargetLabel,
  resultExtras,
}: ScenePromptResultPanelProps) {
  const queue = onSendComfyUi ?? (() => void actions.sendComfyUi(output));

  return (
    <>
      <EnhancedPromptResult
        output={output}
        onOutputChange={onOutputChange}
        rawPrompt={readRawPrompt(result?.metadata)}
        provider={result?.provider ?? null}
        comfyNode={result?.comfyNode}
        limits={result?.limits}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={onCopy}
        extraMeta={extraMeta}
        compactActions={compactActions}
        preDiagnostics={preDiagnostics}
        diagnostics={actions.diagnostics ?? result?.diagnostics ?? null}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints,
            metadata: result?.metadata,
          })
        }
        onSendComfyUi={queue}
        onEditPrompt={
          includeEditPrompt
            ? () => actions.editPromptOutput(output, actions.comfyUiPreviewUrl, undefined, hints)
            : undefined
        }
        {...promptResultPreviewProps(actions, output, previewSport)}
        {...continueEditResultProps(actions, output)}
        onFixPrompt={() =>
          void actions.fixPrompt(output, onOutputChange, passHintsToFix ? hints : undefined)
        }
        onCopyPair={onCopyPair ?? (() => void actions.copyPromptPair(output, previewSport))}
        onCompact={() => void actions.compactPrompt(output, onOutputChange)}
        onReformat={() => void actions.reformatForModel(output, onOutputChange)}
        reformatTargetLabel={reformatTargetLabel ?? getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(output, onOutputChange, {
            maxChars: result?.limits?.maxChars,
            queueComfyUi: true,
          })
        }
        onExportSidecar={() =>
          void actions.exportSidecar(output, {
            comfyNode: result?.comfyNode ?? selectedComfyNode,
            ...(includeVariationSeed
              ? { variationSeed: variationSeed ?? shared.lockedVariationSeed }
              : {}),
            metadata: result?.metadata,
          })
        }
        onLockSeed={onLockSeed}
        variationSeed={includeVariationSeed ? variationSeed : undefined}
        seedLocked={
          includeVariationSeed
            ? Boolean(variationSeed && shared.lockedVariationSeed?.trim() === variationSeed.trim())
            : undefined
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
        {...(resultExtras ?? {})}
      />
      {includeStickyBar ? (
        <MobileStickyQueueBar
          disabled={!output.trim() || Boolean(actions.comfyUiStatus?.startsWith('Queueing'))}
          label={queueLabel}
          status={actions.comfyUiStatus}
          primaryGenerate
          onQueue={onQueue ?? queue}
        />
      ) : null}
    </>
  );
}
