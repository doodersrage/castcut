'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { prepareWorkflowJsonImport } from '@/lib/workflow-import';
import type { CustomWorkflowToken } from '@/lib/comfyui-config';
import { validateWorkflowJson, type WorkflowPlaceholderTokens } from '@/lib/comfyui-config';
import {
  deleteComfyWorkflowFile,
  getWorkflowTokenValue,
  loadComfyWorkflowFiles,
  setWorkflowTokenValue,
  upsertComfyWorkflowFile,
  workflowFileNameFromPath,
  type ComfyWorkflowFile,
} from '@/lib/comfyui-workflow-files';
import {
  clearSelectedWorkflowFileIfDeleted,
  getSelectedWorkflowFileId,
  setSelectedWorkflowFileId,
} from '@/lib/comfyui-runtime';
import {
  addPresetsToPack,
  applyWorkflowPresetPackToLibrary,
  exportWorkflowPresetPack,
  importWorkflowPresetPack,
  loadWorkflowPresetPacks,
  upsertWorkflowPresetPack,
  workflowFileToPreset,
  type WorkflowPresetPack,
} from '@/lib/workflow-preset-packs';
import { suggestWorkflowNodeMappings } from '@/lib/workflow-node-mapper';
import { applyWorkflowNodeBindings, summarizeBindingChanges } from '@/lib/workflow-apply-bindings';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { markOnboardingWorkflowImported } from '@/lib/onboarding-hooks';
import { loadSettingsCache } from '@/lib/settings-cache';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { loadComfyUiSettings, syncLightningLoraLibraryEntry } from '@/lib/comfyui-settings';
import {
  buildControlNetWorkflowScaffold,
  buildIdentityWorkflowScaffold,
  scaffoldWorkflowForModel,
  suggestedScaffoldName,
} from '@/lib/workflow-scaffold';
import { ensureFaceDetailerLibraryPin } from '@/lib/face-detailer-setup';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import { inspectWorkflowGraphJson } from '@/lib/workflow-graph-inspect';
import { inferModelsFromWorkflowLabel } from '@/lib/workflow-category-defaults';
import { assignWorkflowToInferredModels } from '@/lib/model-workflow-map';
import {
  optimizeWorkflowForQueue,
  suggestedOptimizedWorkflowName,
} from '@/lib/workflow-queue-optimizer';
import {
  optimizeAllWorkflowsInLibrary,
  optimizeWorkflowFileInLibrary,
} from '@/lib/workflow-library-batch';
import { diffWorkflowNodes } from '@/lib/workflow-diff';
import { WORKFLOW_HEALTH_SELECT_EVENT } from '@/lib/workflow-health-audit';
import { downloadText } from '@/lib/download-text';
import type { ServerWorkflowOption } from '@/hooks/useComfyWorkflowSelection';

export type UseComfyWorkflowLibraryOptions = {
  placeholderTokens: WorkflowPlaceholderTokens;
  onStatus?: (message: string) => void;
};

import type { ComfyWorkflowLibraryCore } from '@/hooks/comfy-workflow/useComfyWorkflowLibraryCore';

