'use client';

import type { DiffusersCheckpointOption } from '@/components/DiffusersCheckpointSelector';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { supportedModelsFilterHint } from '@/lib/model-workflow-map';
import {
  resolvePreferredImg2imgModel,
  resolvePreferredLookModel,
  toolIgnoresSystemWorkflowSnap,
} from '@/lib/queue-tool-model';
import { isImg2imgCapableModel } from '@/lib/model-denoise-defaults';
import { formatQueueQualityProfileHint } from '@/lib/queue-quality-profile';
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from '@/lib/settings-cache';
import {
  describeSystemWorkflowChoice,
  isSystemWorkflowSupportedModel,
  resolveSystemWorkflowFallbackModel,
  shouldLimitSystemWorkflowPicker,
  usesSystemWorkflowPath,
} from '@/lib/system-workflow-runtime';
import { readCachedComfyObjectInfoModels } from '@/lib/comfyui-object-info-cache';
import { scanAndAdaptSystemWorkflowInventory } from '@/lib/comfyui-runtime-for-model';
import { loadComfyWorkflowFiles } from '@/lib/comfyui-workflow-files';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { isBrowserStorageReady } from '@/lib/browser-storage';
import {
  DIFFUSERS_DEFAULT_MODEL,
  resolveStudioModelForDiffusersAsset,
} from '@/lib/diffusers-defaults';
import { SUGGESTED_MODEL_CHECKPOINT_MAP } from '@/lib/model-checkpoint-map';
import { isCloudEngine } from '@/lib/engine/capabilities';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { SharedToolModelWorkflowCore } from '@/hooks/shared-tool/useSharedToolModelWorkflowCore';

