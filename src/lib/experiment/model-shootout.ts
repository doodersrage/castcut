'use client';

import type { ComfyImageModel } from '../comfy-models/client';
import { registerComfyGalleryJob } from '../gallery/comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from '../gallery/comfyui-gallery-poller';
import { postComfyUiPrompt } from '../comfyui/queue-request';
import { resolveRuntimeForQueue } from '../comfyui/runtime-for-model';
import { modelsInSameFamily } from '../model/workflow-map';
import { resolveQueueParams } from '../queue/params-settings';
import { guardQueueQualityForVram } from '../queue/vram-queue-guard';
import { maybeHoldMaxGenerateJobs } from '../queue/held-max-queue';

export type ShootoutModel = {
  model: string;
  label: string;
};

export const DEFAULT_SHOOTOUT_MODELS: ShootoutModel[] = [
  { model: 'sdxl', label: 'SDXL' },
  { model: 'flux-2-klein-4b-distilled', label: 'FLUX Klein 4B Distilled' },
  { model: 'flux-2-klein-9b-distilled', label: 'FLUX Klein 9B Distilled' },
  { model: 'sd1.5', label: 'SD 1.5' },
];

export async function queueSameSeedShootout(input: {
  prompt: string;
  negativePrompt?: string;
  models: string[];
  seed: number;
}): Promise<{ queued: number; held: number; errors: string[] }> {
  const errors: string[] = [];
  let queued = 0;
  let heldCount = 0;
  const seed = String(input.seed);

  for (const modelId of input.models) {
    try {
      const model = modelId as ComfyImageModel;
      const baseRuntime = resolveRuntimeForQueue(model, 'shootout');
      const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
      const runtime = vramGuard.runtime ?? baseRuntime;
      const params = resolveQueueParams({
        model,
        tool: 'shootout',
        base: { seed },
        qualityProfile: vramGuard.profile,
      });
      const held = await maybeHoldMaxGenerateJobs({
        profile: vramGuard.profile,
        jobs: [
          {
            prompt: input.prompt,
            negativePrompt: input.negativePrompt,
            model: modelId,
            tool: 'shootout',
            params,
            comfy: runtime,
          },
        ],
      });
      if (held.held) {
        heldCount += 1;
        continue;
      }
      const queuedJob = await postComfyUiPrompt({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        params,
        ...(runtime ? { comfy: runtime } : {}),
      });
      if (!queuedJob.ok || !queuedJob.promptId) {
        queuedJob.releaseLiveSocket();
        errors.push(queuedJob.error ?? `Failed for ${modelId}`);
        continue;
      }
      registerComfyGalleryJob({
        promptId: queuedJob.promptId,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        tool: 'shootout',
        model: modelId,
        comfyUrl: queuedJob.comfyUrl ?? 'http://127.0.0.1:8188',
        clientId: queuedJob.clientId,
        queueParams: params,
        queueQualityProfile: runtime.queueQualityProfile,
      });
      void scheduleComfyGalleryPoll(queuedJob.promptId, {
        comfyUrl: queuedJob.comfyUrl,
        clientId: queuedJob.clientId,
      });
      queuedJob.releaseLiveSocket();
      queued += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Failed for ${modelId}`);
    }
  }

  return { queued, held: heldCount, errors };
}

/** Same-seed shootout across sibling presets (e.g. vanilla + Lightning 4/8). */
export async function queueFamilySameSeedShootout(input: {
  prompt: string;
  negativePrompt?: string;
  model: string;
  seed: number;
}): Promise<{ queued: number; held: number; errors: string[]; models: string[] }> {
  const models = modelsInSameFamily(input.model).map(String);
  if (models.length === 0) {
    return {
      queued: 0,
      held: 0,
      errors: [`No family peers for ${input.model}`],
      models: [],
    };
  }
  const result = await queueSameSeedShootout({
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    models,
    seed: input.seed,
  });
  return { ...result, models };
}
