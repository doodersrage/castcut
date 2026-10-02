'use client';

import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';

type PromptActions = ReturnType<typeof usePromptResultActions>;

type VideoPromptResultSectionProps = {
  output: string;
  motion: string;
  model: string;
  detail: string | undefined;
  copied: boolean;
  actions: PromptActions;
  onOutputChange: (value: string) => void;
  onCopy: () => void;
  onQueue: () => void;
};

export default function VideoPromptResultSection({
  output,
  motion,
  model,
  detail,
  copied,
  actions,
  onOutputChange,
  onCopy,
  onQueue,
}: VideoPromptResultSectionProps) {
  return (
    <>
      {output ? (
        <EnhancedPromptResult
          output={output}
          provider="rules"
          comfyNode="Video text encode"
          readinessModel={model}
          readinessDetail={detail}
          readinessHints={motion}
          copied={copied}
          onCopy={onCopy}
          onOutputChange={onOutputChange}
          onSaveHistory={() => actions.saveHistory({ prompt: output, hints: motion })}
          onSendComfyUi={onQueue}
          onExportSidecar={() => actions.exportSidecar(output, { metadata: { hints: motion } })}
          {...promptResultPreviewProps(actions, output, null)}
          {...continueEditResultProps(actions, output)}
          onFixPrompt={() => void actions.fixPrompt(output, onOutputChange, motion)}
          onCopyPair={() => void actions.copyPromptPair(output, null)}
          // No "Reformat for <image model>": a clip prompt has no image-model twin (it offered
          // FLUX.2 Klein on a WAN prompt).
          onCompact={() => void actions.compactPrompt(output, onOutputChange)}
          comfyUiStatus={actions.comfyUiStatus}
          comfyUiJob={actions.comfyUiJob}
          comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
          historySaved={actions.historySaved}
        />
      ) : null}
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue video"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={onQueue}
      />
    </>
  );
}
