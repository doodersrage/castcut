'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import {
  ANATOMY_REPAIR_CHANGE_DESCRIPTION,
  ANATOMY_REPAIR_MASK_DESCRIPTION,
  isAnatomyRepairHandoff,
} from '@/lib/adult/anatomy-repair-handoff';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui/config';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getReformatTargetModel } from '@/lib/edit/reformat-target';
import { buildInpaintInstruction } from '@/lib/prompt/regional-prompt-builder';
import { isInpaintModel } from '@/lib/model/denoise-defaults';
import { DEFAULT_INPAINT_TOOL_CACHE } from '@/lib/settings/cache';
import { createDefaultRegionalSlots } from '@/lib/prompt/regional-prompt-slots';
import { regionalSlotsQueueExtras } from '@/components/RegionalEditPanel';
import { rememberDraftFields } from '@/lib/app/remember-draft-fields';
import { sharedPatchFromGalleryHandoff } from '@/lib/gallery/handoff';
import { resolveLocalImageFile, scanStillWithVision } from '@/lib/vision/still-scan-client';

const DEFAULT_INPAINT_MODEL: ComfyImageModel = 'flux-inpaint';

export function useInpaintToolOrchestration() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'inpaint',
    DEFAULT_INPAINT_TOOL_CACHE
  );
  const modelInitializedRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const [handoffQueueParams, setHandoffQueueParams] = useState<WorkflowParamValues | undefined>();
  const [anatomyRepairMode, setAnatomyRepairMode] = useState(false);
  const maskDescription = toolSettings.maskDescription ?? '';
  const changeDescription = toolSettings.changeDescription ?? '';
  const directPrompt = toolSettings.directPrompt ?? '';
  const setMaskDescription = useCallback(
    (value: string) => {
      updateToolSettings({ maskDescription: value });
      rememberDraftFields({
        toolKey: 'inpaint',
        label: 'Inpaint',
        href: '/inpaint',
        fields: [value, changeDescription, directPrompt],
      });
    },
    [changeDescription, directPrompt, updateToolSettings]
  );
  const setChangeDescription = useCallback(
    (value: string) => {
      updateToolSettings({ changeDescription: value });
      rememberDraftFields({
        toolKey: 'inpaint',
        label: 'Inpaint',
        href: '/inpaint',
        fields: [maskDescription, value, directPrompt],
      });
    },
    [directPrompt, maskDescription, updateToolSettings]
  );
  const setDirectPrompt = useCallback(
    (value: string) => {
      updateToolSettings({ directPrompt: value });
      rememberDraftFields({
        toolKey: 'inpaint',
        label: 'Inpaint',
        href: '/inpaint',
        fields: [maskDescription, changeDescription, value],
      });
    },
    [changeDescription, maskDescription, updateToolSettings]
  );
  useSeedToolDraft(mounted, {
    toolKey: 'inpaint',
    label: 'Inpaint',
    href: '/inpaint',
    fields: [maskDescription, changeDescription, directPrompt],
  });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const actions = usePromptResultActions({
    tool: 'inpaint',
    model: shared.model,
    detail: shared.detail,
    hints: maskDescription || changeDescription,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const needsInpaintMask = isInpaintModel(shared.model);

  const output = useMemo(() => {
    if (directPrompt.trim()) {
      return directPrompt.trim();
    }
    if (maskDescription.trim() && changeDescription.trim()) {
      return buildInpaintInstruction(maskDescription, changeDescription);
    }
    return changeDescription.trim();
  }, [changeDescription, directPrompt, maskDescription]);

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

  useEffect(() => {
    if (!mounted || modelInitializedRef.current) {
      return;
    }
    modelInitializedRef.current = true;
    if (!isInpaintModel(shared.model)) {
      updateShared({ model: DEFAULT_INPAINT_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

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
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
      payload: import('@/lib/gallery/handoff').GalleryHandoffPayload;
    }) => {
      const anatomy = isAnatomyRepairHandoff(handoff.payload);
      setAnatomyRepairMode(anatomy);
      if (anatomy) {
        setMaskDescription(ANATOMY_REPAIR_MASK_DESCRIPTION);
        setChangeDescription(ANATOMY_REPAIR_CHANGE_DESCRIPTION);
        setHandoffQueueParams(handoff.queueParams);
      } else {
        setChangeDescription(handoff.prompt);
        setHandoffQueueParams(handoff.queueParams);
      }
      if (handoff.file) {
        setFile(handoff.file);
        setPreviewUrl(handoff.previewUrl);
      } else if (handoff.previewUrl) {
        setPreviewUrl(handoff.previewUrl);
      }
      clearMaskState();
      const sharedPatch = sharedPatchFromGalleryHandoff(handoff.payload);
      const model = handoff.model ?? handoff.payload.model;
      if (model && isInpaintModel(model)) {
        updateShared({ model: model as ComfyImageModel, ...sharedPatch });
      } else if (anatomy) {
        updateShared({ model: DEFAULT_INPAINT_MODEL, ...sharedPatch });
      } else if (Object.keys(sharedPatch).length > 0) {
        updateShared(sharedPatch);
      }
    },
    [clearMaskState, setChangeDescription, setMaskDescription, updateShared]
  );

  useGalleryHandoff('inpaint', applyGalleryHandoff);

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
      setError('Upload a source image first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const image = await resolveLocalImageFile(file, previewUrl, 'inpaint-source.png');
      const prompt = await scanStillWithVision({
        image,
        purpose: 'inpaint',
        model: shared.model,
        detail: shared.detail,
        extraHints: maskDescription.trim() || undefined,
        shared,
      });
      setChangeDescription(prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision scan failed.');
    } finally {
      setScanning(false);
    }
  }, [file, maskDescription, previewUrl, setChangeDescription, shared]);

  const assertReadyToQueue = useCallback(() => {
    if (!previewUrl && !file) {
      setError('Upload a source image first.');
      return false;
    }
    if (!output.trim()) {
      setError('Describe what belongs in the masked region.');
      return false;
    }
    if (needsInpaintMask && !maskFile && !maskPreviewUrl) {
      setError('Draw or upload an inpaint mask before queueing.');
      return false;
    }
    setError(null);
    return true;
  }, [file, maskFile, maskPreviewUrl, needsInpaintMask, output, previewUrl]);

  const lintAndSetDirectPrompt = useCallback(async () => {
    if (!output.trim()) {
      return;
    }
    actions.resetStatuses();
    const finalized = await actions.finalizePrompt(output, maskDescription || changeDescription);
    setDirectPrompt(finalized);
  }, [actions, changeDescription, maskDescription, output, setDirectPrompt]);

  const copyOutput = useCallback(async () => {
    if (!output) {
      return;
    }
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
    scanning,
    maskFile,
    maskPreviewUrl,
    anatomyRepairMode,
    maskDescription,
    changeDescription,
    directPrompt,
    setMaskDescription,
    setChangeDescription,
    setDirectPrompt,
    error,
    copied,
    actions,
    selectedModel,
    needsInpaintMask,
    output,
    regionalSlots,
    queueImageOptions,
    onMaskChange,
    onFileChange,
    scanWithVision,
    assertReadyToQueue,
    lintAndSetDirectPrompt,
    copyOutput,
  };
}
