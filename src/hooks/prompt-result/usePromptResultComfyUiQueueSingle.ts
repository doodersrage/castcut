'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { AthleticSport } from '@/lib/athletic-sport-profiles';
import { resolveModelForQueueTool } from '@/lib/queue-tool-model';
import { guardQueueQualityForVram } from '@/lib/vram-queue-guard';
import { parseWorkflowJson } from '@/lib/comfyui-config';
import { resolveParentHistoryId } from '@/lib/prompt-lineage-session';
import { injectLoraTriggers } from '@/lib/lora-prompt-injection';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { loadSettingsCache } from '@/lib/settings-cache';
import { getEngineAdapter } from '@/lib/engine';
import { isCloudEngine } from '@/lib/engine/capabilities';
import { loadEngineSettings, resolveCloudEngineHost } from '@/lib/engine-settings';
import { resolveQueueSingleInputs } from '@/hooks/prompt-result/queue-single-inputs';
import { buildQueueSingleParams } from '@/hooks/prompt-result/queue-single-params';
import { postQueueSinglePrompt } from '@/hooks/prompt-result/queue-single-post-prompt';
import { toastHeldMax } from '@/lib/app-toast';
import { prepareQueuePrompts } from '@/lib/queue-prompt-prep';
import { runPluginQueuePreflight } from '@/lib/plugin-queue-hooks';
import { resolveQueueFailurePlaybook } from '@/lib/queue-failure-playbook';
import type {
  ComfyUiDeps,
  ComfyUiTrackerApi,
  SendComfyUiOptions,
} from '@/hooks/prompt-result/comfy-ui-types';
import type { PromptResultActionsConfig } from '@/hooks/prompt-result/types';
import {
  handleQueueFailure,
  tryRelocateIdentityAndRetry,
} from '@/hooks/prompt-result/identity-relocate';

