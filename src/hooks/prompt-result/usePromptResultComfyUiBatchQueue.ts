'use client';

import { useCallback } from 'react';
import type { AthleticSport } from '@/lib/athletic-sport-profiles';
import { resolveModelForQueueTool } from '@/lib/queue-tool-model';
import { guardQueueQualityForVram } from '@/lib/vram-queue-guard';
import { injectLoraTriggers } from '@/lib/lora-prompt-injection';
import {
  loadComfyUiSettings,
  resolveSharedEffectiveSessionLoraIds,
  resolveSharedEffectiveSessionLoraStrengthOverrides,
} from '@/lib/comfyui-settings';
import { loadSettingsCache } from '@/lib/settings-cache';
import { getEngineAdapter } from '@/lib/engine';
import { isCloudEngine } from '@/lib/engine/capabilities';
import { modelUsesNegativePrompt } from '@/lib/prompt-pair';
import { resolveQueueNegativePromptRaw } from '@/lib/queue-negative';
import { resolveParentHistoryId } from '@/lib/prompt-lineage-session';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { toastHeldMax, toastQueueOutcome } from '@/lib/app-toast';
import { applyQueuePromptSteering } from '@/lib/queue-prompt-prep';
import { dispatchWebhook } from '@/lib/webhook-settings';
import { resolveQueueFailureHref, resolveQueueFailurePlaybook } from '@/lib/queue-failure-playbook';
import type { ComfyUiDeps, ComfyUiTrackerApi } from '@/hooks/prompt-result/comfy-ui-types';
import type { PromptResultActionsConfig } from '@/hooks/prompt-result/types';

