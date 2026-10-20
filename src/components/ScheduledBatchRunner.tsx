'use client';

import { useEffect, useRef } from 'react';
import {
  loadScheduledBatchConfig,
  saveScheduledBatchConfig,
  shouldRunScheduledBatch,
} from '@/lib/scheduled-batch';
import {
  generateScheduledBatchPrompts,
  rankScheduledBatchPrompts,
  resolveScheduledBatchModelDetail,
} from '@/lib/scheduled-batch-generate';
import { retryFailedWebhookDeliveries } from '@/lib/webhook-log';
import { toastQueueOutcome } from '@/lib/app-toast';

export default function ScheduledBatchRunner() {
  const runningRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void (async () => {
        if (runningRef.current) {
          return;
        }

        const config = loadScheduledBatchConfig();
        if (config.webhookAutoRetry) {
          void retryFailedWebhookDeliveries();
        }

        if (!shouldRunScheduledBatch(config)) {
          return;
        }

        runningRef.current = true;
        try {
          const { loadSettingsCache } = await import('@/lib/settings-cache');
          const { resolveQueueNegativePrompt } = await import('@/lib/queue-negative');
          const { resolveRuntimeForQueue } = await import('@/lib/comfyui/runtime-for-model');
          const { resolveQueueParams } = await import('@/lib/queue-params-settings');
          const { registerComfyGalleryJob } = await import('@/lib/gallery/comfyui-gallery-client');
          const { scheduleComfyGalleryPoll } = await import('@/lib/gallery/comfyui-gallery-poller');
          const { postComfyUiPrompt } = await import('@/lib/comfyui/queue-request');
          const { registerScheduledBatchQueue } = await import('@/lib/scheduled-batch-tracker');
          const { dispatchWebhook } = await import('@/lib/webhook-settings');

          const { shared } = loadSettingsCache();
          const { model, detail, qualityProfile } = resolveScheduledBatchModelDetail(config, {
            model: shared.model,
            detail: shared.detail,
            queueQualityProfile: shared.queueQualityProfile,
          });

          const bestOfN = config.bestOfN ?? 1;
          const generateCount = bestOfN > 1 ? config.count * bestOfN : config.count;
          let prompts = await generateScheduledBatchPrompts({
            config: { ...config, count: generateCount },
            model,
            detail,
          });

          const useVisionRank = Boolean(config.bestOfNVision && bestOfN > 1);
          if (!useVisionRank && bestOfN > 1 && prompts.length > config.count) {
            prompts = await rankScheduledBatchPrompts(prompts, config.count, bestOfN);
          } else if (!useVisionRank) {
            prompts = prompts.slice(0, config.count);
          } else {
            prompts = prompts.slice(0, generateCount);
          }

          const queuedPromptIds: string[] = [];
          if (config.autoQueueComfyUi && prompts.length > 0) {
            const negativePrompt = await resolveQueueNegativePrompt({
              model,
              hints: config.genre,
              tool: 'scheduled-batch',
            });
            const { guardQueueQualityForVram } = await import('@/lib/vram-queue-guard');
            const { maybeHoldMaxGenerateJobs } = await import('@/lib/held-max-queue');
            const baseRuntime = resolveRuntimeForQueue(model, 'scheduled-batch');
            const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
            const runtime = vramGuard.runtime ?? baseRuntime;
            const paramsPerPrompt = prompts.map((_, index) =>
              resolveQueueParams({
                model,
                tool: 'scheduled-batch',
                base: {
                  seed: String(Math.floor(Math.random() * 2 ** 32) + index),
                },
                qualityProfile: vramGuard.profile ?? qualityProfile,
              })
            );
            const held = await maybeHoldMaxGenerateJobs({
              profile: vramGuard.profile,
              jobs: prompts.map((prompt, index) => ({
                prompt,
                negativePrompt,
                model,
                tool: 'scheduled-batch',
                params: paramsPerPrompt[index],
                comfy: runtime,
              })),
            });
            if (!held.held) {
              const queued = await postComfyUiPrompt({
                prompts,
                negativePrompt,
                paramsPerPrompt,
                ...(runtime ? { comfy: runtime } : {}),
              });
              const data = queued.raw as {
                results?: Array<{ promptId?: string; comfyUrl?: string }>;
                comfyUrl?: string;
              };
              if (queued.status < 400) {
                let queuedJobs = 0;
                for (const [index, result] of (data.results ?? []).entries()) {
                  if (!result.promptId) {
                    continue;
                  }
                  queuedJobs += 1;
                  const comfyUrl =
                    result.comfyUrl ?? data.comfyUrl ?? queued.comfyUrl ?? 'http://127.0.0.1:8188';
                  registerComfyGalleryJob({
                    promptId: result.promptId,
                    prompt: prompts[index] ?? '',
                    negativePrompt,
                    tool: 'scheduled-batch',
                    model,
                    comfyUrl,
                    clientId: queued.clientId,
                    queueParams: paramsPerPrompt[index],
                    queueQualityProfile: runtime.queueQualityProfile,
                  });
                  void scheduleComfyGalleryPoll(result.promptId, {
                    comfyUrl,
                    clientId: queued.clientId,
                  });
                  queuedPromptIds.push(result.promptId);
                }
                registerScheduledBatchQueue(queuedJobs);
              }
              queued.releaseLiveSocket();
            }

            if (useVisionRank && queuedPromptIds.length > 0) {
              const { runPostQueueVisionCull } = await import('@/lib/best-of-n-vision-queue');
              toastQueueOutcome({
                ok: true,
                text: `Scheduled batch · waiting for ${queuedPromptIds.length} outputs to vision-rank…`,
                href: '/gallery',
              });
              const { kept, culledIds } = await runPostQueueVisionCull(
                queuedPromptIds,
                config.count,
                {
                  onProgress: progress => {
                    if (progress.phase === 'waiting') {
                      toastQueueOutcome({
                        ok: true,
                        text: `Vision rank · ${progress.completed}/${progress.total} outputs ready`,
                        href: '/gallery',
                      });
                    }
                  },
                }
              );
              void dispatchWebhook({
                event: 'scheduled.batch.run',
                tool: 'scheduled-batch',
                model,
                queued: queuedPromptIds.length,
                completedAt: Date.now(),
                message: `Vision-ranked ${queuedPromptIds.length} outputs → kept ${kept.length} winners${culledIds.length > 0 ? ` · culled ${culledIds.length}` : ''}`,
              });
              toastQueueOutcome({
                ok: true,
                text: `Vision rank kept ${kept.length}${culledIds.length > 0 ? ` · culled ${culledIds.length}` : ''}`,
                href: '/gallery',
              });
            }
          }

          saveScheduledBatchConfig({ ...config, lastRunAt: Date.now() });
          void dispatchWebhook({
            event: 'scheduled.batch.run',
            tool: 'scheduled-batch',
            model,
            queued: prompts.length,
            completedAt: Date.now(),
            message: config.autoQueueComfyUi
              ? `Generated ${prompts.length} prompts and queued to ComfyUI`
              : `Generated ${prompts.length} prompts`,
          });
        } finally {
          runningRef.current = false;
        }
      })();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  return null;
}
