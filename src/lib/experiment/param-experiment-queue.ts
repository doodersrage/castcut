'use client';

import type { ComfyImageModel } from '../comfy-models/client';
import { getComfyModelDefinition } from '../comfy-models/client';
import type { WorkflowParamValues } from '../comfyui/config';
import { resolveRuntimeForQueue } from '../comfyui/runtime-for-model';
import { registerComfyGalleryJob } from '../gallery/comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from '../gallery/comfyui-gallery-poller';
import { postComfyUiPrompt } from '../comfyui/queue-request';
import { injectLoraTriggers } from '../lora/prompt-injection';
import { isQwenLightningModel } from '../workflow/model-sampling-patch';
import { qwenOfficialMediumSizeLadder } from '../model/resolution-defaults';
import { loadActiveProjectId } from '../prompt/projects';
import { resolveQueueParams } from '../queue/params-settings';
import { guardQueueQualityForVram } from '../queue/vram-queue-guard';
import { maybeHoldMaxGenerateJobs } from '../queue/held-max-queue';
import { prepareQueuePrompts } from '../queue/prompt-prep';

export type ParamExperimentAxis = 'seed' | 'cfg' | 'steps' | 'width';

function usesQwenOfficialSizes(model: string): boolean {
  return getComfyModelDefinition(model).category === 'qwen';
}

export async function queueParamExperiment(input: {
  prompt: string;
  model: ComfyImageModel | string;
  negativePrompt?: string;
  hints?: string;
  baseParams?: WorkflowParamValues;
  axis?: ParamExperimentAxis;
  count?: number;
  values?: string[];
}): Promise<{
  queued: number;
  held: number;
  labels: string[];
  redirectedAxis?: ParamExperimentAxis;
}> {
  const model = input.model as ComfyImageModel;
  let axis = input.axis ?? 'cfg';
  let redirectedAxis: ParamExperimentAxis | undefined;

  // Lightning locks CFG/steps — sweeping them wastes queue slots.
  if (isQwenLightningModel(model) && (axis === 'cfg' || axis === 'steps')) {
    redirectedAxis = axis;
    axis = 'seed';
  }

  const count = Math.min(8, Math.max(2, input.count ?? 4));
  const baseRuntime = resolveRuntimeForQueue(model, 'param-experiment');
  const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
  const runtime = vramGuard.runtime ?? baseRuntime;
  const prepared = await prepareQueuePrompts({
    model,
    positive: injectLoraTriggers(input.prompt.trim()),
    hints: input.hints,
    tool: 'param-experiment',
    explicitNegative: input.negativePrompt,
  });
  const prompt = prepared.positive;
  const negativePrompt = prepared.negative;
  const base = input.baseParams ?? resolveQueueParams({ model, qualityProfile: vramGuard.profile });
  const projectId = loadActiveProjectId();

  const qwenSizes = qwenOfficialMediumSizeLadder();
  const defaultValues: Record<ParamExperimentAxis, string[]> = {
    seed: Array.from({ length: count }, (_, index) =>
      String(Math.floor(Math.random() * 2 ** 32) + index)
    ),
    cfg: ['5', '6', '7', '8', '9', '10', '11', '12'].slice(0, count),
    steps: ['16', '20', '24', '28', '32', '36', '40', '44'].slice(0, count),
    width: usesQwenOfficialSizes(model)
      ? qwenSizes.slice(0, count).map(size => String(size.width))
      : ['768', '896', '1024', '1152', '1280', '1408', '1536', '1664'].slice(0, count),
  };

  const values = (input.values?.length ? input.values : defaultValues[axis]).slice(0, count);
  const labels: string[] = [];
  let queued = 0;
  let held = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    const params: WorkflowParamValues = {
      ...base,
      seed: axis === 'seed' ? value : (base.seed ?? String(Math.floor(Math.random() * 2 ** 32))),
      cfg: axis === 'cfg' ? value : base.cfg,
      steps: axis === 'steps' ? value : base.steps,
      width: axis === 'width' ? value : base.width,
    };

    if (axis === 'width' && usesQwenOfficialSizes(model)) {
      const size = qwenSizes[index] ?? qwenSizes.find(entry => String(entry.width) === value);
      if (size) {
        params.width = String(size.width);
        params.height = String(size.height);
      }
    }

    labels.push(
      redirectedAxis
        ? `${redirectedAxis}→seed=${params.seed}`
        : axis === 'width' && params.height
          ? `size=${params.width}x${params.height}`
          : `${axis}=${value}`
    );

    const hold = await maybeHoldMaxGenerateJobs({
      profile: vramGuard.profile,
      jobs: [
        {
          prompt,
          negativePrompt,
          model,
          tool: 'param-experiment',
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
      tool: 'param-experiment',
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

  return { queued, held, labels, redirectedAxis };
}
