'use client';

import type { ComfyImageModel } from './comfy-models/client';
import type { WorkflowParamValues } from './comfyui/config';
import { resolveRuntimeForQueue } from './comfyui/runtime-for-model';
import { registerComfyGalleryJob } from './gallery/comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from './gallery/comfyui-gallery-poller';
import { postComfyUiPrompt } from './comfyui/queue-request';
import { injectLoraTriggers } from './lora-prompt-injection';
import { isQwenLightningModel } from './workflow/model-sampling-patch';
import { loadActiveProjectId } from './prompt-projects';
import { resolveQueueParams } from './queue-params-settings';
import { guardQueueQualityForVram } from './vram-queue-guard';
import { maybeHoldMaxGenerateJobs } from './held-max-queue';
import { prepareQueuePrompts } from './queue-prompt-prep';

export async function queueParamExperimentGrid(input: {
  prompt: string;
  model: ComfyImageModel | string;
  negativePrompt?: string;
  hints?: string;
  baseParams?: WorkflowParamValues;
  cfgValues?: string[];
  stepValues?: string[];
}): Promise<{
  queued: number;
  held: number;
  cells: string[];
  skippedReason?: string;
}> {
  const model = input.model as ComfyImageModel;

  if (isQwenLightningModel(model)) {
    return {
      queued: 0,
      held: 0,
      cells: [],
      skippedReason:
        'Lightning locks CFG and steps — CFG×steps grids are skipped. Use seed experiments instead.',
    };
  }

  const baseRuntime = resolveRuntimeForQueue(model, 'param-grid');
  const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
  const runtime = vramGuard.runtime ?? baseRuntime;
  const prepared = await prepareQueuePrompts({
    model,
    positive: injectLoraTriggers(input.prompt.trim()),
    hints: input.hints,
    tool: 'param-grid',
    explicitNegative: input.negativePrompt,
  });
  const prompt = prepared.positive;
  const negativePrompt = prepared.negative;
  const base = input.baseParams ?? resolveQueueParams({ model, qualityProfile: vramGuard.profile });
  const cfgValues = (input.cfgValues ?? ['6', '7', '8', '9']).slice(0, 4);
  const stepValues = (input.stepValues ?? ['18', '22', '26', '30']).slice(0, 4);
  const projectId = loadActiveProjectId();

  const cells: string[] = [];
  let queued = 0;
  let held = 0;

  for (const cfg of cfgValues) {
    for (const steps of stepValues) {
      const params: WorkflowParamValues = {
        ...base,
        cfg,
        steps,
        seed: String(Math.floor(Math.random() * 2 ** 32)),
      };
      cells.push(`cfg=${cfg},steps=${steps}`);

      const hold = await maybeHoldMaxGenerateJobs({
        profile: vramGuard.profile,
        jobs: [
          {
            prompt,
            negativePrompt,
            model,
            tool: 'param-grid',
            params,
            comfy: runtime,
          },
        ],
      });
      if (hold.held) {
        held += 1;
        continue;
      }

      const queuedJob = await postComfyUiPrompt({
        prompt,
        negativePrompt,
        params,
        ...(runtime ? { comfy: runtime } : {}),
      });

      if (!queuedJob.ok || !queuedJob.promptId) {
        queuedJob.releaseLiveSocket();
        continue;
      }

      registerComfyGalleryJob({
        promptId: queuedJob.promptId,
        prompt,
        negativePrompt,
        tool: 'param-grid',
        model,
        comfyUrl: queuedJob.comfyUrl ?? 'http://127.0.0.1:8188',
        clientId: queuedJob.clientId,
        queueParams: params,
        projectId,
        queueQualityProfile: runtime.queueQualityProfile,
      });
      void scheduleComfyGalleryPoll(queuedJob.promptId, {
        comfyUrl: queuedJob.comfyUrl ?? 'http://127.0.0.1:8188',
        clientId: queuedJob.clientId,
      });
      queuedJob.releaseLiveSocket();
      queued += 1;
    }
  }

  return { queued, held, cells };
}
