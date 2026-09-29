import type { ComfyImageModel } from './comfy-models/client';
import {
  collectWorkflowGraphPreflightIssues,
  summarizeWorkflowGraphPreflight,
  type WorkflowPreflightIssue,
} from './workflow-preflight-core';
import type { ComfyUiModelLists } from './comfyui-object-info';

export type { WorkflowPreflightIssue };

export function runWorkflowPreflightSync(input: {
  workflowJson?: string;
  workflow?: Record<string, unknown> | null;
  model: ComfyImageModel | string;
  negativePrompt?: string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
  syncWorkflowLoadersToModel?: boolean;
  knownNodeTypes?: Set<string> | string[];
  models?: ComfyUiModelLists | null;
  objectInfoUnavailable?: boolean;
  customTokens?: Array<{ token: string; value: string }>;
  lightningAlreadyPrepared?: boolean;
  stackLoraFilenames?: string[];
}): { ok: boolean; issues: WorkflowPreflightIssue[] } {
  void input.negativePrompt;
  return summarizeWorkflowGraphPreflight(input);
}

export { collectWorkflowGraphPreflightIssues };
