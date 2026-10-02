'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { prepareWorkflowJsonImport } from '@/lib/workflow-import';
import type { CustomWorkflowToken } from '@/lib/comfyui-config';
import { validateWorkflowJson, type WorkflowPlaceholderTokens } from '@/lib/comfyui-config';
import {
  COMFY_WORKFLOW_FILES_UPDATED_EVENT,
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
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { loadComfyUiSettings, syncLightningLoraLibraryEntry } from '@/lib/comfyui-settings';
import {
  buildControlNetWorkflowScaffold,
  buildFaceDetailerWorkflowScaffold,
  buildIdentityWorkflowScaffold,
  scaffoldWorkflowForModel,
  suggestedScaffoldName,
} from '@/lib/workflow-scaffold';
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

export function useComfyWorkflowLibraryCore({
  placeholderTokens,
  onStatus,
}: UseComfyWorkflowLibraryOptions) {
  const [files, setFiles] = useState<ComfyWorkflowFile[]>([]);
  const [serverFiles, setServerFiles] = useState<ServerWorkflowOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingJson, setEditingJson] = useState('');
  const [editingTokens, setEditingTokens] = useState<CustomWorkflowToken[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importErrorDetail, setImportErrorDetail] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [optimizePreviewSummary, setOptimizePreviewSummary] = useState<string | null>(null);
  const [presetPacks, setPresetPacks] = useState<WorkflowPresetPack[]>([]);
  const [packName, setPackName] = useState('');
  const [activePackId, setActivePackId] = useState('');
  const [bindingPreview, setBindingPreview] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setFiles(loadComfyWorkflowFiles());
    setSelectedId(getSelectedWorkflowFileId());
  }, []);

  // Restores from Recently deleted, pack installs and sync pulls save the library elsewhere.
  useEffect(() => {
    window.addEventListener(COMFY_WORKFLOW_FILES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COMFY_WORKFLOW_FILES_UPDATED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refresh();
      setPresetPacks(loadWorkflowPresetPacks());
      void fetch('/api/comfyui/workflows')
        .then(response => response.json())
        .then((data: { workflows?: ServerWorkflowOption[] }) => {
          setServerFiles(data.workflows ?? []);
        })
        .catch(() => {
          setServerFiles([]);
        });
    });
  }, [refresh]);

  const selectFile = useCallback(
    (id: string | undefined, label: string) => {
      setSelectedWorkflowFileId(id);
      setSelectedId(id);
      onStatus?.(
        id
          ? `Default workflow for Queue: “${label}”.`
          : 'Using fallback workflow (Settings / server env).'
      );
    },
    [onStatus]
  );

  useEffect(() => {
    const onHealthSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ workflowId?: string; action?: string }>).detail;
      const workflowId = detail?.workflowId?.trim();
      if (!workflowId) {
        return;
      }
      const file = loadComfyWorkflowFiles().find(entry => entry.id === workflowId);
      if (!file) {
        onStatus?.('Workflow no longer in library.');
        return;
      }
      selectFile(workflowId, file.name);
      if (detail?.action === 'optimize-workflow') {
        const result = optimizeWorkflowFileInLibrary({
          fileId: workflowId,
          tokens: placeholderTokens,
        });
        refresh();
        onStatus?.(result.message);
      }
    };
    window.addEventListener(WORKFLOW_HEALTH_SELECT_EVENT, onHealthSelect);
    return () => window.removeEventListener(WORKFLOW_HEALTH_SELECT_EVENT, onHealthSelect);
  }, [onStatus, placeholderTokens, refresh, selectFile]);

  const editingValidation = useMemo(() => {
    if (!editingJson.trim()) {
      return null;
    }
    return validateWorkflowJson(editingJson, placeholderTokens);
  }, [editingJson, placeholderTokens]);

  const editingNodeMappings = useMemo(() => {
    if (!editingJson.trim()) {
      return [];
    }
    return suggestWorkflowNodeMappings(editingJson);
  }, [editingJson]);

  const editingGraphInspect = useMemo(
    () => (editingJson.trim() ? inspectWorkflowGraphJson(editingJson) : null),
    [editingJson]
  );

  const startEdit = useCallback((file: ComfyWorkflowFile) => {
    setEditingId(file.id);
    setEditingName(file.name);
    setEditingJson(file.workflowJson);
    setEditingTokens(file.customTokens ?? []);
    setEditError(null);
  }, []);

  const persistEditingTokens = useCallback(
    (nextTokens: CustomWorkflowToken[]) => {
      setEditingTokens(nextTokens);
      if (!editingId) {
        return;
      }
      const existing = files.find(entry => entry.id === editingId);
      if (!existing) {
        return;
      }
      const saved = upsertComfyWorkflowFile({
        id: editingId,
        createdAt: existing.createdAt,
        filename: existing.filename,
        name: existing.name,
        workflowJson: existing.workflowJson,
        customTokens: nextTokens,
        lastOptimizedAt: existing.lastOptimizedAt,
        lastOptimizedHash: existing.lastOptimizedHash,
        lastOptimizedModel: existing.lastOptimizedModel,
        lastOptimizedProfile: existing.lastOptimizedProfile,
      });
      setFiles(previous => previous.map(entry => (entry.id === saved.id ? saved : entry)));
      const lightning = getWorkflowTokenValue(nextTokens, '{{LORA_LIGHTNING}}').trim();
      if (lightning) {
        syncLightningLoraLibraryEntry(lightning);
      }
    },
    [editingId, files]
  );

  const assignInferredModels = useCallback(
    (
      workflowId: string,
      models: ReturnType<typeof inferModelsFromWorkflowLabel>,
      overwrite = false
    ) => {
      if (models.length === 0) {
        onStatus?.('No suggested models for this workflow label.');
        return;
      }
      const shared = loadSettingsCache().shared;
      const nextMap = assignWorkflowToInferredModels(
        workflowId,
        models,
        shared.modelWorkflowMap,
        overwrite
      );
      saveSharedSettings({
        ...shared,
        modelWorkflowMap: nextMap,
        selectedWorkflowFileId: workflowId,
      });
      setSelectedWorkflowFileId(workflowId);
      setSelectedId(workflowId);
      onStatus?.(`Assigned workflow to ${models.length} model(s): ${models.join(', ')}`);
    },
    [onStatus]
  );

  const importFile = useCallback(
    async (file: File) => {
      setImportError(null);
      setImportErrorDetail(null);
      setImportNotice(null);
      try {
        const raw = await file.text();
        const prepared = prepareWorkflowJsonImport(raw, placeholderTokens);
        if (!prepared.ok || !prepared.workflowJson) {
          setImportError(prepared.error ?? 'Invalid workflow JSON.');
          setImportErrorDetail(prepared.errorDetail ?? null);
          return;
        }

        const saved = upsertComfyWorkflowFile({
          name:
            newName.trim() ||
            workflowFileNameFromPath(file.name) ||
            `Workflow ${new Date().toLocaleString()}`,
          filename: file.name,
          workflowJson: prepared.workflowJson,
          lastOptimizedAt: Date.now(),
          lastOptimizedHash: prepared.contentHash,
          lastOptimizedModel: prepared.optimizeModel,
          lastOptimizedProfile: prepared.optimizeProfile,
        });
        refresh();
        setNewName('');
        setSelectedWorkflowFileId(saved.id);
        setSelectedId(saved.id);
        startEdit(saved);
        const inferred = inferModelsFromWorkflowLabel({
          name: saved.name,
          filename: saved.filename,
        });
        setImportNotice(
          [prepared.notice, inferred.length ? `Suggested models: ${inferred.join(', ')}` : null]
            .filter(Boolean)
            .join(' · ') || null
        );
        onStatus?.(
          `Imported “${saved.filename ?? saved.name}” · ${prepared.placeholders?.positive ?? 0}× ${placeholderTokens.positive}`
        );
        markOnboardingWorkflowImported();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Import failed.';
        setImportError(message);
        onStatus?.(message);
      }
    },
    [newName, onStatus, placeholderTokens, refresh, startEdit]
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName('');
    setEditingJson('');
    setEditingTokens([]);
    setEditError(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId) {
      return;
    }

    const validation = validateWorkflowJson(editingJson, placeholderTokens);
    if (!validation.ok) {
      setEditError(validation.error ?? 'Invalid workflow JSON.');
      return;
    }

    const existing = files.find(entry => entry.id === editingId);
    const saved = upsertComfyWorkflowFile({
      id: editingId,
      createdAt: existing?.createdAt,
      filename: existing?.filename,
      name: editingName.trim() || existing?.name || 'Workflow',
      workflowJson: editingJson.trim(),
      customTokens: editingTokens,
      lastOptimizedAt: existing?.lastOptimizedAt,
      lastOptimizedHash: existing?.lastOptimizedHash,
      lastOptimizedModel: existing?.lastOptimizedModel,
      lastOptimizedProfile: existing?.lastOptimizedProfile,
    });
    refresh();
    cancelEdit();
    onStatus?.(`Saved workflow “${saved.name}”.`);
  }, [
    cancelEdit,
    editingId,
    editingJson,
    editingName,
    editingTokens,
    files,
    onStatus,
    placeholderTokens,
    refresh,
  ]);

  const createBlank = useCallback(() => {
    const template = `{
"6": {
"class_type": "CLIPTextEncode",
"inputs": {
"text": "${placeholderTokens.positive}",
"clip": ["4", 0]
    }
  }
}`;
    const saved = upsertComfyWorkflowFile({
      name: newName.trim() || `Workflow ${files.length + 1}`,
      workflowJson: template,
    });
    refresh();
    setNewName('');
    startEdit(saved);
    onStatus?.(`Created workflow “${saved.name}”. Edit the JSON below.`);
  }, [files.length, newName, onStatus, placeholderTokens.positive, refresh, startEdit]);
  return {
    setBindingPreview,
    setPresetPacks,
    setOptimizePreviewSummary,
    setImportNotice,
    placeholderTokens,
    onStatus,
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
  };
}

export type ComfyWorkflowLibraryCore = ReturnType<typeof useComfyWorkflowLibraryCore>;
export type ComfyWorkflowLibraryViewModel = ReturnType<typeof useComfyWorkflowLibraryCore>;
