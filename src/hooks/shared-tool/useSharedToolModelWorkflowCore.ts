'use client';

import type { DiffusersCheckpointOption } from '@/components/DiffusersCheckpointSelector';
import { useComfyWorkflowSelection } from '@/hooks/useComfyWorkflowSelection';
import { COMFY_IMAGE_MODELS, type ComfyImageModel } from '@/lib/comfy-models/client';
import {
  modelsSupportedByAvailableWorkflows,
  resolveWorkflowForModelSelection,
  suggestWorkflowMapForFiles,
} from '@/lib/model/workflow-map';
import {
  filterModelsForQueueTool,
  isSceneGenerationModel,
  shouldUseSceneGenerationModel,
  toolIgnoresSystemWorkflowSnap,
} from '@/lib/queue/tool-model';
import {
  isComposeCapableModel,
  isEditCapableModel,
  isImg2imgCapableModel,
} from '@/lib/model/denoise-defaults';
import type { ModelSamplerPresetTier } from '@/lib/model/sampler-defaults';
import type { ResolutionSizeTier } from '@/lib/model/resolution-defaults';
import { type QueueQualityProfile } from '@/lib/queue/quality-profile';
import type { SharedToolSettings } from '@/lib/settings/cache';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings/cache';
import {
  describeSystemWorkflowChoice,
  isSystemWorkflowSupportedModel,
  listSystemWorkflowSupportedModels,
  shouldLimitSystemWorkflowPicker,
} from '@/lib/workflow/system-workflow-runtime';
import type { ComfyWorkflowFile } from '@/lib/comfyui/workflow-files';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { isBrowserStorageReady, whenBrowserStorageReady } from '@/lib/storage/browser-storage';
import { resolveModelStackFamily } from '@/lib/workflow/stack-fingerprint';
import { isQwenLightningModel } from '@/lib/workflow/model-sampling-patch';
import {
  resolveEffectiveSessionLoraStrengthOverrides,
  resolveLoraIdsForModelSelection,
} from '@/lib/model/lora-map';
import type { SessionLoraStrengthOverrides } from '@/lib/lora/stack';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

export type UseSharedToolModelWorkflowOptions = {
  shared: SharedToolSettings;
  toolId?: string;
  preferEditModels?: boolean;
  queueQualityProfile: QueueQualityProfile;
  samplerPreset: ModelSamplerPresetTier;
  resolutionSizeTier: ResolutionSizeTier;
  onModelChange: (model: SharedToolSettings['model']) => void;
  onWorkflowPresetChange?: (fileId: string | undefined) => void;
  onSharedSettingsChange?: (partial: Partial<SharedToolSettings>) => void;
  setSessionActiveLoraIds: Dispatch<SetStateAction<string[] | undefined>>;
  setSessionLoraStrengthOverrides: Dispatch<SetStateAction<SessionLoraStrengthOverrides>>;
};

export type UseSharedToolModelWorkflowResult = {
  storageReady: boolean;
  workflowSelection: ReturnType<typeof useComfyWorkflowSelection>;
  workflowCatalog: Array<
    ComfyWorkflowFile | { id: string; name: string; filename: string; workflowJson: string }
  >;
  suggestedWorkflowMap: ReturnType<typeof suggestWorkflowMapForFiles>;
  selectedWorkflowId: string | undefined;
  mappedWorkflowForModel: string | undefined;
  selectedWorkflowJson: string | null;
  supportedModels: ReturnType<typeof modelsSupportedByAvailableWorkflows>;
  pickerModels: ComfyImageModel[];
  showAllModelsOverride: boolean;
  handleModelChange: (model: ComfyImageModel) => void;
  handleDiffusersAssetChange: (asset: DiffusersCheckpointOption) => void;
  diffusersSelectedAssetId: string;
  handleShowAllModels: () => void;
  systemWorkflowChoice: ReturnType<typeof describeSystemWorkflowChoice> | null;
  systemQualityHint: string | null;
  systemPathActive: boolean;
  cloudEngine: boolean;
  categoryLocked: boolean;
  modelFilterHint: string | null;
  workflowManualOverrideRef: MutableRefObject<boolean>;
};

