'use client';

import type { ComfyImageModel } from './comfy-models/client';
import { resolveRuntimeForQueue } from './comfyui/runtime-for-model';
import { registerComfyGalleryJob } from './gallery/comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from './gallery/comfyui-gallery-poller';
import { postComfyUiPrompt } from './comfyui/queue-request';
import { loadActiveProjectId } from './prompt-projects';
import { injectLoraTriggers } from './lora-prompt-injection';
import { resolveQueueParams } from './queue-params-settings';
import { guardQueueQualityForVram } from './vram-queue-guard';
import { maybeHoldMaxGenerateJobs } from './held-max-queue';
import { prepareQueuePrompts } from './queue-prompt-prep';

export async function queueSeedExperiment(input: {
  prompt: string;
  model: ComfyImageModel | string;
  negativePrompt?: string;
  hints?: string;
  tool?: string;
  count?: number;
  sharedSeed?: string;
}): Promise<{ queued: number; held: number; seeds: string[] }> {
  const model = input.model as ComfyImageModel;
  const count = Math.min(12, Math.max(2, input.count ?? 4));
  const baseRuntime = resolveRuntimeForQueue(model, input.tool ?? 'seed-experiment');
  const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
  const runtime = vramGuard.runtime ?? baseRuntime;
  const prepared = await prepareQueuePrompts({
    model,
    positive: injectLoraTriggers(input.prompt.trim()),
    hints: input.hints,
    tool: input.tool ?? 'seed-experiment',
    explicitNegative: input.negativePrompt,
  });
  const prompt = prepared.positive;
  const negativePrompt = prepared.negative;

  const seeds: string[] = [];
  let queued = 0;
  let held = 0;
  const projectId = loadActiveProjectId();

  for (let index = 0; index < count; index += 1) {
    const seed =
      input.sharedSeed && index === 0
        ? input.sharedSeed
        : String(Math.floor(Math.random() * 2 ** 32) + index);
    seeds.push(seed);
    const params = resolveQueueParams({
      model,
      base: { seed },
      qualityProfile: vramGuard.profile,
    });

    const hold = await maybeHoldMaxGenerateJobs({
      profile: vramGuard.profile,
      jobs: [
        {
          prompt,
          negativePrompt,
          model,
          tool: input.tool ?? 'seed-experiment',
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
      tool: 'seed-experiment',
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

  return { queued, held, seeds };
}
