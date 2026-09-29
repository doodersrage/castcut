'use client';

import { modelUsesNegativePrompt } from './prompt-pair';
import { getComfyModelDefinition, type ComfyImageModel } from './comfy-models/client';
import { isInpaintModel, isEditQueueTool } from './model-denoise-defaults';
import { resolveRuntimeForQueueAsync } from './comfyui-runtime-for-model';
import { fetchWorkflowPreview } from './comfyui-requeue';
import { resolveQueueParams } from './queue-params-settings';
import type { WorkflowParamValues } from './comfyui-config';
import { auditLoaderMapsAtQueueTime } from './workflow-queue-loader-preflight';
import { auditLoraStackAtQueueTime } from './lora-stack-preflight';
import { resolveActiveLoraStack } from './lora-stack';
import { fetchComfyObjectInfoCached } from './comfyui-object-info-cache';
import {
  collectWorkflowGraphPreflightIssues,
  type WorkflowPreflightIssue,
} from './workflow-preflight-core';

export type { WorkflowPreflightIssue };

export type WorkflowPreflightResult = {
  ok: boolean;
  issues: WorkflowPreflightIssue[];
  installMessage?: string;
};

export async function runWorkflowPreflight(input: {
  model: ComfyImageModel | string;
  prompts: string[];
  negativePrompt?: string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
  hasControlImage?: boolean;
  tool?: string;
  queueParams?: WorkflowParamValues;
  qualityProfile?: import('./queue-quality-profile').QueueQualityProfile;
  comfy?: import('./comfyui-config').ComfyUiRuntimeConfig;
}): Promise<WorkflowPreflightResult> {
  const issues: WorkflowPreflightIssue[] = [];
  const runtime =
    input.comfy ?? (await resolveRuntimeForQueueAsync(input.model as ComfyImageModel, input.tool));

  if (!runtime?.workflowJson && !runtime?.workflowFileId) {
    const category = getComfyModelDefinition(input.model).category;
    if (category === 'audio') {
      issues.push({
        severity: 'error',
        message:
          'No audio workflow mapped — open /audio to auto-create a scaffold, or import your Stable Audio pack in Settings → workflows and map it to stable-audio.',
      });
    } else if (category === 'mesh') {
      issues.push({
        severity: 'error',
        message:
          'No mesh workflow mapped — open /mesh to auto-create a scaffold, or import your Hunyuan3D pack in Settings → workflows and map it to hunyuan-3d.',
      });
    } else if (category === 'video') {
      issues.push({
        severity: 'error',
        message:
          'No video workflow mapped — open /video to auto-create a WAN/Hunyuan scaffold, or import a pack workflow in Settings.',
      });
    } else {
      issues.push({
        severity: 'warn',
        message: 'No workflow JSON configured — server/env fallback will be used.',
      });
    }
  }

  if (modelUsesNegativePrompt(input.model) && !input.negativePrompt?.trim()) {
    issues.push({
      severity: 'warn',
      message: 'SD-family model queued without a negative prompt.',
    });
  }

  if (isInpaintModel(input.model) && !input.hasMaskImage && !input.hasInputImage) {
    issues.push({
      severity: 'warn',
      message:
        'Inpaint model queued without a source image or mask — upload both before Send to ComfyUI.',
    });
  } else if (isInpaintModel(input.model) && !input.hasMaskImage) {
    issues.push({
      severity: 'warn',
      message: 'Inpaint model queued without a mask — white pixels mark the edit region.',
    });
  }

  const samplePrompt = input.prompts.find(entry => entry.trim())?.trim();
  if (!samplePrompt) {
    issues.push({ severity: 'error', message: 'No prompts to queue.' });
    return { ok: false, issues };
  }

  const previewParams = resolveQueueParams({
    model: input.model,
    tool: input.tool,
    base: input.queueParams,
    qualityProfile: input.qualityProfile,
    inputImageFilename: input.hasInputImage
      ? input.queueParams?.inputImageFilename?.trim() || 'preview-input.png'
      : undefined,
    maskImageFilename: input.hasMaskImage
      ? input.queueParams?.maskImageFilename?.trim() || 'preview-mask.png'
      : undefined,
    controlImageFilename: input.hasControlImage
      ? input.queueParams?.controlImageFilename?.trim() || 'preview-control.png'
      : undefined,
  });

  try {
    const preview = await fetchWorkflowPreview({
      prompt: samplePrompt,
      negativePrompt: input.negativePrompt,
      model: input.model,
      params: previewParams,
      hasInputImage: input.hasInputImage,
      hasMaskImage: input.hasMaskImage,
      comfy: runtime,
      // The LoRA and loader-map audits below read this graph — a truncated preview hid
      // LoRA loaders on bigger (Lightning) graphs and reported them missing.
      fullWorkflow: true,
    });
    if (!preview.ok) {
      issues.push({
        severity: 'error',
        message: preview.error ?? 'Workflow preview failed.',
      });
    } else if (
      preview.workflowSource !== 'minimal' &&
      (preview.replacements?.positive ?? 0) === 0
    ) {
      issues.push({
        severity: 'error',
        message:
          'Workflow has no positive prompt placeholder replacements. Add {{POSITIVE}} to a CLIPText Encode node in Settings → ComfyUI workflow library (Apply bindings), or pick a workflow that includes prompt placeholders.',
      });
    }

    if (
      !isEditQueueTool(input.tool) &&
      input.hasInputImage &&
      preview.workflowJson?.includes('{{INPUT_IMAGE}}')
    ) {
      issues.push({
        severity: 'error',
        message:
          'Input image placeholder was not replaced — bind LoadImage → {{INPUT_IMAGE}} in Settings → workflow library (Apply bindings).',
      });
    }

    const objectInfo = await fetchComfyObjectInfoCached({
      comfyUrl: runtime?.apiUrl,
    });

    // Prefer server-side preflight on the full prepared graph. Re-parsing the
    // optionally truncated preview JSON can false-fail Lightning LoRA checks.
    if (preview.preflightIssues?.length) {
      issues.push(...preview.preflightIssues);
    } else {
      issues.push(
        ...collectWorkflowGraphPreflightIssues({
          workflowJson: preview.workflowJson,
          model: input.model,
          hasInputImage: input.hasInputImage,
          hasMaskImage: input.hasMaskImage,
          syncWorkflowLoadersToModel: runtime?.syncWorkflowLoadersToModel,
          knownNodeTypes: objectInfo?.nodeTypes,
          models: objectInfo?.models,
          objectInfoUnavailable: !objectInfo,
          customTokens: runtime?.customTokens,
          stackLoraFilenames: resolveActiveLoraStack(runtime?.loraLibrary).map(
            entry => entry.filename
          ),
        })
      );
    }

    const loaderIssues = await auditLoaderMapsAtQueueTime({
      model: input.model,
      comfyUrl: runtime?.apiUrl,
      workflowJson: preview.workflowJson,
    });
    issues.push(...loaderIssues);

    issues.push(
      ...auditLoraStackAtQueueTime({
        model: input.model,
        workflowJson: preview.workflowJson,
        loraLibrary: runtime?.loraLibrary,
      })
    );
  } catch (err) {
    issues.push({
      severity: 'error',
      message: err instanceof Error ? err.message : 'Workflow preview failed.',
    });
  }

  return {
    ok: !issues.some(issue => issue.severity === 'error'),
    issues,
  };
}

/** Run preflight; if missing custom nodes are the block, install once and re-audit. */
export async function runWorkflowPreflightWithNodeInstall(
  input: Parameters<typeof runWorkflowPreflight>[0]
): Promise<WorkflowPreflightResult> {
  const first = await runWorkflowPreflight(input);
  if (first.ok) {
    return first;
  }
  const { tryInstallMissingNodesFromIssues } = await import('./comfyui-manager-install-client');
  const installed = await tryInstallMissingNodesFromIssues({
    issues: first.issues,
    comfyUrl: input.comfy?.apiUrl,
  });
  if (!installed || installed.installed.length === 0) {
    return installed?.message ? { ...first, installMessage: installed.message } : first;
  }
  const retry = await runWorkflowPreflight(input);
  return {
    ...retry,
    installMessage: installed.message,
  };
}
