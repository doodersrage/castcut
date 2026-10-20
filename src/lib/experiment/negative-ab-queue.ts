'use client';

import type { ComfyImageModel } from '../comfy-models/client';
import { resolveRuntimeForQueue } from '../comfyui/runtime-for-model';
import { registerComfyGalleryJob } from '../gallery/comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from '../gallery/comfyui-gallery-poller';
import { postComfyUiPrompt } from '../comfyui/queue-request';
import { resolveQueueNegativePrompt } from '../queue/negative';
import { resolveQueueParams } from '../queue/params-settings';
import { injectLoraTriggers } from '../lora/prompt-injection';
import { modelUsesNegativePrompt } from '../prompt/pair';
import { guardQueueQualityForVram } from '../queue/vram-queue-guard';
import { maybeHoldMaxGenerateJobs } from '../queue/held-max-queue';
import { prepareQueuePrompts } from '../queue/prompt-prep';

export async function queueNegativeAbTest(input: {
  prompt: string;
  model: ComfyImageModel | string;
  negativeA?: string;
  negativeB?: string;
  hints?: string;
  tool?: string;
  sharedSeed?: string;
}): Promise<{ queued: number; held: number; seed: string }> {
  const model = input.model as ComfyImageModel;
  const seed = input.sharedSeed ?? String(Math.floor(Math.random() * 2 ** 32));
  const baseRuntime = resolveRuntimeForQueue(model, input.tool ?? 'negative-ab');
  const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
  const runtime = vramGuard.runtime ?? baseRuntime;
  const params = resolveQueueParams({
    model,
    base: { seed },
    qualityProfile: vramGuard.profile,
  });
  const basePrompt = injectLoraTriggers(input.prompt.trim());

  let negativeA = input.negativeA?.trim();
  let negativeB = input.negativeB?.trim();

  if (modelUsesNegativePrompt(model)) {
    negativeA =
      negativeA ||
      (await resolveQueueNegativePrompt({
        model,
        hints: input.hints,
        tool: input.tool ?? 'negative-ab',
      }));
    negativeB = negativeB ?? '';
  }

  let queued = 0;
  let held = 0;
  const variants: Array<{ label: string; negativePrompt?: string }> = [
    { label: 'with-negative', negativePrompt: negativeA },
    { label: 'without-negative', negativePrompt: undefined },
  ];

  if (negativeB !== undefined && negativeB !== negativeA) {
    variants.push({ label: 'alt-negative', negativePrompt: negativeB });
  }

  for (const variant of variants) {
    const prepared = await prepareQueuePrompts({
      model,
      positive: basePrompt,
      hints: input.hints,
      tool: input.tool ?? 'negative-ab',
      explicitNegative: variant.negativePrompt,
    });
    const prompt = `${prepared.positive} [${variant.label}]`;
    const negativePrompt = prepared.negative;
    const hold = await maybeHoldMaxGenerateJobs({
      profile: vramGuard.profile,
      jobs: [
        {
          prompt,
          negativePrompt,
          model,
          tool: 'negative-ab',
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
      prompt: prepared.positive,
      negativePrompt,
      tool: 'negative-ab',
      model,
      comfyUrl: queuedJob.comfyUrl ?? 'http://127.0.0.1:8188',
      clientId: queuedJob.clientId,
      queueParams: params,
      queueQualityProfile: runtime.queueQualityProfile,
    });
    void scheduleComfyGalleryPoll(queuedJob.promptId, {
      comfyUrl: queuedJob.comfyUrl ?? 'http://127.0.0.1:8188',
      clientId: queuedJob.clientId,
    });
    queuedJob.releaseLiveSocket();
    queued += 1;
  }

  return { queued, held, seed };
}