export function usePromptResultComfyUiQueueSingle(
  config: PromptResultActionsConfig,
  deps: ComfyUiDeps,
  tracker: ComfyUiTrackerApi
) {
  const { saveHistory, historySaved } = deps;
  const {
    previewGenerationRef,
    identityRelocateAttemptRef,
    setComfyUiStatus,
    setComfyUiJob,
    setComfyUiPreviewUrl,
    trackComfyUiJob,
  } = tracker;
  const queueInFlightRef = useRef(false);

  const sendComfyUiRef = useRef<
    (
      prompt: string,
      sport?: AthleticSport | null,
      historyId?: string,
      options?: SendComfyUiOptions
    ) => Promise<string | undefined>
  >(async () => undefined);

  const sendComfyUi = useCallback(
    async (
      prompt: string,
      sport?: AthleticSport | null,
      historyId?: string,
      options?: SendComfyUiOptions
    ) => {
      if (!prompt) {
        return;
      }
      // Synchronous lock — UI busy flags lag one frame behind a double-click.
      // Identity relocate clears this before re-entering so retries still work.
      if (queueInFlightRef.current) {
        return;
      }
      queueInFlightRef.current = true;

      previewGenerationRef.current += 1;
      setComfyUiPreviewUrl(null);
      setComfyUiStatus('Queueing…');
      let failedQueueSnapshot: {
        prompt: string;
        negativePrompt?: string;
        model?: string;
        tool?: string;
        queueParams?: import('@/lib/comfyui-config').WorkflowParamValues;
        workflowJson?: string;
      } | null = null;
      try {
        const pluginPreflight = await runPluginQueuePreflight({
          event: 'queue-preflight',
          prompt,
          model: config.model,
          tool: config.tool,
          denoise: options?.queueParamsBase?.denoise,
          cfg: options?.queueParamsBase?.cfg,
        });
        if (pluginPreflight.blocked) {
          throw new Error(
            pluginPreflight.reason ||
              pluginPreflight.messages.join(' · ') ||
              'Plugin hook blocked the queue.'
          );
        }
        const workingPrompt = pluginPreflight.payload.prompt || prompt;
        const pluginNegative = pluginPreflight.payload.negativePrompt;
        const pluginDenoise = pluginPreflight.payload.denoise;
        const pluginCfg = pluginPreflight.payload.cfg;

        const engineAdapter = getEngineAdapter();
        const engineSettings = loadEngineSettings();
        const cloudEngine = isCloudEngine(engineAdapter.id);
        const effectiveTool = options?.queueTool ?? config.tool;
        const requestedModel = options?.queueModel ?? config.model;

        const queueModel = resolveModelForQueueTool(requestedModel, effectiveTool);
        let runtime:
          | Awaited<
              ReturnType<
                typeof import('@/lib/comfyui-runtime-for-model').resolveRuntimeForQueueAsync
              >
            >
          | undefined;
        let effectiveQualityProfile =
          options?.qualityProfile ?? loadSettingsCache().shared.queueQualityProfile ?? 'final';
        let vramGuard: {
          downgraded: boolean;
          profile: typeof effectiveQualityProfile;
          runtime?: typeof runtime;
        } = { downgraded: false, profile: effectiveQualityProfile };

        if (!cloudEngine) {
          const { resolveRuntimeForQueueAsync } = await import('@/lib/comfyui-runtime-for-model');
          const baseRuntime = await resolveRuntimeForQueueAsync(queueModel, effectiveTool);
          vramGuard = await guardQueueQualityForVram({
            profile: options?.qualityProfile ?? baseRuntime.queueQualityProfile,
            runtime: baseRuntime,
          });
          runtime = {
            ...(vramGuard.runtime ?? baseRuntime),
          };
          effectiveQualityProfile = vramGuard.profile;
          if (options?.draftPreviewLite && runtime) {
            runtime = {
              ...runtime,
              queueQualityProfile: 'draft',
              workflowGraphEnrich: false,
              compactDraftSaves: true,
            };
            effectiveQualityProfile = 'draft';
          }
        }

        if (options?.customTokens?.length && runtime) {
          const byToken = new Map((runtime.customTokens ?? []).map(entry => [entry.token, entry]));
          for (const entry of options.customTokens) {
            if (entry.token?.trim() && entry.value?.trim()) {
              byToken.set(entry.token.trim(), {
                token: entry.token.trim(),
                value: entry.value.trim(),
              });
            }
          }
          runtime.customTokens = [...byToken.values()];
        }

        if (options?.regionalSlots?.length && runtime) {
          runtime.regionalSlots = options.regionalSlots;
        }

        const { positive: preparedPrompt, negative: negativePrompt } = await prepareQueuePrompts({
          model: queueModel,
          positive: injectLoraTriggers(workingPrompt),
          hints: options?.queueHints ?? config.hints,
          sport,
          tool: config.tool,
          explicitNegative: options?.explicitNegative ?? pluginNegative,
          embeddingTokens: loadSettingsCache().shared.sessionEmbeddingTokens,
          turboEditStrength:
            options?.turboEditStrength ?? loadSettingsCache().shared.turboEditStrength,
        });
        failedQueueSnapshot = {
          prompt: preparedPrompt,
          negativePrompt,
          model: queueModel,
          tool: config.tool,
          workflowJson: runtime?.workflowJson,
        };

        if (engineAdapter.id === 'comfyui') {
          const { runWorkflowPreflightWithNodeInstall } = await import('@/lib/workflow-preflight');
          const preflight = await runWorkflowPreflightWithNodeInstall({
            model: queueModel,
            prompts: [preparedPrompt],
            negativePrompt,
            tool: config.tool,
            queueParams: options?.queueParamsBase,
            hasInputImage: Boolean(
              options?.inputImage ||
              options?.inputImageUrl?.trim() ||
              options?.inputImageFilename?.trim() ||
              options?.inputImages?.some(Boolean) ||
              options?.inputImageUrls?.some(url => url?.trim()) ||
              options?.inputImageFilenames?.some(name => name?.trim())
            ),
            hasMaskImage: Boolean(
              options?.maskImage ||
              options?.maskImageUrl?.trim() ||
              options?.maskImageFilename?.trim()
            ),
            hasControlImage: Boolean(
              options?.controlImage ||
              options?.controlImageUrl?.trim() ||
              options?.controlImageFilename?.trim() ||
              options?.controlImages?.some(Boolean) ||
              options?.controlImageUrls?.some(url => url?.trim()) ||
              options?.controlImageFilenames?.some(name => name?.trim())
            ),
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
        }

        const {
          inputImageFilename,
          inputImageFilenames,
          uploadedFigureSize,
          clipMode,
          parentVideoUrl,
          maskImageFilename,
          controlImageFilename,
          controlImageFilenames,
          cloudFaceRefPromptInstruction,
        } = await resolveQueueSingleInputs({
          options,
          queueModel,
          effectiveTool,
          cloudEngine,
          engineAdapter,
          setComfyUiStatus,
        });

        const { appendCloudFaceRefPrompt } = await import('@/lib/cloud-compose-refs');
        const faceRefPrompt = appendCloudFaceRefPrompt(
          preparedPrompt,
          cloudFaceRefPromptInstruction
        );

        const workflow = runtime?.workflowJson?.trim()
          ? (parseWorkflowJson(runtime.workflowJson) ?? undefined)
          : undefined;

        const queueParams = await buildQueueSingleParams({
          config,
          options,
          queueModel,
          effectiveTool,
          workflow,
          effectiveQualityProfile,
          inputImageFilename,
          inputImageFilenames,
          maskImageFilename,
          controlImageFilename,
          controlImageFilenames,
          uploadedFigureSize,
          pluginDenoise,
          pluginCfg,
        });

        if (engineAdapter.id === 'comfyui' && effectiveQualityProfile === 'max') {
          const { holdMaxGenerateJob, shouldHoldMaxUntilIdle } =
            await import('@/lib/held-max-queue');
          if (await shouldHoldMaxUntilIdle()) {
            holdMaxGenerateJob({
              prompt: faceRefPrompt,
              negativePrompt,
              model: queueModel,
              tool: effectiveTool,
              params: queueParams,
              comfy: runtime,
              qualityProfile: 'max',
            });
            setComfyUiStatus('Max held until ComfyUI queue is idle (Queue → Orchestration).');
            toastHeldMax({ text: 'Max job held until ComfyUI is idle' });
            return;
          }
        }

        const autoSaveEnabled = loadComfyUiSettings().autoSaveHistoryOnQueue !== false;
        const resolvedHistoryId =
          historyId ??
          (autoSaveEnabled && !historySaved
            ? saveHistory({
                prompt: faceRefPrompt,
                hints: config.hints,
                parentHistoryId: resolveParentHistoryId(),
              })
            : undefined);

        const previewComfyUrlHint = cloudEngine
          ? resolveCloudEngineHost(engineAdapter.id)
          : engineAdapter.id === 'diffusers'
            ? engineSettings.diffusersApiUrl
            : runtime?.apiUrl?.trim() || loadComfyUiSettings().apiUrl?.trim() || undefined;

        failedQueueSnapshot = {
          prompt: faceRefPrompt,
          negativePrompt,
          model: queueModel,
          tool: config.tool,
          queueParams,
          workflowJson: runtime?.workflowJson,
        };

        return await postQueueSinglePrompt({
          engineAdapter,
          preparedPrompt: faceRefPrompt,
          negativePrompt,
          queueModel,
          configModel: config.model,
          effectiveTool,
          queueParams,
          runtime,
          effectiveQualityProfile,
          inputImageFilename,
          inputImageFilenames,
          clipMode,
          parentVideoUrl,
          previewComfyUrlHint,
          resolvedHistoryId,
          options,
          vramGuard,
          tracker: {
            setComfyUiStatus,
            setComfyUiJob,
            trackComfyUiJob,
          },
          identityRelocateAttemptRef,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'ComfyUI failed.';
        // Release before recursive retry so relocate can re-enter sendComfyUi.
        queueInFlightRef.current = false;
        const relocated = await tryRelocateIdentityAndRetry({
          message,
          model: config.model,
          identityRelocateAttemptRef,
          onRelocating: () => setComfyUiStatus('Re-uploading identity to a live host…'),
          retry: () => sendComfyUiRef.current(prompt, sport, historyId, options),
        });
        if (relocated != null) {
          return relocated;
        }
        handleQueueFailure({
          err,
          prompt,
          config,
          failedQueueSnapshot,
          setComfyUiStatus,
          resetIdentityRelocateAttempt: () => {
            identityRelocateAttemptRef.current = false;
          },
        });
      } finally {
        queueInFlightRef.current = false;
      }
    },
    [config.model, config.tool, config.hints, saveHistory, trackComfyUiJob, historySaved]
  );
  useEffect(() => {
    sendComfyUiRef.current = sendComfyUi;
  }, [sendComfyUi]);

  return { sendComfyUi, sendComfyUiRef };
}
