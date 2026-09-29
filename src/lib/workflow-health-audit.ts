import type { ComfyWorkflowFile } from './comfyui-workflow-files';
import { findUnresolvedPlaceholderTokens } from './workflow-placeholder-audit';
import { workflowContentHash, workflowJsonContentHash } from './workflow-content-hash';
import { resolveOptimizeModelForWorkflowFile } from './workflow-optimize-model';
import type { ModelWorkflowMap } from './model-workflow-map';
import { auditWorkflowStackCompatibility } from './workflow-stack-fingerprint';

export type WorkflowHealthIssue = {
  workflowId: string;
  workflowName: string;
  severity: 'error' | 'warn';
  message: string;
  /** When set, UI can focus this workflow in the library panel. */
  action?: 'open-workflow' | 'optimize-workflow';
};

/**
 * Placeholders the queue (or the tool that owns the workflow) fills in. Library workflows are
 * templates, so these are expected — only unknown tokens are worth a note here; real
 * queue-time problems come from the queue test (workflow-health-queue-test.ts).
 */
const QUEUE_FILLED_TOKEN =
  /^\{\{(POSITIVE|NEGATIVE|SEED|WIDTH|HEIGHT|CFG|STEPS|SAMPLER|SCHEDULER|SHIFT|FLUX_(MAX|BASE)_SHIFT|DENOISE|BATCH_SIZE|CHECKPOINT|UNET|VAE|CLIP\w*|REFINER|UPSCALE_MODEL|CONTROLNET_MODEL|IPADAPTER_\w+|INPUT_IMAGE|INPUT_IMAGE_\d+|MASK_IMAGE|INIT_IMAGE|CONTROL_IMAGE|LORA_\w+|FACE_DETAIL_\w+|VIDEO_\w+|AUDIO_\w+|MESH_\w+)\}\}$/;

export function isQueueFilledToken(token: string): boolean {
  return QUEUE_FILLED_TOKEN.test(token.trim());
}

/** Workflows whose tool supplies extra inputs (face detail, video, audio, mesh, ControlNet). */
export function isToolScaffoldWorkflow(workflowJson: string): boolean {
  return /\{\{(FACE_DETAIL_|VIDEO_|AUDIO_|MESH_|CONTROL_IMAGE)/.test(workflowJson);
}

export type WorkflowLibraryHealthReport = {
  scanned: number;
  healthy: number;
  issues: WorkflowHealthIssue[];
};

export function auditWorkflowLibraryHealth(input: {
  workflowFiles: ComfyWorkflowFile[];
  modelWorkflowMap?: ModelWorkflowMap;
}): WorkflowLibraryHealthReport {
  const issues: WorkflowHealthIssue[] = [];

  for (const file of input.workflowFiles) {
    const json = file.workflowJson.trim();
    if (!json) {
      issues.push({
        workflowId: file.id,
        workflowName: file.name,
        severity: 'warn',
        message: 'Workflow JSON is empty.',
        action: 'open-workflow',
      });
      continue;
    }

    try {
      JSON.parse(json);
    } catch {
      issues.push({
        workflowId: file.id,
        workflowName: file.name,
        severity: 'error',
        message: 'Workflow JSON is invalid.',
        action: 'open-workflow',
      });
      continue;
    }

    if (!file.lastOptimizedHash) {
      issues.push({
        workflowId: file.id,
        workflowName: file.name,
        severity: 'warn',
        message:
          'Not optimized yet — run Optimize all so queue can skip re-bind/enrich on unchanged graphs.',
        action: 'optimize-workflow',
      });
    } else if (
      file.lastOptimizedHash !== workflowJsonContentHash(json) &&
      file.lastOptimizedHash !== workflowContentHash(json)
    ) {
      issues.push({
        workflowId: file.id,
        workflowName: file.name,
        severity: 'warn',
        message: 'Workflow changed since last optimize — re-run Optimize all or Optimize copy.',
        action: 'optimize-workflow',
      });
    }

    const optimizeModel = resolveOptimizeModelForWorkflowFile(
      file,
      undefined,
      input.modelWorkflowMap
    );
    for (const token of findUnresolvedPlaceholderTokens(json)) {
      if (isQueueFilledToken(token)) continue;
      issues.push({
        workflowId: file.id,
        workflowName: file.name,
        severity: 'warn',
        message: `Unknown placeholder ${token} — nothing fills it at queue time. Add a custom token for it in Settings or remove it.`,
        action: 'open-workflow',
      });
    }

    issues.push(
      ...auditWorkflowStackCompatibility({
        workflowJson: json,
        model: optimizeModel,
        template: true,
      }).map(issue => ({
        workflowId: file.id,
        workflowName: file.name,
        severity: issue.severity,
        message: `[${optimizeModel}] ${issue.message}`,
        action:
          issue.severity === 'error' ? ('optimize-workflow' as const) : ('open-workflow' as const),
      }))
    );
  }

  const affectedIds = new Set(issues.map(issue => issue.workflowId));
  const scanned = input.workflowFiles.length;
  const healthy = Math.max(0, scanned - affectedIds.size);

  return { scanned, healthy, issues };
}

export function summarizeWorkflowLibraryHealth(report: WorkflowLibraryHealthReport): string {
  if (report.scanned === 0) {
    return 'No workflows in library — import JSON or use Optimize all after import.';
  }
  if (report.issues.length === 0) {
    return `${report.scanned} workflow(s) look ready.`;
  }
  const errors = report.issues.filter(issue => issue.severity === 'error').length;
  const warns = report.issues.length - errors;
  return `${report.healthy}/${report.scanned} workflow(s) clean · ${errors} error(s) · ${warns} review note(s).`;
}

/** @deprecated tokens param unused — kept for future model-specific audits */
export function auditWorkflowLibraryHealthLegacy(input: {
  workflowFiles: ComfyWorkflowFile[];
  tokens?: import('./comfyui-config').WorkflowPlaceholderTokens;
  model?: string;
}): WorkflowLibraryHealthReport {
  return auditWorkflowLibraryHealth({ workflowFiles: input.workflowFiles });
}

export const WORKFLOW_HEALTH_SELECT_EVENT = 'workflow-health-select-file';

export function dispatchWorkflowHealthSelect(
  workflowId: string,
  action?: WorkflowHealthIssue['action']
): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(WORKFLOW_HEALTH_SELECT_EVENT, {
      detail: { workflowId, action },
    })
  );
}