export function useComfyWorkflowLibraryPart2(ctx: ComfyWorkflowLibraryCore) {
  const {
    setBindingPreview,
    setPresetPacks,
    setOptimizePreviewSummary,
    setImportNotice,
    placeholderTokens,
    files,
    serverFiles,
    selectedId,
    newName,
    setNewName,
    editingId,
    editingName,
    setEditingName,
    editingJson,
    setEditingJson,
    editingTokens,
    editError,
    setEditError,
    importError,
    importErrorDetail,
    importNotice,
    optimizePreviewSummary,
    presetPacks,
    packName,
    setPackName,
    activePackId,
    setActivePackId,
    bindingPreview,
    editingValidation,
    editingNodeMappings,
    editingGraphInspect,
    refresh,
    selectFile,
    startEdit,
    persistEditingTokens,
    assignInferredModels,
    importFile,
    cancelEdit,
    saveEdit,
    createBlank,
    onStatus,
  } = ctx;

  const createScaffoldForModel = useCallback(() => {
    const model = loadSettingsCache().shared.model;
    const result = scaffoldWorkflowForModel(model, {
      tokens: {
        positive: placeholderTokens.positive,
        negative: placeholderTokens.negative,
        seed: placeholderTokens.seed,
        width: placeholderTokens.width,
        height: placeholderTokens.height,
        cfg: placeholderTokens.cfg,
        steps: placeholderTokens.steps,
        sampler: placeholderTokens.sampler,
        scheduler: placeholderTokens.scheduler,
        shift: placeholderTokens.shift,
        fluxMaxShift: placeholderTokens.fluxMaxShift,
        fluxBaseShift: placeholderTokens.fluxBaseShift,
        denoise: placeholderTokens.denoise,
        inputImage: placeholderTokens.inputImage,
        maskImage: placeholderTokens.maskImage,
      },
    });
    const saved = upsertComfyWorkflowFile({
      name: newName.trim() || suggestedScaffoldName(model, 'template'),
      workflowJson: result.json,
    });
    refresh();
    setNewName('');
    startEdit(saved);
    assignInferredModels(saved.id, [model]);
    onStatus?.(
      `Created ${result.category} scaffold for ${model} · assigned to model map. ${result.notes[0] ?? ''}`.trim()
    );
  }, [assignInferredModels, newName, onStatus, placeholderTokens, refresh, startEdit]);

  const createControlNetScaffold = useCallback(() => {
    const result = buildControlNetWorkflowScaffold({
      positive: placeholderTokens.positive,
      negative: placeholderTokens.negative,
      seed: placeholderTokens.seed,
      width: placeholderTokens.width,
      height: placeholderTokens.height,
      cfg: placeholderTokens.cfg,
      steps: placeholderTokens.steps,
      sampler: placeholderTokens.sampler,
      scheduler: placeholderTokens.scheduler,
      denoise: placeholderTokens.denoise,
    });
    const saved = upsertComfyWorkflowFile({
      name: newName.trim() || 'ControlNet scaffold',
      workflowJson: result.json,
    });
    refresh();
    setNewName('');
    startEdit(saved);
    onStatus?.(`Created ControlNet scaffold. ${result.notes[0] ?? ''}`.trim());
  }, [newName, onStatus, placeholderTokens, refresh, startEdit]);

  const createFaceDetailerScaffold = useCallback(() => {
    void (async () => {
      const objectInfo = await fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
      const result = ensureFaceDetailerLibraryPin({
        availableNodeTypes: objectInfo?.nodeTypes,
        model: loadSettingsCache().shared.model,
      });
      refresh();
      setNewName('');
      if (result.workflowId) {
        const saved = loadComfyWorkflowFiles().find(file => file.id === result.workflowId);
        if (saved) {
          startEdit(saved);
        }
      }
      onStatus?.(result.message);
    })();
  }, [onStatus, refresh, startEdit]);

  const createIdentityScaffold = useCallback(
    (kind: 'instantid' | 'pulid') => {
      const result = buildIdentityWorkflowScaffold(kind);
      const label = kind === 'pulid' ? 'PuLID' : 'InstantID';
      const saved = upsertComfyWorkflowFile({
        name: newName.trim() || `${label} scaffold`,
        workflowJson: result.json,
      });
      refresh();
      setNewName('');
      startEdit(saved);
      onStatus?.(`Created ${label} BYO scaffold. ${result.notes[0] ?? ''}`.trim());
    },
    [newName, onStatus, refresh, startEdit]
  );

  const cloneAndBindWorkflow = useCallback(() => {
    const sourceJson = editingJson.trim();
    if (!sourceJson) {
      onStatus?.('Select a workflow to edit, or import JSON first, then use Clone & bind.');
      return;
    }
    const model = loadSettingsCache().shared.model;
    const result = scaffoldWorkflowForModel(model, {
      sourceJson,
      tokens: {
        positive: placeholderTokens.positive,
        negative: placeholderTokens.negative,
        seed: placeholderTokens.seed,
        width: placeholderTokens.width,
        height: placeholderTokens.height,
        cfg: placeholderTokens.cfg,
        steps: placeholderTokens.steps,
        sampler: placeholderTokens.sampler,
        scheduler: placeholderTokens.scheduler,
        shift: placeholderTokens.shift,
        fluxMaxShift: placeholderTokens.fluxMaxShift,
        fluxBaseShift: placeholderTokens.fluxBaseShift,
        denoise: placeholderTokens.denoise,
        inputImage: placeholderTokens.inputImage,
        maskImage: placeholderTokens.maskImage,
      },
    });
    const saved = upsertComfyWorkflowFile({
      name: newName.trim() || suggestedScaffoldName(model, 'clone'),
      workflowJson: result.json,
    });
    refresh();
    setNewName('');
    startEdit(saved);
    assignInferredModels(saved.id, [model]);
    onStatus?.(
      `Cloned workflow with ${result.bindingChanges} binding${result.bindingChanges === 1 ? '' : 's'} applied · assigned to ${model}.`
    );
  }, [assignInferredModels, editingJson, newName, onStatus, placeholderTokens, refresh, startEdit]);

  const previewOptimizeCopy = useCallback(() => {
    const sourceJson = editingJson.trim();
    if (!sourceJson) {
      onStatus?.('Open a workflow in Edit JSON first to preview optimize changes.');
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sourceJson) as Record<string, unknown>;
    } catch {
      onStatus?.('Workflow JSON is invalid — fix syntax before previewing optimize.');
      return;
    }

    const model = loadSettingsCache().shared.model;
    const shared = loadSettingsCache().shared;
    const queueParams = resolveQueueParams({
      model,
      qualityProfile: shared.queueQualityProfile,
    });
    const result = optimizeWorkflowForQueue({
      workflow: parsed,
      tokens: placeholderTokens,
      model,
      qualityProfile: shared.queueQualityProfile,
      upscaleModelFilename: queueParams.upscaleModelFilename,
      refinerCheckpointFilename: queueParams.refinerCheckpointFilename,
      enrichSdxlRefiner: shared.workflowSdxlRefinerEnrich !== false,
      enrichNeuralPolish: shared.workflowNeuralUpscalePolish !== false,
      enrichSharpen: shared.workflowSharpenAfterUpscale === true,
    });
    const nodeDiff = diffWorkflowNodes(sourceJson, result.workflowJson);
    const modified = nodeDiff.filter(entry => entry.change === 'modified').length;
    const added = nodeDiff.filter(entry => entry.change === 'added').length;
    setOptimizePreviewSummary(
      `Preview: ${result.bindingChanges.length} binding(s), ${added} node(s) added, ${modified} node(s) modified, ${result.audit.warnings.length} review note(s).`
    );
  }, [editingJson, onStatus, placeholderTokens]);

  const optimizeAndSaveCopy = useCallback(() => {
    const sourceJson = editingJson.trim();
    if (!sourceJson) {
      onStatus?.(
        'Open a workflow in Edit JSON first, or import JSON, then use Optimize & save copy.'
      );
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sourceJson) as Record<string, unknown>;
    } catch {
      onStatus?.('Workflow JSON is invalid — fix syntax before optimizing.');
      return;
    }

    const model = loadSettingsCache().shared.model;
    const shared = loadSettingsCache().shared;
    const queueParams = resolveQueueParams({
      model,
      qualityProfile: shared.queueQualityProfile,
    });
    const result = optimizeWorkflowForQueue({
      workflow: parsed,
      tokens: placeholderTokens,
      model,
      qualityProfile: shared.queueQualityProfile,
      upscaleModelFilename: queueParams.upscaleModelFilename,
      refinerCheckpointFilename: queueParams.refinerCheckpointFilename,
      enrichSdxlRefiner: shared.workflowSdxlRefinerEnrich !== false,
      enrichNeuralPolish: shared.workflowNeuralUpscalePolish !== false,
      enrichSharpen: shared.workflowSharpenAfterUpscale === true,
    });
    const baseName = editingName.trim() || newName.trim() || 'workflow';
    const saved = upsertComfyWorkflowFile({
      name: suggestedOptimizedWorkflowName(baseName),
      workflowJson: result.workflowJson,
      lastOptimizedAt: Date.now(),
      lastOptimizedHash: result.contentHash,
      lastOptimizedModel: String(model),
      lastOptimizedProfile: shared.queueQualityProfile,
    });
    refresh();
    setNewName('');
    startEdit(saved);
    assignInferredModels(saved.id, [model]);
    const bindingNote =
      result.bindingChanges.length > 0
        ? `${result.bindingChanges.length} binding(s) applied`
        : 'already bound';
    const warnNote =
      result.audit.warnings.length > 0 ? ` · ${result.audit.warnings.length} review note(s)` : '';
    onStatus?.(`Saved optimized copy (${bindingNote}${warnNote}) · assigned to ${model}.`);
  }, [
    assignInferredModels,
    editingJson,
    editingName,
    newName,
    onStatus,
    placeholderTokens,
    refresh,
    startEdit,
  ]);

  const optimizeAllInLibrary = useCallback(() => {
    const libraryFiles = loadComfyWorkflowFiles();
    if (libraryFiles.length === 0) {
      onStatus?.('Import or create workflows first, then optimize all.');
      return;
    }

    const result = optimizeAllWorkflowsInLibrary({ tokens: placeholderTokens });
    refresh();
    const warningNote =
      result.warnings.length > 0 ? ` · ${result.warnings.slice(0, 2).join(' · ')}` : '';
    const modelsNote =
      result.modelsUsed.length > 0
        ? ` · models: ${result.modelsUsed.slice(0, 4).join(', ')}${result.modelsUsed.length > 4 ? '…' : ''}`
        : '';
    onStatus?.(
      `Optimized ${result.updated} workflow(s) in place · ${result.skipped} unchanged or skipped${modelsNote}${warningNote}`
    );
  }, [onStatus, placeholderTokens, refresh]);

  const removeFile = useCallback(
    (id: string) => {
      deleteComfyWorkflowFile(id);
      clearSelectedWorkflowFileIfDeleted(id);
      if (editingId === id) {
        cancelEdit();
      }
      refresh();
      onStatus?.('Workflow file deleted.');
    },
    [cancelEdit, editingId, onStatus, refresh]
  );

  const handlePackImport = useCallback(
    (summary: string) => {
      refresh();
      setImportNotice(summary);
      onStatus?.(summary);
    },
    [onStatus, refresh]
  );

  return {
    createScaffoldForModel,
    createControlNetScaffold,
    createFaceDetailerScaffold,
    createIdentityScaffold,
    cloneAndBindWorkflow,
    previewOptimizeCopy,
    optimizeAndSaveCopy,
    optimizeAllInLibrary,
    removeFile,
    handlePackImport,
  };
}
