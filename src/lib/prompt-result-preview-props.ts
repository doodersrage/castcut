import type { AthleticSport } from '@/lib/athletic-sport-profiles';

type PromptResultActionsLike = {
  previewWorkflow: (prompt: string, sport?: AthleticSport | null) => Promise<void>;
  workflowPreview: Awaited<
    ReturnType<typeof import('@/lib/comfyui/requeue').fetchWorkflowPreview>
  > | null;
  previewStatus: string | null;
};

export function promptResultPreviewProps(
  actions: PromptResultActionsLike,
  prompt: string,
  sport?: AthleticSport | null
) {
  return {
    onPreviewWorkflow: () => void actions.previewWorkflow(prompt, sport ?? null),
    workflowPreview: actions.workflowPreview,
    previewStatus: actions.previewStatus,
  };
}

export type { PromptResultActionsLike };
