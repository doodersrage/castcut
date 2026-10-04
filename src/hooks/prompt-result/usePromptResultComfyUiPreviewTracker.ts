'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AthleticSport } from '@/lib/athletic-sport-profiles';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { resolveModelForQueueTool } from '@/lib/queue-tool-model';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import { scheduleComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import { registerComfyGalleryJob } from '@/lib/comfyui-gallery-client';
import { attachGalleryPromptIdToHistory, linkGalleryToHistory } from '@/lib/prompt-lineage';
import { loadActiveProjectId } from '@/lib/prompt-projects';
import { loadSettingsCache } from '@/lib/settings-cache';
import { getEngineAdapter } from '@/lib/engine';
import { engineDisplayName } from '@/lib/engine/capabilities';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { prepareQueuePrompts } from '@/lib/queue-prompt-prep';
import {
  formatComfyUiJobStatusLine,
  isComfyUiJobProcessing,
  type ComfyUiJobTrackerState,
} from '@/lib/comfyui-job-status';
import type { PromptResultActionsConfig, WorkflowPreviewResult } from '@/hooks/prompt-result/types';
import type { TrackComfyUiJobInput } from '@/hooks/prompt-result/comfy-ui-types';

export function usePromptResultComfyUiPreviewTracker(config: PromptResultActionsConfig) {
  const [comfyUiStatus, setComfyUiStatus] = useState<string | null>(null);
  const [comfyUiJob, setComfyUiJob] = useState<ComfyUiJobTrackerState | null>(null);
  const [comfyUiPreviewUrl, setComfyUiPreviewUrl] = useState<string | null>(null);
  const [workflowPreview, setWorkflowPreview] = useState<WorkflowPreviewResult | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  /** Bumped on each queue so stale gallery polls cannot overwrite a newer job preview. */
  const previewGenerationRef = useRef(0);
  const identityRelocateAttemptRef = useRef(false);

  const resetStatuses = useCallback(() => {
    setComfyUiStatus(null);
    setComfyUiJob(null);
    setComfyUiPreviewUrl(null);
    setWorkflowPreview(null);
    setPreviewStatus(null);
  }, []);

  useEffect(() => {
    if (!comfyUiJob || !isComfyUiJobProcessing(comfyUiJob)) {
      return;
    }
    const promptId = comfyUiJob.promptId;
    const syncFromGallery = () => {
      const entry = loadComfyGallery().find(item => item.promptId === promptId);
      if (!entry || (entry.status !== 'completed' && entry.status !== 'error')) {
        return;
      }
      const finishedJob: ComfyUiJobTrackerState = {
        promptId,
        status: entry.status,
        statusMessage: entry.statusMessage,
        comfyUrl: entry.comfyUrl ?? comfyUiJob.comfyUrl,
        engineId: comfyUiJob.engineId,
        imageCount: entry.images?.length,
        progressValue: undefined,
        progressMax: undefined,
        progressNode: undefined,
      };
      setComfyUiJob(finishedJob);
      setComfyUiStatus(formatComfyUiJobStatusLine(finishedJob));
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncFromGallery);
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncFromGallery);
  }, [comfyUiJob]);

  const trackComfyUiJob = useCallback(
    (input: TrackComfyUiJobInput, showPreview = true) => {
      const generation = previewGenerationRef.current;
      const engineId = input.engineId ?? getEngineAdapter().id;
      const galleryEntry = registerComfyGalleryJob({
        promptId: input.promptId,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        tool: input.tool ?? config.tool,
        model: input.model ?? config.model,
        comfyUrl: input.comfyUrl,
        clientId: input.clientId,
        historyId: input.historyId,
        queueParams: input.queueParams,
        workflowJson: input.workflowJson,
        parentGalleryEntryId: input.parentGalleryEntryId,
        characterId: input.characterId,
        lookId: input.lookId,
        derivedKind: input.derivedKind,
        sourceImageUrl: input.sourceImageUrl,
        maskImageUrl: input.maskImageUrl,
        queueQualityProfile: input.queueQualityProfile,
        sessionActiveLoraIds: input.sessionActiveLoraIds,
        sessionLoraStrengthOverrides: input.sessionLoraStrengthOverrides,
        sessionEmbeddingTokens: loadSettingsCache().shared.sessionEmbeddingTokens,
        projectId: loadActiveProjectId(),
        engineId,
        adultCheck: input.adultCheck,
      });

      if (input.historyId) {
        linkGalleryToHistory(input.promptId, input.historyId);
        attachGalleryPromptIdToHistory(input.historyId, input.promptId, galleryEntry.id);
      }

      const initialJob: ComfyUiJobTrackerState = {
        promptId: input.promptId,
        status: 'pending',
        statusMessage: `Submitted to ${engineDisplayName(engineId)}`,
        comfyUrl: input.comfyUrl,
        engineId,
      };
      setComfyUiJob(initialJob);
      setComfyUiStatus(formatComfyUiJobStatusLine(initialJob));

      void scheduleComfyGalleryPoll(input.promptId, {
        comfyUrl: input.comfyUrl,
        onJobUpdate: job => {
          if (generation !== previewGenerationRef.current) {
            return;
          }
          const next = { ...job, engineId: job.engineId ?? engineId };
          setComfyUiJob(next);
          setComfyUiStatus(formatComfyUiJobStatusLine(next));
        },
      }).then(entry => {
        if (generation !== previewGenerationRef.current) {
          return;
        }
        if (!entry) {
          return;
        }

        const finishedJob: ComfyUiJobTrackerState = {
          promptId: input.promptId,
          status: entry.status,
          statusMessage: entry.statusMessage,
          comfyUrl: entry.comfyUrl,
          engineId,
          imageCount: entry.images.length,
          progressValue: undefined,
          progressMax: undefined,
          progressNode: undefined,
        };
        setComfyUiJob(finishedJob);
        setComfyUiStatus(formatComfyUiJobStatusLine(finishedJob));

        if (entry.status === 'completed') {
          const preview = galleryEntryPrimaryViewUrl(entry);
          // A still the adult-appearance gate holds is never previewed here.
          if (showPreview && preview && !input.adultCheck) {
            setComfyUiPreviewUrl(preview);
          }
        }
      });
    },
    [config.model, config.tool]
  );

  const previewWorkflow = useCallback(
    async (prompt: string, sport?: AthleticSport | null) => {
      if (!prompt.trim()) {
        return;
      }

      setPreviewStatus('Building preview…');
      setWorkflowPreview(null);
      try {
        const { positive: preparedPrompt, negative: negativePrompt } = await prepareQueuePrompts({
          model: config.model,
          positive: prompt,
          hints: config.hints,
          sport,
          tool: config.tool,
          embeddingTokens: loadSettingsCache().shared.sessionEmbeddingTokens,
          turboEditStrength: loadSettingsCache().shared.turboEditStrength,
        });

        const [{ fetchWorkflowPreview }, { resolveRuntimeForQueueAsync }] = await Promise.all([
          import('@/lib/comfyui-requeue'),
          import('@/lib/comfyui-runtime-for-model'),
        ]);
        const preview = await fetchWorkflowPreview({
          prompt: preparedPrompt,
          negativePrompt,
          model: resolveModelForQueueTool(config.model, config.tool),
          params: resolveQueueParams({
            model: resolveModelForQueueTool(config.model, config.tool),
            tool: config.tool,
          }),
          comfy: await resolveRuntimeForQueueAsync(config.model, config.tool),
        });
        setWorkflowPreview(preview);
        setPreviewStatus('Workflow preview ready (not queued).');
      } catch (err) {
        setPreviewStatus(err instanceof Error ? err.message : 'Preview failed.');
      }
    },
    [config.hints, config.model, config.tool]
  );

  return {
    previewGenerationRef,
    identityRelocateAttemptRef,
    comfyUiStatus,
    comfyUiJob,
    comfyUiPreviewUrl,
    workflowPreview,
    previewStatus,
    setComfyUiStatus,
    setComfyUiJob,
    setComfyUiPreviewUrl,
    setWorkflowPreview,
    setPreviewStatus,
    resetStatuses,
    trackComfyUiJob,
    previewWorkflow,
  };
}
