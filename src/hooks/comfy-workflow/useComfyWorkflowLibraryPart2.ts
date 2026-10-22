'use client';

import { useCallback } from 'react';
import { type WorkflowPlaceholderTokens } from '@/lib/comfyui/config';
import {
  deleteComfyWorkflowFile,
  loadComfyWorkflowFiles,
  upsertComfyWorkflowFile,
} from '@/lib/comfyui/workflow-files';
import { clearSelectedWorkflowFileIfDeleted } from '@/lib/comfyui/runtime';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings/cache';
import { resolveQueueParams } from '@/lib/queue/params-settings';
import {
  buildControlNetWorkflowScaffold,
  buildIdentityWorkflowScaffold,
  scaffoldWorkflowForModel,
  suggestedScaffoldName,
} from '@/lib/workflow/scaffold';
import { ensureFaceDetailerLibraryPin } from '@/lib/face/detailer-setup';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui/object-info-cache';
import {
  optimizeWorkflowForQueue,
  suggestedOptimizedWorkflowName,
} from '@/lib/workflow/queue-optimizer';
import { optimizeAllWorkflowsInLibrary } from '@/lib/workflow/library-batch';
import { diffWorkflowNodes } from '@/lib/workflow/diff';
import { confirmAction } from '@/components/ui/ConfirmDialog';

export type UseComfyWorkflowLibraryOptions = {
  placeholderTokens: WorkflowPlaceholderTokens;
  onStatus?: (message: string) => void;
};

import type { ComfyWorkflowLibraryCore } from '@/hooks/comfy-workflow/useComfyWorkflowLibraryCore';

export function useComfyWorkflowLibraryPart2(ctx: ComfyWorkflowLibraryCore) {
  const {
    setOptimizePreviewSummary,
    setImportNotice,
    placeholderTokens,
    newName,
    setNewName,
    editingId,
    editingName,
    editingJson,
    refresh,
    startEdit,
    assignInferredModels,
    cancelEdit,
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
  }, [assignInferredModels, newName, onStatus, placeholderTokens, refresh, startEdit, setNewName]);

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
  }, [newName, onStatus, placeholderTokens, refresh, startEdit, setNewName]);

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
  }, [onStatus, refresh, startEdit, setNewName]);

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
    [newName, onStatus, refresh, startEdit, setNewName]
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
  }, [
    assignInferredModels,
    editingJson,
    newName,
    onStatus,
    placeholderTokens,
    refresh,
    startEdit,
    setNewName,
  ]);

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
  }, [editingJson, onStatus, placeholderTokens, setOptimizePreviewSummary]);

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
    setNewName,
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
    async (id: string) => {
      const shared = loadSettingsCache().shared;
      const pinned = Object.entries(shared.modelWorkflowMap ?? {})
        .filter(([, workflowId]) => workflowId?.trim() === id)
        .map(([model]) => model);
      if (
        pinned.length > 0 &&
        !(await confirmAction({
          title: 'Delete this pinned workflow?',
          body: `It is pinned for ${pinned.join(', ')}. Those go back to the automatic pick.`,
          confirmLabel: 'Delete',
          tone: 'danger',
        }))
      ) {
        return;
      }
      deleteComfyWorkflowFile(id, Date.now(), { unpinned: pinned });
      // A pin to a deleted file only broke queueing later — drop it with the file.
      if (pinned.length > 0) {
        const nextMap = { ...(shared.modelWorkflowMap ?? {}) };
        for (const model of pinned) delete nextMap[model];
        saveSharedSettings({ ...loadSettingsCache().shared, modelWorkflowMap: nextMap });
      }
      clearSelectedWorkflowFileIfDeleted(id);
      if (editingId === id) {
        cancelEdit();
      }
      refresh();
      onStatus?.(
        pinned.length > 0
          ? `Moved to Recently deleted — ${pinned.join(', ')} now use the automatic pick.`
          : 'Moved to Recently deleted — restore it from the bottom of the library.'
      );
    },
    [cancelEdit, editingId, onStatus, refresh]
  );

  const handlePackImport = useCallback(
    (summary: string) => {
      refresh();
      setImportNotice(summary);
      onStatus?.(summary);
    },
    [onStatus, refresh, setImportNotice]
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
