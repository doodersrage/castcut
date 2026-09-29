'use client';

/**
 * Workflow library health, queue-time half: build each model workflow exactly as a queue would
 * (placeholders, loader maps, LoRA stack) and run the queue preflight on the result. Library
 * JSON is a template, so its raw placeholders say nothing about whether it will queue.
 */

import type { ComfyWorkflowFile } from './comfyui-workflow-files';
import { resolveRuntimeForQueueAsync } from './comfyui-runtime-for-model';
import type { ComfyImageModel } from './comfy-models/client';
import { isEditCapableModel } from './model-denoise-defaults';
import { runWorkflowPreflight } from './workflow-preflight';
import { isToolScaffoldWorkflow, type WorkflowHealthIssue } from './workflow-health-audit';

const SAMPLE_PROMPT = 'A woman standing in a sunlit park, natural light, photo.';

export function workflowNeedsQueueTest(file: Pick<ComfyWorkflowFile, 'workflowJson'>): boolean {
  const json = file.workflowJson.trim();
  return Boolean(json) && !isToolScaffoldWorkflow(json);
}

export async function queueTestWorkflowFile(
  file: ComfyWorkflowFile,
  model: string
): Promise<WorkflowHealthIssue[]> {
  const runtime = await resolveRuntimeForQueueAsync(model as ComfyImageModel);
  const result = await runWorkflowPreflight({
    model,
    prompts: [SAMPLE_PROMPT],
    negativePrompt: 'blurry, low quality',
    hasInputImage: isEditCapableModel(model),
    comfy: { ...runtime, workflowJson: file.workflowJson, workflowFileId: file.id },
  });
  return result.issues.map(issue => ({
    workflowId: file.id,
    workflowName: file.name,
    severity: issue.severity,
    message: `[${model}] Queue test: ${issue.message}`,
    action: 'open-workflow' as const,
  }));
}