export function useSharedToolModelWorkflowPart2(ctx: SharedToolModelWorkflowCore) {
  const {
    shared,
    toolId,
    preferEditModels,
    queueQualityProfile,
    samplerPreset,
    resolutionSizeTier,
    onModelChange,
    onWorkflowPresetChange,
    onSharedSettingsChange,
    storageReady,
    showAllModelsOverride,
    setShowAllModelsOverride,
    setInventoryTick,
    pickerModels,
    handleModelChange,
    workflowManualOverrideRef,
    mappedWorkflowForModel,
    selectedWorkflowId,
    workflowSelection,
    supportedModels,
    workflowCatalog,
    suggestedWorkflowMap,
    selectedWorkflowJson,
    inventoryTick,
  } = ctx;

  const onWorkflowPresetChangeRef = useRef(onWorkflowPresetChange);
  const setWorkflowSelectedIdRef = useRef(workflowSelection.setSelectedId);

  const handleDiffusersAssetChange = useCallback(
    (asset: DiffusersCheckpointOption) => {
      const studioModel = (asset.studioModelId?.trim() ||
        resolveStudioModelForDiffusersAsset(
          asset.weightId || asset.id,
          asset.family
        )) as ComfyImageModel;
      const weightId = (asset.weightId || asset.id).trim();
      const sharedNow = loadSettingsCache().shared;
      const nextMap = {
        ...sharedNow.modelCheckpointMap,
        [studioModel]: weightId,
      };
      saveSharedSettings(
        {
          ...sharedNow,
          model: studioModel,
          modelCheckpointMap: nextMap,
        },
        { notify: false }
      );
      onSharedSettingsChange?.({
        model: studioModel,
        modelCheckpointMap: nextMap,
      });
      handleModelChange(studioModel);
    },
    [handleModelChange, onSharedSettingsChange]
  );

  const diffusersSelectedAssetId = useMemo(() => {
    const model = String(shared.model ?? '').trim();
    if (/lightning/i.test(model) && !/\.(safetensors|ckpt|pt|bin)$/i.test(model)) {
      return model;
    }
    if (/\.(safetensors|ckpt|pt|bin)$/i.test(model)) {
      return model;
    }
    return (
      shared.modelCheckpointMap?.[model]?.trim() ||
      SUGGESTED_MODEL_CHECKPOINT_MAP[model]?.trim() ||
      DIFFUSERS_DEFAULT_MODEL
    );
  }, [shared.model, shared.modelCheckpointMap]);

  const handleShowAllModels = useCallback(() => {
    setShowAllModelsOverride(true);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        showAllModelsOverride: true,
      },
      { notify: false }
    );
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    if (
      !shouldLimitSystemWorkflowPicker(shared) ||
      showAllModelsOverride ||
      toolIgnoresSystemWorkflowSnap(toolId)
    ) {
      return;
    }
    if (isSystemWorkflowSupportedModel(shared.model)) {
      return;
    }
    const fallback =
      pickerModels.find(model => isSystemWorkflowSupportedModel(model)) ??
      resolveSystemWorkflowFallbackModel(shared.model);
    if (fallback !== shared.model) {
      onModelChange(fallback);
    }
  }, [
    onModelChange,
    pickerModels,
    shared.model,
    shared.systemWorkflowsLimitPicker,
    shared.useSystemWorkflows,
    showAllModelsOverride,
    storageReady,
    toolId,
  ]);

  useEffect(() => {
    if (!storageReady || !preferEditModels) {
      return;
    }
    // Always leave T2I defaults (e.g. qwen-image-2512) even if a stale catalog
    // briefly listed them — Outfit/Day need an edit/img2img checkpoint.
    // Snap even under "Show all" so Day/Outfit cannot stay on 2512 and dump
    // magenta Image 3 pose guides as the still.
    if (isImg2imgCapableModel(shared.model)) {
      if (
        showAllModelsOverride ||
        pickerModels.length === 0 ||
        pickerModels.includes(shared.model)
      ) {
        return;
      }
    }
    const fallback = resolvePreferredImg2imgModel({
      current: shared.model,
      allowed: showAllModelsOverride || pickerModels.length === 0 ? undefined : pickerModels,
    });
    if (fallback !== shared.model) {
      handleModelChange(fallback);
    }
  }, [
    handleModelChange,
    pickerModels,
    preferEditModels,
    shared.model,
    showAllModelsOverride,
    storageReady,
  ]);

  useEffect(() => {
    if (!storageReady || showAllModelsOverride || preferEditModels) {
      return;
    }
    if (
      toolId !== 'video' &&
      toolId !== 'inpaint' &&
      toolId !== 'outpaint' &&
      toolId !== 'compose'
    ) {
      return;
    }
    if (pickerModels.length === 0 || pickerModels.includes(shared.model)) {
      return;
    }
    const fallback = pickerModels[0];
    if (fallback && fallback !== shared.model) {
      onModelChange(fallback);
    }
  }, [
    onModelChange,
    pickerModels,
    preferEditModels,
    shared.model,
    showAllModelsOverride,
    storageReady,
    toolId,
  ]);

  const lookModelDefaultApplied = useRef(false);
  useEffect(() => {
    if (!storageReady || toolId !== 'moodboard' || lookModelDefaultApplied.current) {
      return;
    }
    const preferred = resolvePreferredLookModel({
      inventory: readCachedComfyObjectInfoModels(),
    });
    if (!preferred) {
      return;
    }
    lookModelDefaultApplied.current = true;
    if (shared.model !== preferred) {
      // Use handleModelChange so UltraReal companion LoRAs / workflow map apply.
      handleModelChange(preferred);
    }
  }, [handleModelChange, inventoryTick, shared.model, storageReady, toolId]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    if (shared.useSystemWorkflows !== true) {
      return;
    }
    let cancelled = false;
    const runScan = () => {
      void scanAndAdaptSystemWorkflowInventory({ persist: true }).then(models => {
        if (!cancelled && models) {
          setInventoryTick(value => value + 1);
        }
      });
    };
    let cancelIdle: (() => void) | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(runScan, { timeout: 4000 });
      cancelIdle = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(runScan, 500);
      cancelIdle = () => window.clearTimeout(id);
    }
    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, [shared.useSystemWorkflows, shared.model, storageReady]);

  const videoInitKey =
    toolId === 'video'
      ? (loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).initImageUrl?.trim() ?? '')
      : '';

  const systemWorkflowChoice = useMemo(() => {
    if (!usesSystemWorkflowPath(shared, shared.model)) {
      return null;
    }
    try {
      const preferI2v =
        getComfyModelDefinition(shared.model)?.category === 'video' && Boolean(videoInitKey);
      return describeSystemWorkflowChoice(
        shared.model,
        loadComfyWorkflowFiles(),
        readCachedComfyObjectInfoModels(),
        { preferI2v, tool: toolId }
      );
    } catch {
      return {
        source: 'scaffold' as const,
        label: 'Built-in scaffold',
        reason: 'no-worthy-pack' as const,
        display: 'Built-in scaffold',
      };
    }
  }, [
    inventoryTick,
    shared.model,
    shared.systemWorkflowsLimitPicker,
    shared.useSystemWorkflows,
    videoInitKey,
    workflowCatalog,
    toolId,
  ]);

  const systemQualityHint = useMemo(() => {
    if (!usesSystemWorkflowPath(shared, shared.model)) {
      return null;
    }
    if (
      queueQualityProfile !== 'draft' &&
      queueQualityProfile !== 'final' &&
      queueQualityProfile !== 'max'
    ) {
      return null;
    }
    return formatQueueQualityProfileHint(queueQualityProfile, samplerPreset, resolutionSizeTier, {
      model: shared.model,
    });
  }, [
    queueQualityProfile,
    resolutionSizeTier,
    samplerPreset,
    shared.model,
    shared.useSystemWorkflows,
  ]);

  const systemPathActive = usesSystemWorkflowPath(shared, shared.model);
  const cloudEngine = isCloudEngine(shared.inferenceEngine);
  const categoryLocked = toolId === 'video' || toolId === 'audio' || toolId === 'mesh';
  const modelFilterHint =
    preferEditModels && !showAllModelsOverride
      ? `From photo · edit / img2img models (${pickerModels.length}). T2I checkpoints overbake the reference.`
      : toolId === 'video' && !showAllModelsOverride
        ? `Video · WAN / Hunyuan / LTX only (${pickerModels.length}). Still-image checkpoints stay on Generate.`
        : toolId === 'inpaint' || toolId === 'outpaint'
          ? `Inpaint / edit models (${pickerModels.length}). T2I checkpoints cannot fill a mask.`
          : toolId === 'compose'
            ? `Compose-capable img2img models (${pickerModels.length}).`
            : systemPathActive
              ? shouldLimitSystemWorkflowPicker(shared) && !showAllModelsOverride
                ? `System path · FLUX / Qwen / Z-Image / Boogu / video (${pickerModels.length} models).`
                : `System path for this model (${pickerModels.length} in picker).`
              : shared.useSystemWorkflows === true
                ? `Hybrid · mapped/manual workflow for this model (${pickerModels.length} in picker).`
                : supportedModelsFilterHint(supportedModels.source, supportedModels.models.length);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    if (selectedWorkflowId?.trim()) {
      return;
    }
    if (!workflowSelection.mounted || shared.autoSelectWorkflowForModel === false) {
      return;
    }
    if (workflowManualOverrideRef.current) {
      return;
    }
    if (!mappedWorkflowForModel || !onWorkflowPresetChangeRef.current) {
      return;
    }
    if (mappedWorkflowForModel === selectedWorkflowId) {
      return;
    }
    scheduleAfterCommit(() => {
      if (!isBrowserStorageReady()) {
        return;
      }
      setWorkflowSelectedIdRef.current(mappedWorkflowForModel);
      onWorkflowPresetChangeRef.current?.(mappedWorkflowForModel);
    });
  }, [
    mappedWorkflowForModel,
    selectedWorkflowId,
    shared.autoSelectWorkflowForModel,
    storageReady,
    workflowSelection.mounted,
  ]);

  return {
    storageReady,
    workflowSelection,
    workflowCatalog,
    suggestedWorkflowMap,
    selectedWorkflowId,
    mappedWorkflowForModel,
    selectedWorkflowJson,
    supportedModels,
    pickerModels,
    showAllModelsOverride,
    handleModelChange,
    handleDiffusersAssetChange,
    diffusersSelectedAssetId,
    handleShowAllModels,
    systemWorkflowChoice,
    systemQualityHint,
    systemPathActive,
    cloudEngine,
    categoryLocked,
    modelFilterHint,
    workflowManualOverrideRef,
  };
}
