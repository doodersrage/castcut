import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { DetailLevel } from '@/lib/prompt/detail-level';

export type WorkflowPreviewResult = Awaited<
  ReturnType<typeof import('@/lib/comfyui/requeue').fetchWorkflowPreview>
>;

export type PromptResultActionsConfig = {
  tool: string;
  model: ComfyImageModel;
  detail?: DetailLevel;
  hints?: string;
  autoFixRules?: boolean;
  /** Target model for cross-model reformat chain. */
  reformatTarget?: ComfyImageModel;
};
