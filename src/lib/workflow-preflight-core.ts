import type { ComfyImageModel } from './comfy-models/client';
import { isQwenLightningModel } from './model-sampling-patch';
import { auditWorkflowStackCompatibility } from './workflow-stack-fingerprint';
import { auditWorkflowPreviewIssues } from './workflow-placeholder-audit';
import { auditWorkflowNodeTypes } from './workflow-node-type-audit';
import { auditDualClipNodesInWorkflow } from './workflow-dual-clip-audit';
import type { ComfyUiModelLists } from './comfyui-object-info';
import {
  auditLightningWorkflowIssues,
  auditDistilledTurboWorkflowIssues,
} from './workflow-lightning-queue';
import { auditLoaderFilenamesInWorkflow } from './workflow-loader-filename-audit';
import { buildLightningLoraFilenameMap } from './workflow-lora-patch';
import { resolveWorkflowGraphInput } from './workflow-graph-input';

export type WorkflowPreflightIssue = {
  severity: 'error' | 'warn';
  message: string;
  /** Optional deep-link for queue-failure playbooks / toasts. */
  href?: string;
  classType?: string;
};

export type WorkflowGraphPreflightInput = {
  workflowJson?: string;
  /** Prefer passing the live graph after inject to avoid re-parse. */
  workflow?: Record<string, unknown> | null;
  model: ComfyImageModel | string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
  syncWorkflowLoadersToModel?: boolean;
  knownNodeTypes?: Set<string> | string[];
  models?: ComfyUiModelLists | null;
  objectInfoUnavailable?: boolean;
  customTokens?: Array<{ token: string; value: string }>;
  /** Inject already ran prepareLightningWorkflowForQueue — skip a second prep in audit. */
  lightningAlreadyPrepared?: boolean;
  /** Files of the queued LoRA stack — chained in on purpose, so not "stray" style LoRAs. */
  stackLoraFilenames?: string[];
};

function isQwenImage21Workflow(
  workflow: Record<string, unknown> | null | undefined,
  workflowJson: string | undefined
): boolean {
  if (workflow) {
    return Object.values(workflow).some(
      node => (node as { class_type?: string } | null)?.class_type === 'TextEncodeQwenImage21'
    );
  }
  return Boolean(workflowJson?.includes('"TextEncodeQwenImage21"'));
}

/**
 * Shared graph audits used by client preview preflight and server queue preflight.
 * Keep Lightning + inventory checks here so UI and /prompt cannot diverge.
 */
export function collectWorkflowGraphPreflightIssues(
  input: WorkflowGraphPreflightInput
): WorkflowPreflightIssue[] {
  const issues: WorkflowPreflightIssue[] = [];
  const { workflow, workflowJson } = resolveWorkflowGraphInput(input);
  // Engine → Renderer swapped the Qwen-Edit sampler onto Qwen-Image 2.1: the engine's Lightning
  // LoRA / AuraFlow shift / checkpoint stack are dropped on purpose, so their audits don't apply.
  const renderedOnImage21 = isQwenImage21Workflow(workflow, workflowJson);

  issues.push(
    ...auditWorkflowPreviewIssues({
      workflowJson,
      model: input.model,
      hasInputImage: input.hasInputImage,
      hasMaskImage: input.hasMaskImage,
    })
  );

  if (!renderedOnImage21)
    issues.push(
      ...auditWorkflowStackCompatibility({
        workflowJson,
        workflow,
        model: input.model,
        syncWorkflowLoadersToModel: input.syncWorkflowLoadersToModel,
      })
    );

  issues.push(
    ...auditWorkflowNodeTypes({
      workflowJson,
      workflow,
      knownNodeTypes: input.knownNodeTypes,
    })
  );

  const loraFilenames = buildLightningLoraFilenameMap(
    input.customTokens ?? [],
    String(input.model),
    input.models?.loras
  );

  if (!renderedOnImage21)
    issues.push(
      ...auditLightningWorkflowIssues({
        workflowJson,
        workflow,
        model: input.model,
        loraFilenames,
        alreadyPrepared: input.lightningAlreadyPrepared === true,
        stackLoraFilenames: input.stackLoraFilenames,
      })
    );

  if (!renderedOnImage21)
    issues.push(
      ...auditDistilledTurboWorkflowIssues({
        workflowJson,
        workflow,
        model: input.model,
        loraFilenames,
      })
    );

  if (input.objectInfoUnavailable) {
    issues.push({
      severity: isQwenLightningModel(input.model) ? 'error' : 'warn',
      message: isQwenLightningModel(input.model)
        ? 'ComfyUI object_info unavailable — cannot verify Lightning LoRA/loader inventory. Ensure ComfyUI is reachable before queueing.'
        : 'ComfyUI object_info unavailable — skipped loader filename and node-type inventory checks.',
    });
  }

  if (input.models) {
    issues.push(
      ...auditDualClipNodesInWorkflow({
        workflowJson,
        workflow,
        models: input.models,
      })
    );
    issues.push(
      ...auditLoaderFilenamesInWorkflow({
        workflowJson,
        workflow,
        models: input.models,
      })
    );
  }

  return issues;
}

export function summarizeWorkflowGraphPreflight(input: WorkflowGraphPreflightInput): {
  ok: boolean;
  issues: WorkflowPreflightIssue[];
} {
  const issues = collectWorkflowGraphPreflightIssues(input);
  return {
    ok: !issues.some(issue => issue.severity === 'error'),
    issues,
  };
}
