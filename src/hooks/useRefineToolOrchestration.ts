'use client';

import { useCallback, useMemo, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui/config';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { isInpaintModel } from '@/lib/model-denoise-defaults';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { resolveParentHistoryId } from '@/lib/prompt-lineage-session';
import { DEFAULT_REFINE_TOOL_CACHE } from '@/lib/settings-cache';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { createDefaultRegionalSlots } from '@/lib/regional-prompt-slots';
import { regionalSlotsQueueExtras } from '@/components/RegionalEditPanel';
import { sharedPatchFromGalleryHandoff, type GalleryHandoffPayload } from '@/lib/gallery/handoff';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from '@/lib/vision-scan-still';

export function useRefineToolOrchestration() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'refine',
    DEFAULT_REFINE_TOOL_CACHE
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const currentPrompt = toolSettings.currentPrompt ?? '';
  const intentHints = toolSettings.intentHints ?? '';
  const setCurrentPrompt = useCallback(
    (value: string) => {
      updateToolSettings({ currentPrompt: value });
      rememberDraftFields({
        toolKey: 'refine',
        label: 'Refine',
        href: '/refine',
        fields: [intentHints, value],
      });
    },
    [intentHints, updateToolSettings]
  );
  const setIntentHints = useCallback(
    (value: string) => {
      updateToolSettings({ intentHints: value });
      rememberDraftFields({
        toolKey: 'refine',
        label: 'Refine',
        href: '/refine',
        fields: [value, currentPrompt],
      });
    },
    [currentPrompt, updateToolSettings]
  );
  useSeedToolDraft(mounted, {
    toolKey: 'refine',
    label: 'Refine',
    href: '/refine',
    fields: [intentHints, currentPrompt],
  });
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sourceHistoryId, setSourceHistoryId] = useState<string | undefined>();
  const [beforePrompt, setBeforePrompt] = useState('');
  const [handoffQueueParams, setHandoffQueueParams] = useState<WorkflowParamValues | undefined>();

  const actions = usePromptResultActions({
    tool: 'refine',
    model: shared.model,
    detail: shared.detail,
    hints: intentHints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const needsInpaintMask = isInpaintModel(shared.model);

  const regionalSlots = toolSettings.regionalSlots ?? createDefaultRegionalSlots();
  const regionalQueue = useMemo(() => regionalSlotsQueueExtras(regionalSlots), [regionalSlots]);

  const queueImageOptions = {
    inputImage: file,
    inputImageUrl: !file ? (previewUrl ?? undefined) : undefined,
    maskImage: needsInpaintMask ? maskFile : undefined,
    maskImageUrl: needsInpaintMask && !maskFile ? (maskPreviewUrl ?? undefined) : undefined,
    queueParamsBase: handoffQueueParams,
    customTokens: regionalQueue.customTokens,
    regionalSlots: regionalQueue.regionalSlots,
  };

  const assertInpaintMaskReady = useCallback(() => {
    if (!needsInpaintMask) {
      return true;
    }
    if (maskFile || maskPreviewUrl) {
      return true;
    }
    setError('Upload an inpaint mask (white = edit region) before queueing.');
    return false;
  }, [maskFile, maskPreviewUrl, needsInpaintMask]);

  const onMaskChange = useCallback((nextFile: File | null, nextPreviewUrl: string | null) => {
    setMaskFile(nextFile);
    setMaskPreviewUrl(current => {
      if (current && current !== nextPreviewUrl) {
        URL.revokeObjectURL(current);
      }
      return nextPreviewUrl;
    });
  }, []);

  const clearMaskState = useCallback(() => {
    setMaskFile(null);
    setMaskPreviewUrl(current => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      improveIntent?: string;
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
      payload: GalleryHandoffPayload;
    }) => {
      setCurrentPrompt(handoff.prompt);
      setBeforePrompt(handoff.prompt);
      setSourceHistoryId(handoff.payload.historyId ?? resolveParentHistoryId());
      setHandoffQueueParams(handoff.queueParams);
      if (handoff.improveIntent) {
        setIntentHints(handoff.improveIntent);
      }
      const sharedPatch = sharedPatchFromGalleryHandoff(handoff.payload);
      if (handoff.model) {
        updateShared({
          model: handoff.model as ComfyImageModel,
          ...sharedPatch,
        });
      } else if (Object.keys(sharedPatch).length > 0) {
        updateShared(sharedPatch);
      }
      if (handoff.file) {
        setFile(handoff.file);
        setPreviewUrl(handoff.previewUrl);
      } else if (handoff.previewUrl) {
        setPreviewUrl(handoff.previewUrl);
      }
      clearMaskState();
    },
    [clearMaskState, setCurrentPrompt, setIntentHints, updateShared]
  );

  useGalleryHandoff('refine', applyGalleryHandoff);

  const onFileChange = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
      clearMaskState();
    },
    [clearMaskState, previewUrl]
  );

  const scanWithVision = useCallback(async () => {
    if (!file && !previewUrl) {
      setError('Upload a reference image first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const still = await resolveStillFileForVisionScan({
        file,
        urls: [previewUrl],
        fallbackName: 'refine-source.jpg',
      });
      const { image, mimeType } = await prepareVisionScanImagePayload(still);
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'scan',
          image,
          mimeType,
          model: shared.model,
          detail: shared.detail,
          intentHints: intentHints.trim() || undefined,
          ...sharedLlmRequestBody(shared),
        }),
      });
      const data = await parseVisionScanApiResponse<{
        currentPrompt?: string;
        error?: string;
      }>(response);
      if (!response.ok || !data.currentPrompt?.trim()) {
        throw new Error(data.error ?? 'Vision scan failed.');
      }
      setCurrentPrompt(data.currentPrompt.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision scan failed.');
    } finally {
      setScanning(false);
    }
  }, [file, intentHints, previewUrl, setCurrentPrompt, shared]);

  const refine = useCallback(async () => {
    if (!file && !previewUrl) {
      setError('Upload a reference image first.');
      return;
    }
    if (!intentHints.trim() && !currentPrompt.trim()) {
      setError('Enter intent hints or a current prompt to refine against.');
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    let stage = 'load-image';
    try {
      const still = await resolveStillFileForVisionScan({
        file,
        urls: [previewUrl],
        fallbackName: 'refine-source.jpg',
      });
      stage = 'read-image';
      const { image, mimeType } = await prepareVisionScanImagePayload(still);
      stage = 'request';
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          mimeType,
          model: shared.model,
          detail: shared.detail,
          currentPrompt: currentPrompt.trim() || undefined,
          intentHints: intentHints.trim() || undefined,
          ...sharedLlmRequestBody(shared),
        }),
      });

      stage = 'parse-response';
      const data = (await response.json()) as {
        prompt?: string;
        error?: string;
        stage?: string;
      };

      if (!response.ok) {
        const serverStage = data.stage ? ` [${data.stage}]` : '';
        throw new Error(`${data.error ?? 'Refine failed.'}${serverStage}`);
      }

      stage = 'finalize';
      const prompt = await actions.finalizePrompt(
        data.prompt ?? '',
        intentHints.trim() || currentPrompt.trim()
      );
      setBeforePrompt(currentPrompt.trim() || beforePrompt);
      setOutput(prompt);
    } catch (err) {
      setOutput('');
      const message = err instanceof Error ? err.message : 'Refine failed.';
      setError(
        message.includes('[') || message.startsWith('Refine failed')
          ? message
          : `Refine failed at ${stage}: ${message}`
      );
    } finally {
      setLoading(false);
    }
  }, [actions, beforePrompt, currentPrompt, file, intentHints, previewUrl, shared]);

  const copyOutput = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [output]);

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    file,
    previewUrl,
    maskFile,
    maskPreviewUrl,
    currentPrompt,
    intentHints,
    setCurrentPrompt,
    setIntentHints,
    output,
    setOutput,
    loading,
    scanning,
    error,
    copied,
    sourceHistoryId,
    beforePrompt,
    actions,
    selectedModel,
    needsInpaintMask,
    regionalSlots,
    queueImageOptions,
    assertInpaintMaskReady,
    onMaskChange,
    onFileChange,
    scanWithVision,
    refine,
    copyOutput,
  };
}
