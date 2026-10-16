'use client';

import { loadComfyUiSettings, mergeLoraLibraryIntoCustomTokens } from './comfyui-settings';
import { loadSettingsCache } from './settings-cache';
import { auditLoaderMapsAgainstComfyUi } from './loader-map-health-audit';
import { fetchComfyObjectInfoModelsCached } from './comfyui-object-info-cache';
import { resolveSelectedWorkflowRuntime } from './comfyui-runtime';
import { auditLoaderFilenamesInWorkflow } from './workflow-loader-filename-audit';
import type { WorkflowPreflightIssue } from './workflow-preflight';
import { auditDualClipNodesInWorkflow } from './workflow-dual-clip-audit';

export { auditDualClipNodesInWorkflow };

export async function auditLoaderMapsAtQueueTime(input?: {
  model?: string;
  comfyUrl?: string;
  workflowJson?: string;
}): Promise<WorkflowPreflightIssue[]> {
  const models = await fetchComfyObjectInfoModelsCached({
    comfyUrl: input?.comfyUrl ?? resolveSelectedWorkflowRuntime()?.apiUrl,
  });
  if (!models) {
    return [
      {
        severity: 'warn',
        message:
          'ComfyUI object_info unavailable — skipped loader map and filename inventory checks.',
      },
    ];
  }

  const shared = loadSettingsCache().shared;
  const settings = mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings(), {
    activeOnly: true,
  });
  const model = input?.model?.trim();
  const checkpointMap = { ...(shared.modelCheckpointMap ?? {}) };
  const vaeMap = { ...(shared.modelVaeMap ?? {}) };
  const upscaleMap = { ...(shared.modelUpscaleMap ?? {}) };
  const controlNetMap = { ...(shared.modelControlNetMap ?? {}) };

  // Queue-time: only audit the active model (+ optional default upscale/CN).
  // Suggested map entries for unrelated models (flux/sdxl/video) must not block
  // Compose / Rapid AIO queues when those weights aren't installed.
  const scopedCheckpoint = model
    ? checkpointMap[model]?.trim()
      ? { [model]: checkpointMap[model]! }
      : {}
    : checkpointMap;
  const scopedVae = model ? (vaeMap[model]?.trim() ? { [model]: vaeMap[model]! } : {}) : vaeMap;
  const scopedUpscale = model
    ? {
        ...(upscaleMap[model]?.trim() ? { [model]: upscaleMap[model]! } : {}),
        ...(upscaleMap.default?.trim() ? { default: upscaleMap.default } : {}),
      }
    : upscaleMap;
  const scopedControlNet = model
    ? {
        ...(controlNetMap[model]?.trim() ? { [model]: controlNetMap[model]! } : {}),
        ...(controlNetMap.default?.trim() ? { default: controlNetMap.default } : {}),
      }
    : controlNetMap;

  return [
    ...auditLoaderMapsAgainstComfyUi({
      checkpointMap: scopedCheckpoint,
      vaeMap: scopedVae,
      upscaleMap: scopedUpscale,
      controlNetMap: scopedControlNet,
      customTokens: settings.customTokens,
      models,
    }).map(issue => ({
      severity: issue.severity,
      message: issue.message,
    })),
    ...auditDualClipNodesInWorkflow({
      workflowJson: input?.workflowJson,
      models,
    }),
    ...auditLoaderFilenamesInWorkflow({
      workflowJson: input?.workflowJson,
      models,
    }).map(issue => ({
      severity: issue.severity,
      message: issue.message,
    })),
  ];
}
