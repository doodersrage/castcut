import type { usePromptResultActions } from '@/hooks/usePromptResultActions';

type PromptResultActions = ReturnType<typeof usePromptResultActions>;

/** Shared continue-edit + seed-batch props for EnhancedPromptResult on edit/prompt tools. */
export function continueEditResultProps(
  actions: PromptResultActions,
  output: string,
  options?: {
    queueImageOptions?: Parameters<PromptResultActions['sendComfyUi']>[3];
    seedBatchCount?: number;
    includeSeedBatch?: boolean;
  }
) {
  const preview = actions.comfyUiPreviewUrl;
  const count = options?.seedBatchCount ?? 3;
  return {
    onImprove: () => actions.improveOutput(output, preview),
    onRefine: () => actions.refineOutput(output, preview),
    onContinueInpaint: () => actions.inpaintOutput(output, preview),
    onContinueOutpaint: () => actions.outpaintOutput(output, preview),
    onContinueCompose: () => actions.composeOutput(output, preview),
    onContinueVideo: () => actions.videoOutput(output, preview),
    onContinueControlNet: () => actions.controlNetOutput(output, preview),
    ...(options?.includeSeedBatch !== false
      ? {
          onQueueSeedBatch: () => {
            void actions.sendSeedVariationBatch(
              output,
              count,
              undefined,
              options?.queueImageOptions
            );
          },
          seedBatchLabel: `Queue ${count} seed variants`,
        }
      : {}),
  };
}