export function usePromptResultComfyUiBatchQueue(
  config: PromptResultActionsConfig,
  deps: ComfyUiDeps,
  tracker: Pick<ComfyUiTrackerApi, 'setComfyUiStatus' | 'trackComfyUiJob'>
) {
  const { saveHistory, historySaved } = deps;
  const { setComfyUiStatus, trackComfyUiJob } = tracker;

  const sendBatchComfyUi = useCallback(
    async (prompts: string[], sport?: AthleticSport | null) => {
      const filtered = prompts.map(entry => entry.trim()).filter(Boolean);
      if (filtered.length === 0) {
        return;
      }

      setComfyUiStatus(`Queueing ${filtered.length}…`);
      try {
        const { resolveRuntimeForQueueAsync } = await import('@/lib/comfyui-runtime-for-model');
        const baseRuntime = await resolveRuntimeForQueueAsync(config.model, config.tool);
        const queueModel = resolveModelForQueueTool(config.model, config.tool);
        const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
        const runtime = vramGuard.runtime ?? baseRuntime;
        const rawNegative = modelUsesNegativePrompt(queueModel)
          ? await resolveQueueNegativePromptRaw({
              model: queueModel,
              hints: config.hints,
              sport,
              tool: config.tool,
            })
          : undefined;
        const steered = applyQueuePromptSteering({
          positive: injectLoraTriggers(filtered[0] ?? ''),
          negative: rawNegative,
          model: queueModel,
          tool: config.tool,
          turboEditStrength: loadSettingsCache().shared.turboEditStrength,
        });
        const negativePrompt = steered.negative;
        const prepared = filtered.map(
          entry =>
            applyQueuePromptSteering({
              positive: injectLoraTriggers(entry),
              negative: rawNegative,
              model: queueModel,
              tool: config.tool,
              turboEditStrength: loadSettingsCache().shared.turboEditStrength,
            }).positive
        );

        const paramsPerPrompt = prepared.map((_, index) =>
          resolveQueueParams({
            model: queueModel,
            tool: config.tool,
            base: {
              seed: String(Math.floor(Math.random() * 2 ** 32) + index),
            },
            qualityProfile: vramGuard.profile,
          })
        );

        const engineAdapter = getEngineAdapter();
        if (engineAdapter.id === 'diffusers' || isCloudEngine(engineAdapter.id)) {
          throw new Error(
            `Batch queue is ComfyUI-only. Switch Settings → Inference engine to ComfyUI, or send a single prompt.`
          );
        }

        if (vramGuard.profile === 'max') {
          const { holdMaxGenerateJob, shouldHoldMaxUntilIdle } =
            await import('@/lib/held-max-queue');
          if (await shouldHoldMaxUntilIdle()) {
            for (const [index, prompt] of prepared.entries()) {
              holdMaxGenerateJob({
                prompt,
                negativePrompt,
                model: queueModel,
                tool: config.tool,
                params: paramsPerPrompt[index],
                comfy: runtime,
                qualityProfile: 'max',
              });
            }
            setComfyUiStatus(`Held ${prepared.length} Max job(s) until ComfyUI queue is idle.`);
            toastHeldMax({
              text: 'Best-quality jobs held until ComfyUI is idle',
              count: prepared.length,
            });
            return;
          }
        }

        const { runWorkflowPreflightWithNodeInstall } = await import('@/lib/workflow-preflight');
        const preflight = await runWorkflowPreflightWithNodeInstall({
          model: queueModel,
          prompts: prepared,
          negativePrompt,
          tool: config.tool,
          queueParams: paramsPerPrompt[0],
          comfy: runtime,
        });
        if (preflight.installMessage) {
          setComfyUiStatus(preflight.installMessage);
        }
        if (!preflight.ok) {
          const playbook = resolveQueueFailurePlaybook(preflight.issues);
          const error = new Error(
            [preflight.installMessage, playbook.message].filter(Boolean).join(' ')
          );
          (error as Error & { href?: string }).href = playbook.href;
          throw error;
        }

        const autoSaveEnabled = loadComfyUiSettings().autoSaveHistoryOnQueue !== false;
        const batchHistoryId =
          autoSaveEnabled && !historySaved && prepared.length > 0
            ? saveHistory({
                prompt: prepared.join('\n\n---\n\n'),
                hints: config.hints,
                metadata: {
                  batchSize: prepared.length,
                  batchPrompts: prepared,
                },
                parentHistoryId: resolveParentHistoryId(),
              })
            : undefined;

        const previewComfyUrlHint =
          runtime?.apiUrl?.trim() || loadComfyUiSettings().apiUrl?.trim() || undefined;

        const queued = await engineAdapter.postPrompt({
          prompts: prepared,
          negativePrompt,
          model: queueModel,
          paramsPerPrompt,
          ...(runtime ? { comfy: runtime } : {}),
        });

        try {
          const data = queued.raw as {
            ok?: boolean;
            queued?: number;
            failed?: number;
            error?: string;
            comfyUrl?: string;
            results?: Array<{
              ok?: boolean;
              promptId?: string;
              comfyUrl?: string;
            }>;
          };

          if (!queued.ok) {
            const error = new Error(queued.error ?? data.error ?? 'ComfyUI batch queue failed.');
            if (queued.href?.trim()) {
              (error as Error & { href?: string }).href = queued.href.trim();
            }
            throw error;
          }

          for (const [index, result] of (data.results ?? []).entries()) {
            if (!result.promptId) {
              continue;
            }
            trackComfyUiJob(
              {
                promptId: result.promptId,
                prompt: prepared[index] ?? prepared[0] ?? '',
                negativePrompt,
                comfyUrl:
                  result.comfyUrl ??
                  data.comfyUrl ??
                  queued.engineUrl ??
                  previewComfyUrlHint ??
                  'http://127.0.0.1:8188',
                clientId: queued.clientId,
                queueParams: paramsPerPrompt[index] ?? paramsPerPrompt[0],
                historyId: index === 0 ? batchHistoryId : undefined,
                queueQualityProfile: runtime?.queueQualityProfile,
                model: queueModel,
                sessionActiveLoraIds: resolveSharedEffectiveSessionLoraIds(queueModel),
                sessionLoraStrengthOverrides:
                  resolveSharedEffectiveSessionLoraStrengthOverrides(queueModel),
              },
              false
            );
          }
          queued.releaseLiveSocket();

          void dispatchWebhook({
            event: 'comfyui.batch.completed',
            tool: config.tool,
            model: queueModel,
            queued: data.queued ?? prepared.length,
            failed: data.failed,
            completedAt: Date.now(),
            message: `Batch queued ${data.queued ?? prepared.length}/${prepared.length}`,
          });

          setComfyUiStatus(
            [
              `queued ${data.queued ?? prepared.length}/${prepared.length}`,
              data.failed ? `${data.failed} failed` : null,
              data.comfyUrl ?? queued.engineUrl,
              negativePrompt ? 'with negative' : null,
            ]
              .filter(Boolean)
              .join(' · ')
          );
          if (data.failed) {
            const batchMessage = `Batch queued with ${data.failed} failure(s)`;
            void import('@/lib/local-observability').then(({ noteQueueFailureMetric }) => {
              noteQueueFailureMetric({ message: batchMessage, href: '/queue' });
            });
          }
          toastQueueOutcome({
            ok: !data.failed,
            text: data.failed
              ? `Batch queued with ${data.failed} failure(s)`
              : `Batch queued ${data.queued ?? prepared.length}/${prepared.length}`,
            href: data.failed ? '/queue' : '/gallery',
          });
        } catch (queueError) {
          queued.releaseLiveSocket();
          throw queueError;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'ComfyUI batch failed.';
        const hrefFromError =
          err instanceof Error ? (err as Error & { href?: string }).href : undefined;
        setComfyUiStatus(message);
        const href = hrefFromError || resolveQueueFailureHref(message) || '/queue';
        void import('@/lib/local-observability').then(({ noteQueueFailureMetric }) => {
          noteQueueFailureMetric({ message, href });
        });
        toastQueueOutcome({
          ok: false,
          text: message,
          href,
        });
      }
    },
    [config.hints, config.model, config.tool, trackComfyUiJob, saveHistory, historySaved]
  );
  return { sendBatchComfyUi };
}