export function useSharedToolModelWorkflowCore({
  shared,
  toolId,
  preferEditModels = false,
  queueQualityProfile,
  samplerPreset,
  resolutionSizeTier,
  onModelChange,
  onWorkflowPresetChange,
  onSharedSettingsChange,
  setSessionActiveLoraIds,
  setSessionLoraStrengthOverrides,
}: UseSharedToolModelWorkflowOptions) {
  const workflowSelection = useComfyWorkflowSelection();
  const [storageReady, setStorageReady] = useState(() => isBrowserStorageReady());
  const [showAllModelsOverride, setShowAllModelsOverride] = useState(
    () => shared.showAllModelsOverride === true
  );
  const [inventoryTick, setInventoryTick] = useState(0);

  useEffect(() => {
    if (storageReady) {
      return;
    }
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (!cancelled) {
        setStorageReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageReady]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setShowAllModelsOverride(shared.showAllModelsOverride === true);
    });
  }, [shared.showAllModelsOverride]);

  const workflowCatalog = useMemo(
    () => [
      ...workflowSelection.localFiles,
      ...workflowSelection.serverFiles.map(entry => ({
        id: entry.id,
        name: entry.name,
        filename: `${entry.name}.json`,
        workflowJson: '',
      })),
    ],
    [workflowSelection.localFiles, workflowSelection.serverFiles]
  );

  const suggestedWorkflowMap = useMemo(
    () => suggestWorkflowMapForFiles(workflowCatalog),
    [workflowCatalog]
  );

  const selectedWorkflowId =
    shared.selectedWorkflowFileId ??
    shared.selectedWorkflowPresetId ??
    workflowSelection.selectedId;

  const mappedWorkflowForModel = useMemo(
    () =>
      resolveWorkflowForModelSelection(shared.model, {
        map: shared.modelWorkflowMap,
        suggestedMap: suggestedWorkflowMap,
        workflowFiles: workflowCatalog,
        tool: toolId,
      }),
    [shared.model, shared.modelWorkflowMap, suggestedWorkflowMap, toolId, workflowCatalog]
  );

  const selectedWorkflowJson = useMemo(() => {
    const id =
      shared.selectedWorkflowFileId ??
      shared.selectedWorkflowPresetId ??
      workflowSelection.selectedId;
    if (!id) {
      return null;
    }
    return workflowCatalog.find(entry => entry.id === id)?.workflowJson ?? null;
  }, [
    shared.selectedWorkflowFileId,
    shared.selectedWorkflowPresetId,
    workflowCatalog,
    workflowSelection.selectedId,
  ]);

  const supportedModels = useMemo(
    () =>
      modelsSupportedByAvailableWorkflows({
        map: shared.modelWorkflowMap,
        workflowFiles: workflowCatalog,
        suggestedMap: suggestedWorkflowMap,
        currentModel: shared.model,
        limitEnabled:
          shared.useSystemWorkflows === true
            ? false
            : shared.limitModelsToAvailableWorkflows !== false,
        showAllOverride: showAllModelsOverride,
      }),
    [
      shared.model,
      shared.modelWorkflowMap,
      shared.limitModelsToAvailableWorkflows,
      shared.useSystemWorkflows,
      showAllModelsOverride,
      suggestedWorkflowMap,
      workflowCatalog,
    ]
  );

  const scaffoldBackedModels = useMemo(
    () =>
      COMFY_IMAGE_MODELS.filter(
        entry =>
          isSystemWorkflowSupportedModel(entry.id) &&
          (isComposeCapableModel(entry.id) || isEditCapableModel(entry.id))
      ).map(entry => entry.id),
    []
  );

  const pickerModels = useMemo(() => {
    const supportedCatalog = [...new Set([...supportedModels.models, ...scaffoldBackedModels])];
    const filtered = filterModelsForQueueTool(supportedCatalog, toolId, {
      includeEditModels: showAllModelsOverride,
      preferEditModels,
    });
    const base =
      filtered.length > 0
        ? filtered
        : preferEditModels
          ? COMFY_IMAGE_MODELS.filter(entry => isImg2imgCapableModel(entry.id)).map(
              entry => entry.id
            )
          : toolId && shouldUseSceneGenerationModel(toolId)
            ? COMFY_IMAGE_MODELS.filter(entry => isSceneGenerationModel(entry.id)).map(
                entry => entry.id
              )
            : supportedModels.models;

    if (
      !shouldLimitSystemWorkflowPicker(shared) ||
      showAllModelsOverride ||
      toolIgnoresSystemWorkflowSnap(toolId)
    ) {
      return base.length > 0 ? base : supportedModels.models;
    }

    const systemOnly = base.filter(model => isSystemWorkflowSupportedModel(model));
    if (systemOnly.length > 0) {
      return systemOnly;
    }
    return listSystemWorkflowSupportedModels().filter(model =>
      filterModelsForQueueTool([model], toolId, {
        includeEditModels: showAllModelsOverride,
        preferEditModels,
      }).includes(model)
    );
  }, [
    preferEditModels,
    showAllModelsOverride,
    scaffoldBackedModels,
    shared.systemWorkflowsLimitPicker,
    shared.useSystemWorkflows,
    supportedModels.models,
    toolId,
  ]);

  const onWorkflowPresetChangeRef = useRef(onWorkflowPresetChange);
  const setWorkflowSelectedIdRef = useRef(workflowSelection.setSelectedId);
  const workflowManualOverrideRef = useRef(false);
  const lastModelStackFamilyRef = useRef(resolveModelStackFamily(shared.model));

  useEffect(() => {
    onWorkflowPresetChangeRef.current = onWorkflowPresetChange;
  }, [onWorkflowPresetChange]);

  useEffect(() => {
    setWorkflowSelectedIdRef.current = workflowSelection.setSelectedId;
  }, [workflowSelection.setSelectedId]);

  const applyWorkflowForModel = useCallback(
    (model: ComfyImageModel, force = false) => {
      if (
        !force &&
        (shared.autoSelectWorkflowForModel === false || !onWorkflowPresetChangeRef.current)
      ) {
        return;
      }
      if (force) {
        workflowManualOverrideRef.current = false;
      }
      const workflowId = resolveWorkflowForModelSelection(model, {
        map: shared.modelWorkflowMap,
        suggestedMap: suggestedWorkflowMap,
        workflowFiles: workflowCatalog,
        tool: toolId,
      });
      if (!workflowId) {
        return;
      }

      const mappedId = shared.modelWorkflowMap?.[model]?.trim();
      if (mappedId && mappedId !== workflowId && isQwenLightningModel(model)) {
        saveSharedSettings(
          {
            ...loadSettingsCache().shared,
            modelWorkflowMap: {
              ...shared.modelWorkflowMap,
              [model]: workflowId,
            },
          },
          { notify: false }
        );
      }

      if (workflowId === selectedWorkflowId) {
        return;
      }
      const onChange = onWorkflowPresetChangeRef.current;
      if (!onChange) {
        return;
      }
      setWorkflowSelectedIdRef.current(workflowId);
      onChange(workflowId);
    },
    [
      selectedWorkflowId,
      shared.autoSelectWorkflowForModel,
      shared.modelWorkflowMap,
      suggestedWorkflowMap,
      toolId,
      workflowCatalog,
    ]
  );

  const handleModelChange = useCallback(
    (model: ComfyImageModel) => {
      const nextStackFamily = resolveModelStackFamily(model);
      const stackFamilyChanged =
        lastModelStackFamilyRef.current !== 'unknown' &&
        nextStackFamily !== 'unknown' &&
        lastModelStackFamilyRef.current !== nextStackFamily;
      if (stackFamilyChanged) {
        workflowManualOverrideRef.current = false;
      }
      lastModelStackFamilyRef.current = nextStackFamily;

      if (showAllModelsOverride) {
        setShowAllModelsOverride(false);
        saveSharedSettings(
          {
            ...loadSettingsCache().shared,
            showAllModelsOverride: false,
          },
          { notify: false }
        );
      }
      onModelChange(model);
      applyWorkflowForModel(model, stackFamilyChanged);

      const sharedNow = loadSettingsCache().shared;
      const nextStrengthOverrides = resolveEffectiveSessionLoraStrengthOverrides(
        model,
        sharedNow.sessionLoraStrengthOverrides,
        sharedNow.sessionLoraStrengthOverridesByModel
      );
      setSessionLoraStrengthOverrides(nextStrengthOverrides);
      if (sharedNow.autoSelectLorasForModel !== false) {
        const nextIds = resolveLoraIdsForModelSelection(model, {
          sessionActiveLoraIdsByModel: sharedNow.sessionActiveLoraIdsByModel,
          modelLoraMap: sharedNow.modelLoraMap,
        });
        setSessionActiveLoraIds(nextIds);
        saveSharedSettings(
          {
            ...loadSettingsCache().shared,
            sessionActiveLoraIds: nextIds,
            sessionLoraStrengthOverrides: nextStrengthOverrides,
          },
          { notify: false }
        );
        onSharedSettingsChange?.({
          sessionActiveLoraIds: nextIds,
          sessionLoraStrengthOverrides: nextStrengthOverrides,
        });
      } else {
        saveSharedSettings(
          {
            ...loadSettingsCache().shared,
            sessionLoraStrengthOverrides: nextStrengthOverrides,
          },
          { notify: false }
        );
        onSharedSettingsChange?.({ sessionLoraStrengthOverrides: nextStrengthOverrides });
      }
    },
    [
      applyWorkflowForModel,
      onModelChange,
      onSharedSettingsChange,
      setSessionActiveLoraIds,
      setSessionLoraStrengthOverrides,
      showAllModelsOverride,
    ]
  );
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
    workflowManualOverrideRef,
    shared,
    toolId,
    preferEditModels,
    queueQualityProfile,
    samplerPreset,
    resolutionSizeTier,
    onModelChange,
    onWorkflowPresetChange,
    onSharedSettingsChange,
    setSessionActiveLoraIds,
    setSessionLoraStrengthOverrides,
    setShowAllModelsOverride,
    setInventoryTick,
    inventoryTick,
    applyWorkflowForModel,
  };
}

export type SharedToolModelWorkflowCore = ReturnType<typeof useSharedToolModelWorkflowCore>;
